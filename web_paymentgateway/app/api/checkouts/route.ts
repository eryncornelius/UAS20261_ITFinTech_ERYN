import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Checkout, Payment, Product } from '@/lib/models';

const deliveryThreshold = 150000;
const deliveryFee = 8000;
const paymentMethods = ['QRIS', 'Transfer bank', 'Kartu debit / kredit'];
const xenditMethods: Record<string, string[]> = {
  QRIS: ['QRIS'],
  'Transfer bank': ['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA'],
  'Kartu debit / kredit': ['CREDIT_CARD'],
};

export async function POST(request: Request) {
  try {
    const secretKey = process.env.XENDIT_SECRET_KEY;
    const appUrl = process.env.APP_URL?.replace(/\/$/, '');
    if (!secretKey || !appUrl) {
      return Response.json(
        { error: 'XENDIT_SECRET_KEY dan APP_URL harus dikonfigurasi di environment server.' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const method = typeof body.paymentMethod === 'string' ? body.paymentMethod : '';
    const items = body.items;

    if (!customerName || customerName.length > 120 || !address || address.length > 500) {
      return Response.json({ error: 'Nama dan alamat pengiriman wajib diisi.' }, { status: 400 });
    }
    if (!paymentMethods.includes(method)) {
      return Response.json({ error: 'Metode pembayaran tidak valid.' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return Response.json({ error: 'Keranjang kosong atau tidak valid.' }, { status: 400 });
    }

    const quantities = new Map<string, number>();
    for (const item of items) {
      if (
        typeof item.productId !== 'string' ||
        !mongoose.isValidObjectId(item.productId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99
      ) {
        return Response.json({ error: 'Produk atau jumlah barang tidak valid.' }, { status: 400 });
      }
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
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
    const tax = Math.round(subtotal * 0.11);
    const shipping = subtotal > 0 && subtotal < deliveryThreshold ? deliveryFee : 0;
    const total = subtotal + tax + shipping;

    const checkout = await Checkout.create({
      customerName,
      address,
      items: checkoutItems,
      subtotal,
      tax,
      deliveryFee: shipping,
      total,
    });

    const payment = await Payment.create({
      checkoutId: checkout._id,
      method,
      amount: total,
      provider: 'xendit',
    });
    const externalId = `IM-${payment._id.toString()}`;
    payment.providerReference = externalId;
    await payment.save();

    const invoiceResponse = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_id: externalId,
        amount: total,
        currency: 'IDR',
        description: `Pesanan Indomie Corner ${checkout._id.toString()}`,
        invoice_duration: 86400,
        success_redirect_url: `${appUrl}/?checkout_id=${checkout._id.toString()}`,
        failure_redirect_url: `${appUrl}/?checkout_id=${checkout._id.toString()}&payment=failed`,
        payment_methods: xenditMethods[method],
        customer: { given_names: customerName },
        items: checkoutItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.unitPrice,
          category: item.category,
        })),
      }),
    });
    const invoice = await invoiceResponse.json();
    if (!invoiceResponse.ok || typeof invoice.invoice_url !== 'string' || typeof invoice.id !== 'string') {
      await Payment.updateOne({ _id: payment._id }, { $set: { status: 'failed' } });
      await Checkout.updateOne({ _id: checkout._id }, { $set: { status: 'cancelled' } });
      return Response.json(
        { error: invoice.message ?? 'Xendit gagal membuat invoice. Periksa konfigurasi API key dan metode pembayaran.' },
        { status: 502 },
      );
    }

    payment.providerInvoiceId = invoice.id;
    payment.invoiceUrl = invoice.invoice_url;
    await payment.save();

    return Response.json(
      {
        checkoutId: checkout._id.toString(),
        paymentId: payment._id.toString(),
        invoiceUrl: invoice.invoice_url,
        total,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkout gagal disimpan.';
    const status = message.includes('MONGODB_URI') || message.includes('XENDIT_SECRET_KEY') ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}