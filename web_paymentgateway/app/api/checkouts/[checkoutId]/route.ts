import mongoose from 'mongoose';
import { getCurrentUser, isSameOrigin } from '@/lib/auth';
import { AuditLog, Checkout, Payment } from '@/lib/models';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';
import { calculateMerchantNet } from '@/lib/payment-financials';
import { canTransitionSimulatedPayment, type SimulatedPaymentStatus } from '@/lib/payment-simulator';
import { releaseVoucherUsage } from '@/lib/vouchers';

class PaymentSimulatorRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PaymentSimulatorRequestError';
  }
}

function isSimulatedPaymentStatus(value: unknown): value is SimulatedPaymentStatus {
  return value === 'pending' || value === 'paid' || value === 'failed' || value === 'refunded';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ checkoutId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Masuk untuk melihat status pesanan.' }, { status: 401 });
    }
    if (user.role !== 'customer') {
      return Response.json({ error: 'Akses status pesanan ditolak.' }, { status: 403 });
    }

    const { checkoutId } = await params;
    if (!mongoose.isValidObjectId(checkoutId)) {
      return Response.json({ error: 'ID checkout tidak valid.' }, { status: 400 });
    }

    await connectToDatabase();
    const checkout = await Checkout.findOne({
      _id: checkoutId,
      customerUserId: user.id,
    })
      .select('customerName total status')
      .lean();
    if (!checkout) return Response.json({ error: 'Checkout tidak ditemukan.' }, { status: 404 });
    const payment = await Payment.findOne({ checkoutId })
      .select('status provider serviceFee merchantNet feeIsEstimate')
      .lean();

    return Response.json({
      checkoutId,
      customerName: checkout.customerName,
      total: checkout.total,
      status: checkout.status,
      paymentStatus: payment?.status ?? 'pending',
      paymentProvider: payment?.provider ?? 'xendit',
      serviceFee: payment?.serviceFee ?? 0,
      merchantNet: payment?.merchantNet ?? 0,
      feeIsEstimate: payment?.feeIsEstimate ?? true,
    });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Status checkout tidak dapat dimuat.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ checkoutId: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }
  if (process.env.PAYMENT_MODE !== 'simulator') {
    return Response.json({ error: 'Simulator pembayaran tidak sedang diaktifkan.' }, { status: 409 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (
    typeof body !== 'object' ||
    body === null ||
    !('status' in body) ||
    !isSimulatedPaymentStatus(body.status)
  ) {
    return Response.json({ error: 'Status simulasi pembayaran tidak valid.' }, { status: 400 });
  }
  const requestedStatus = body.status;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Masuk untuk mengubah status pembayaran.' }, { status: 401 });
    }
    if (user.role !== 'customer') {
      return Response.json({ error: 'Akses simulasi pembayaran ditolak.' }, { status: 403 });
    }

    const { checkoutId } = await params;
    if (!mongoose.isValidObjectId(checkoutId)) {
      return Response.json({ error: 'ID checkout tidak valid.' }, { status: 400 });
    }

    await connectToDatabase();
    const session = await mongoose.startSession();
    let responseData: {
      status: SimulatedPaymentStatus;
      checkoutStatus: string;
      serviceFee: number;
      merchantNet: number;
      feeIsEstimate: boolean;
    } | null = null;
    try {
      await session.withTransaction(async () => {
        const checkout = await Checkout.findOne({
          _id: checkoutId,
          customerUserId: user.id,
        }).session(session);
        if (!checkout) throw new PaymentSimulatorRequestError('Checkout tidak ditemukan.', 404);

        const payment = await Payment.findOne({ checkoutId, provider: 'simulator' }).session(session);
        if (!payment) {
          throw new PaymentSimulatorRequestError('Pembayaran ini bukan transaksi simulator.', 409);
        }

        const nextStatus = requestedStatus;
        if (!isSimulatedPaymentStatus(payment.status)) {
          throw new PaymentSimulatorRequestError('Status pembayaran tersimpan tidak valid.', 409);
        }
        const currentStatus = payment.status;
        let resultingStatus = currentStatus;
        if (!canTransitionSimulatedPayment(currentStatus, nextStatus)) {
          throw new PaymentSimulatorRequestError('Perubahan status pembayaran tidak diizinkan.', 409);
        }
        if (nextStatus === 'refunded' && checkout.fulfillmentStatus !== 'new') {
          throw new PaymentSimulatorRequestError(
            'Refund simulasi hanya tersedia sebelum pesanan mulai disiapkan.',
            409,
          );
        }

        if (currentStatus !== nextStatus) {
          if (nextStatus === 'paid') {
            if (checkout.status !== 'pending_payment') {
              throw new PaymentSimulatorRequestError('Checkout tidak lagi menunggu pembayaran.', 409);
            }
            payment.paidAt = new Date();
            checkout.status = 'paid';
          } else if (nextStatus === 'failed') {
            if (checkout.status !== 'pending_payment') {
              throw new PaymentSimulatorRequestError('Checkout tidak lagi menunggu pembayaran.', 409);
            }
            payment.serviceFee = 0;
            checkout.status = 'cancelled';
            if (checkout.voucherId && checkout.customerUserId) {
              await releaseVoucherUsage(checkout.voucherId, checkout.customerUserId, session);
            }
          } else if (nextStatus === 'refunded') {
            if (checkout.status !== 'paid') {
              throw new PaymentSimulatorRequestError('Hanya pembayaran berhasil yang dapat direfund.', 409);
            }
            payment.refundedAt = new Date();
            checkout.status = 'refunded';
            checkout.fulfillmentStatus = 'cancelled';
          }

          payment.status = nextStatus;
          resultingStatus = nextStatus;
          payment.merchantNet = calculateMerchantNet(payment.amount, payment.serviceFee, nextStatus);
          await payment.save({ session });
          await checkout.save({ session });
          await AuditLog.create(
            [{
              actorId: user.id,
              action: 'payment.simulator.status_changed',
              entityType: 'payment',
              entityId: payment._id,
              details: { from: currentStatus, to: nextStatus, serviceFeeEstimate: payment.serviceFee },
            }],
            { session },
          );
        }

        responseData = {
          status: resultingStatus,
          checkoutStatus: checkout.status,
          serviceFee: payment.serviceFee,
          merchantNet: payment.merchantNet,
          feeIsEstimate: payment.feeIsEstimate,
        };
      });
    } finally {
      await session.endSession();
    }

    if (!responseData) throw new Error('Status simulasi pembayaran tidak dapat dimuat.');
    return Response.json(responseData);
  } catch (error) {
    if (error instanceof PaymentSimulatorRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Status simulasi pembayaran gagal diperbarui.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}