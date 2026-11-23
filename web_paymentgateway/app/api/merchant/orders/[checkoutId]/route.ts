import mongoose from 'mongoose';
import { isSameOrigin } from '@/lib/auth';
import { AuditLog, Checkout } from '@/lib/models';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';
import { authorizeRoles } from '@/lib/role-access';

const transitions: Record<string, string[]> = {
  new: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const allowedStatuses = ['preparing', 'ready', 'completed', 'cancelled'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ checkoutId: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (
    typeof body !== 'object' ||
    body === null ||
    !('fulfillmentStatus' in body) ||
    typeof body.fulfillmentStatus !== 'string' ||
    !allowedStatuses.includes(body.fulfillmentStatus)
  ) {
    return Response.json({ error: 'Status pemenuhan pesanan tidak valid.' }, { status: 400 });
  }

  try {
    const authorization = await authorizeRoles(['merchant']);
    if (authorization.response) return authorization.response;
    const { checkoutId } = await params;
    if (!mongoose.isValidObjectId(checkoutId)) {
      return Response.json({ error: 'ID pesanan tidak valid.' }, { status: 400 });
    }

    await connectToDatabase();
    const checkout = await Checkout.findById(checkoutId);
    if (!checkout) return Response.json({ error: 'Pesanan tidak ditemukan.' }, { status: 404 });
    const nextStatus = body.fulfillmentStatus;
    const currentStatus = checkout.fulfillmentStatus ?? 'new';
    if (!transitions[currentStatus]?.includes(nextStatus)) {
      return Response.json({ error: 'Perubahan status pesanan tidak diizinkan.' }, { status: 409 });
    }
    if (nextStatus !== 'cancelled' && checkout.status !== 'paid') {
      return Response.json({ error: 'Pesanan hanya dapat diproses setelah pembayaran berhasil.' }, { status: 409 });
    }

    checkout.fulfillmentStatus = nextStatus as typeof checkout.fulfillmentStatus;
    await checkout.save();
    await AuditLog.create({
      actorId: authorization.user.id,
      action: 'order.fulfillment.updated',
      entityType: 'checkout',
      entityId: checkout._id,
      details: { from: currentStatus, to: nextStatus },
    });
    return Response.json({ ok: true, fulfillmentStatus: nextStatus });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Status pesanan gagal diperbarui.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}
