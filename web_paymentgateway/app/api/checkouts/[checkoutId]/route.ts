import mongoose from 'mongoose';
import { getCurrentUser } from '@/lib/auth';
import { Checkout, Payment } from '@/lib/models';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';

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
    const payment = await Payment.findOne({ checkoutId }).select('status').lean();

    return Response.json({
      checkoutId,
      customerName: checkout.customerName,
      total: checkout.total,
      status: checkout.status,
      paymentStatus: payment?.status ?? 'pending',
    });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Status checkout tidak dapat dimuat.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}