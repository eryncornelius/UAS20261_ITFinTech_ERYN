import mongoose from 'mongoose';
import { getCurrentUser, isSameOrigin } from '@/lib/auth';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';
import { Checkout, Payment, Product } from '@/lib/models';
import {
  calculateEstimatedServiceFee,
  getPaymentFeeConfig,
  PaymentFeeConfigurationError,
  type PaymentMethod,
} from '@/lib/payment-financials';
import { scoreOrderRisk } from '@/lib/risk';
import {
  releaseVoucherUsage,
  reserveVoucherUsage,
  VoucherReservationError,
} from '@/lib/vouchers';

const deliveryThreshold = 150000;
const deliveryFee = 8000;
const paymentMethods: PaymentMethod[] = ['QRIS', 'Transfer bank', 'Kartu debit / kredit'];
const xenditMethods: Record<PaymentMethod, string[]> = {
  QRIS: ['QRIS'],
  'Transfer bank': ['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA'],
  'Kartu debit / kredit': ['CREDIT_CARD'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPaymentMethod(value: string): value is PaymentMethod {
  return paymentMethods.some((method) => method === value);
}

async function failCheckout(
  checkoutId: string,
  paymentId: string,
  voucherId: string,
  customerId: string,
): Promise<void> {
  await Promise.all([
    Payment.updateOne(
      { _id: paymentId },
      { $set: { status: 'failed', serviceFee: 0, merchantNet: 0 } },
    ),
    Checkout.updateOne({ _id: checkoutId }, { $set: { status: 'cancelled' } }),
  ]);
  if (voucherId) {
    await releaseVoucherUsage(
      new mongoose.Types.ObjectId(voucherId),
      new mongoose.Types.ObjectId(customerId),
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Masuk sebagai customer untuk melanjutkan checkout.' }, { status: 401 });
    }
    if (user.role !== 'customer') {
      return Response.json({ error: 'Hanya customer yang dapat membuat pesanan.' }, { status: 403 });
    }

    const paymentMode = process.env.PAYMENT_MODE ?? 'xendit';
    if (paymentMode !== 'xendit' && paymentMode !== 'simulator') {
      return Response.json({ error: 'PAYMENT_MODE harus bernilai xendit atau simulator.' }, { status: 503 });
    }
    const secretKey = paymentMode === 'xendit' ? process.env.XENDIT_SECRET_KEY : undefined;
    const appUrl = paymentMode === 'xendit' ? process.env.APP_URL?.replace(/\/$/, '') : undefined;
    if (paymentMode === 'xendit') {
      if (!secretKey || !appUrl) {
        return Response.json(
          { error: 'XENDIT_SECRET_KEY dan APP_URL harus dikonfigurasi di environment server.' },
          { status: 503 },
        );
      }
      let parsedAppUrl: URL;
      try {
        parsedAppUrl = new URL(appUrl);
      } catch {
        return Response.json({ error: 'APP_URL harus berupa URL publik HTTPS.' }, { status: 503 });
      }
      if (parsedAppUrl.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(parsedAppUrl.hostname)) {
        return Response.json({ error: 'APP_URL harus berupa URL publik HTTPS, bukan localhost.' }, { status: 503 });
      }
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return Response.json({ error: 'Data checkout tidak valid.' }, { status: 400 });
    }
    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const method = typeof body.paymentMethod === 'string' ? body.paymentMethod : '';
    const voucherCode = typeof body.voucherCode === 'string' ? body.voucherCode.trim().toUpperCase() : '';
    const items = body.items;

    if (!customerName || customerName.length > 120 || !address || address.length > 500) {
      return Response.json({ error: 'Nama dan alamat pengiriman wajib diisi.' }, { status: 400 });
    }
    if (!isPaymentMethod(method)) {
      return Response.json({ error: 'Metode pembayaran tidak valid.' }, { status: 400 });
    }
    if (
      (body.voucherCode !== undefined && typeof body.voucherCode !== 'string') ||
      voucherCode.length > 30 ||
      (voucherCode && !/^[A-Z0-9_-]{3,30}$/.test(voucherCode))
    ) {
      return Response.json({ error: 'Kode voucher tidak valid.' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return Response.json({ error: 'Keranjang kosong atau tidak valid.' }, { status: 400 });
    }

    const quantities = new Map<string, number>();
    for (const item of items) {
      if (
        !isRecord(item) ||
        typeof item.productId !== 'string' ||
        !mongoose.isValidObjectId(item.productId) ||
        typeof item.quantity !== 'number' ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99
      ) {
        return Response.json({ error: 'Produk atau jumlah barang tidak valid.' }, { status: 400 });
      }
      const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
      if (quantity > 99) {
        return Response.json({ error: 'Jumlah maksimal per produk adalah 99.' }, { status: 400 });
      }
      quantities.set(item.productId, quantity);
    }

    await connectToDatabase();
    const productIds = [...quantities.keys()];
    const products = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();
    if (products.length !== productIds.length) {
      return Response.json({ error: 'Satu atau lebih produk tidak tersedia.' }, { status: 400 });
    }

    const checkoutItems = products.map((product) => {
      const quantity = quantities.get(product._id.toString())!;
      return {
        productId: product._id,
        name: product.name,
        category: product.category,
        image: product.image,
        quantity,
        unitPrice: product.price,
        lineTotal: product.price * quantity,
      };
    });
    const subtotal = checkoutItems.reduce((sum, item) => sum + item.lineTotal, 0);
    let discountAmount = 0;
    let serviceFee = 0;
    let tax = 0;
    const shipping = subtotal > 0 && subtotal < deliveryThreshold ? deliveryFee : 0;
    let total = 0;
    let riskScore = 0;
    let riskReasons: string[] = [];
    let reviewStatus: 'clear' | 'pending' = 'clear';
    let checkoutId = '';
    let paymentId = '';
    let externalId = '';
    let reservedVoucherId = '';
    const feeConfig = getPaymentFeeConfig();

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        let reservedVoucher:
          | Awaited<ReturnType<typeof reserveVoucherUsage>>
          | undefined;
        if (voucherCode) {
          reservedVoucher = await reserveVoucherUsage(
            voucherCode,
            new mongoose.Types.ObjectId(user.id),
            subtotal,
            session,
          );
          discountAmount = reservedVoucher.discountAmount;
          reservedVoucherId = reservedVoucher.voucher._id.toString();
        }

        tax = Math.round(((subtotal - discountAmount) * 11) / 100);
        total = subtotal - discountAmount + tax + shipping;
        serviceFee = calculateEstimatedServiceFee(method, total, feeConfig);
        const risk = await scoreOrderRisk(user.id, subtotal, discountAmount, session);
        riskScore = risk.score;
        riskReasons = risk.reasons;
        reviewStatus = risk.reviewStatus;

        const [checkout] = await Checkout.create(
          [
            {
              customerUserId: user.id,
              customerName,
              address,
              items: checkoutItems,
              subtotal,
              voucherId: reservedVoucher?.voucher._id,
              voucherCode: reservedVoucher?.voucher.code,
              discountAmount,
              tax,
              deliveryFee: shipping,
              total,
              riskScore,
              riskReasons,
              reviewStatus,
            },
          ],
          { session },
        );
        const [payment] = await Payment.create(
          [{
            checkoutId: checkout._id,
            method,
            amount: total,
            provider: paymentMode,
            serviceFee,
            merchantNet: 0,
            feeIsEstimate: true,
          }],
          { session },
        );
        checkoutId = checkout._id.toString();
        paymentId = payment._id.toString();
        externalId = `IM-${paymentId}`;
      });
    } catch (error) {
      if (error instanceof VoucherReservationError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      throw error;
    } finally {
      await session.endSession();
    }

    if (paymentMode === 'simulator') {
      return Response.json(
        {
          checkoutId,
          paymentId,
          invoiceUrl: `/payment/return?checkout_id=${encodeURIComponent(checkoutId)}`,
          total,
          discountAmount,
          serviceFee,
          merchantNet: 0,
          feeIsEstimate: true,
          provider: 'simulator',
          riskScore,
          reviewStatus,
        },
        { status: 201 },
      );
    }

    if (!secretKey || !appUrl) {
      throw new Error('XENDIT_SECRET_KEY dan APP_URL harus dikonfigurasi di environment server.');
    }

    let invoiceResponse: Response;
    try {
      invoiceResponse = await fetch('https://api.xendit.co/v2/invoices', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          external_id: externalId,
          amount: total,
          currency: 'IDR',
          description: `Pesanan Indomie Corner ${checkoutId}`,
          invoice_duration: 86400,
          success_redirect_url: `${appUrl}/payment/return?checkout_id=${checkoutId}`,
          failure_redirect_url: `${appUrl}/payment/return?checkout_id=${checkoutId}&payment=failed`,
          payment_methods: xenditMethods[method],
          customer: { given_names: customerName },
          items:
            discountAmount > 0
              ? [{ name: 'Pesanan Indomie Corner (termasuk voucher)', quantity: 1, price: total, category: 'Pesanan' }]
              : [
                  ...checkoutItems.map((item) => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.unitPrice,
                    category: item.category,
                  })),
                  ...(tax > 0 ? [{ name: 'Pajak', quantity: 1, price: tax, category: 'Biaya' }] : []),
                  ...(shipping > 0 ? [{ name: 'Ongkos kirim', quantity: 1, price: shipping, category: 'Pengiriman' }] : []),
                ],
        }),
      });
    } catch {
      await failCheckout(checkoutId, paymentId, reservedVoucherId, user.id);
      return Response.json({ error: 'Tidak dapat menghubungi Xendit. Coba lagi beberapa saat.' }, { status: 502 });
    }
    const invoice: unknown = await invoiceResponse.json().catch(() => null);
    if (
      !invoiceResponse.ok ||
      !isRecord(invoice) ||
      typeof invoice.invoice_url !== 'string' ||
      typeof invoice.id !== 'string'
    ) {
      await failCheckout(checkoutId, paymentId, reservedVoucherId, user.id);
      return Response.json(
        {
          error:
            isRecord(invoice) && typeof invoice.message === 'string'
              ? invoice.message
              : 'Xendit gagal membuat invoice. Periksa konfigurasi API key dan metode pembayaran.',
        },
        { status: 502 },
      );
    }

    await Payment.updateOne(
      { _id: paymentId },
      { $set: { providerInvoiceId: invoice.id, invoiceUrl: invoice.invoice_url, providerReference: externalId } },
    );

    return Response.json(
      {
        checkoutId,
        paymentId,
        invoiceUrl: invoice.invoice_url,
        total,
        discountAmount,
        serviceFee,
        merchantNet: 0,
        feeIsEstimate: true,
        provider: 'xendit',
        riskScore,
        reviewStatus,
      },
      { status: 201 },
    );
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    if (error instanceof PaymentFeeConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    const message = unavailable
      ? getMongoErrorMessage(error)
      : error instanceof Error && error.message.includes('XENDIT_SECRET_KEY')
        ? error.message
        : 'Checkout gagal disimpan. Coba lagi.';
    return Response.json({ error: message }, { status: unavailable || message.includes('XENDIT_SECRET_KEY') ? 503 : 500 });
  }
}