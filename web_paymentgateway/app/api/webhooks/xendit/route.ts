import mongoose from 'mongoose';
import { timingSafeEqual } from 'node:crypto';
import { Checkout, Payment } from '@/lib/models';
import { connectToDatabase } from '@/lib/mongodb';
import { releaseVoucherUsage } from '@/lib/vouchers';

type XenditInvoiceEvent = {
  id?: string;
  external_id?: string;
  status?: string;
  amount?: number;
  paid_amount?: number;
  paid_at?: string;
};

function validCallbackToken(received: string | null, expected: string) {
  if (!received) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const callbackToken = process.env.XENDIT_WEBHOOK_TOKEN;
  if (!callbackToken) {
    return Response.json({ error: 'XENDIT_WEBHOOK_TOKEN belum dikonfigurasi.' }, { status: 503 });
  }
  if (!validCallbackToken(request.headers.get('x-callback-token'), callbackToken)) {
    return Response.json({ error: 'Callback token tidak valid.' }, { status: 401 });
  }

  try {
    const event = (await request.json()) as XenditInvoiceEvent;
    if (!event.external_id || typeof event.status !== 'string') {
      return Response.json({ error: 'Payload invoice tidak lengkap.' }, { status: 400 });
    }

    await connectToDatabase();
    const payment = await Payment.findOne({
      provider: 'xendit',
      providerReference: event.external_id,
    });
    if (!payment) {
      return Response.json({ received: true, ignored: true, reason: 'payment_not_found' });
    }
    if (payment.providerInvoiceId && event.id && payment.providerInvoiceId !== event.id) {
      return Response.json({ error: 'ID invoice tidak cocok.' }, { status: 409 });
    }

    if (event.status === 'PAID' || event.status === 'SETTLED') {
      const paidAmount = event.paid_amount ?? event.amount;
      if (typeof paidAmount !== 'number' || paidAmount !== payment.amount) {
        return Response.json({ error: 'Nominal pembayaran tidak cocok.' }, { status: 422 });
      }

      if (payment.status === 'paid') return Response.json({ received: true, status: 'paid' });
      if (payment.status !== 'pending') {
        return Response.json({ error: 'Status pembayaran sudah tidak dapat diubah.' }, { status: 409 });
      }
      const paidPayment = await Payment.findOneAndUpdate(
        { _id: payment._id, status: 'pending' },
        {
          $set: {
            status: 'paid',
            paidAt: event.paid_at ? new Date(event.paid_at) : new Date(),
            providerInvoiceId: event.id ?? payment.providerInvoiceId,
          },
        },
        { new: true },
      );
      if (!paidPayment) {
        const latestPayment = await Payment.findById(payment._id).select('status').lean();
        return latestPayment?.status === 'paid'
          ? Response.json({ received: true, status: 'paid' })
          : Response.json({ error: 'Status pembayaran sudah tidak dapat diubah.' }, { status: 409 });
      }
      await Checkout.updateOne(
        { _id: payment.checkoutId, status: 'pending_payment' },
        { $set: { status: 'paid' } },
      );
      return Response.json({ received: true, status: 'paid' });
    }

    if (event.status === 'EXPIRED') {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const expiredPayment = await Payment.findOneAndUpdate(
            { _id: payment._id, status: 'pending' },
            { $set: { status: 'expired' } },
            { new: true, session },
          );
          if (!expiredPayment) return;

          const checkout = await Checkout.findOneAndUpdate(
            { _id: payment.checkoutId, status: 'pending_payment' },
            { $set: { status: 'cancelled' } },
            { new: true, session },
          );
          if (checkout?.voucherId && checkout.customerUserId) {
            await releaseVoucherUsage(checkout.voucherId, checkout.customerUserId, session);
          }
        });
      } finally {
        await session.endSession();
      }
      return Response.json({ received: true, status: 'expired' });
    }

    return Response.json({ received: true, ignored: true });
  } catch {
    return Response.json({ error: 'Webhook tidak dapat diproses.' }, { status: 500 });
  }
}