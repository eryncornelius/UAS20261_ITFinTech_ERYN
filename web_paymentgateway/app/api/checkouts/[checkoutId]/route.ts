import mongoose from 'mongoose';
import { Checkout, Payment } from '@/lib/models';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ checkoutId: string }> },
) {
  try {
    const { checkoutId } = await params;
    if (!mongoose.isValidObjectId(checkoutId)) {
      return Response.json({ error: 'ID checkout tidak valid.' }, { status: 400 });
    }

    await connectToDatabase();
    const checkout = await Checkout.findById(checkoutId).select('customerName total status').lean();
    if (!checkout) return Response.json({ error: 'Checkout tidak ditemukan.' }, { status: 404 });
    const payment = await Payment.findOne({ checkoutId }).select('status').lean();

    return Response.json({
      checkoutId,
      customerName: checkout.customerName,
      total: checkout.total,
      status: checkout.status,
      paymentStatus: payment?.status ?? 'pending',
    });
  } catch {
    return Response.json({ error: 'Status checkout tidak dapat dimuat.' }, { status: 500 });
  }
}