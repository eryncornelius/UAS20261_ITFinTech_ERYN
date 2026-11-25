import mongoose from 'mongoose';
import { isSameOrigin } from '@/lib/auth';
import { authorizeRoles } from '@/lib/role-access';
import { AuditLog, Checkout } from '@/lib/models';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ checkoutId: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (
    !isRecord(body) ||
    (body.decision !== 'approved' && body.decision !== 'rejected') ||
    (body.note !== undefined && (typeof body.note !== 'string' || body.note.trim().length > 500))
  ) {
    return Response.json({ error: 'Keputusan tinjauan tidak valid.' }, { status: 400 });
  }

  try {
    const authorization = await authorizeRoles(['admin']);
    if (authorization.response) return authorization.response;
    const { checkoutId } = await params;
    if (!mongoose.isValidObjectId(checkoutId)) {
      return Response.json({ error: 'ID pesanan tidak valid.' }, { status: 400 });
    }

    await connectToDatabase();
    const session = await mongoose.startSession();
    let updated = false;
    try {
      await session.withTransaction(async () => {
        const checkout = await Checkout.findOneAndUpdate(
          { _id: checkoutId, reviewStatus: 'pending' },
          {
            $set: {
              reviewStatus: body.decision,
              reviewedBy: authorization.user.id,
              reviewedAt: new Date(),
              reviewNote: typeof body.note === 'string' ? body.note.trim() : '',
            },
          },
          { new: true, session },
        );
        if (!checkout) return;

        await AuditLog.create(
          [{
            actorId: authorization.user.id,
            action: `risk_review.${body.decision}`,
            entityType: 'checkout',
            entityId: checkout._id,
            details: {
              previousDecision: 'pending',
              decision: body.decision,
              riskScore: checkout.riskScore,
              note: checkout.reviewNote,
            },
          }],
          { session },
        );
        updated = true;
      });
    } finally {
      await session.endSession();
    }

    if (!updated) {
      return Response.json({ error: 'Order tidak ditemukan atau sudah ditinjau.' }, { status: 409 });
    }

    return Response.json({
      ok: true,
      note: 'Keputusan tinjauan tercatat. Pembatalan pembayaran/refund harus diproses terpisah.',
    });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Keputusan tinjauan gagal disimpan.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}
