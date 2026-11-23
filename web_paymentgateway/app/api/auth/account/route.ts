import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import {
  getCurrentUser,
  isSameOrigin,
  setExpiredSessionCookie,
} from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/auth-crypto';
import { AuditLog, Checkout, Session, User } from '@/lib/models';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';

class AccountDeletionBlockedError extends Error {
  constructor(readonly reason: 'active-orders' | 'last-admin') {
    super(reason);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return Response.json({ error: 'Masuk kembali untuk menghapus akun.' }, { status: 401 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body) || typeof body.password !== 'string' || body.password.length > 128) {
      return Response.json({ error: 'Konfirmasi kata sandi tidak valid.' }, { status: 400 });
    }

    await connectToDatabase();
    const user = await User.findOne({ _id: currentUser.id, isActive: true }).select('+passwordHash');
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return Response.json({ error: 'Kata sandi salah. Akun tidak dihapus.' }, { status: 403 });
    }

    const userId = user._id;
    const userIdString = userId.toString();
    const anonymizedPasswordHash = await hashPassword(randomBytes(32).toString('hex'));
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        if (user.role === 'admin') {
          const activeAdminCount = await User.countDocuments({
            role: 'admin',
            isActive: true,
          }).session(session);
          if (activeAdminCount <= 1) {
            throw new AccountDeletionBlockedError('last-admin');
          }
        }

        const activeOrder = await Checkout.exists({
          customerUserId: userId,
          $or: [
            { status: 'pending_payment' },
            { status: 'paid', fulfillmentStatus: { $nin: ['completed', 'cancelled'] } },
          ],
        }).session(session);
        if (activeOrder) {
          throw new AccountDeletionBlockedError('active-orders');
        }

        await Checkout.updateMany(
          { customerUserId: userId },
          {
            $set: {
              customerName: 'Pengguna dihapus',
              address: 'Data alamat dihapus',
            },
          },
          { session },
        );
        await AuditLog.create(
          [
            {
              actorId: userId,
              action: 'account.self_deleted',
              entityType: 'user',
              entityId: userId,
              details: { role: user.role },
            },
          ],
          { session },
        );

        const updateResult = await User.updateOne(
          { _id: userId, isActive: true },
          {
            $set: {
              name: 'Akun dihapus',
              email: `deleted-${userIdString}@deleted.invalid`,
              passwordHash: anonymizedPasswordHash,
              isActive: false,
            },
          },
          { session },
        );
        if (updateResult.modifiedCount !== 1) {
          throw new Error('Akun tidak lagi aktif.');
        }

        await Session.deleteMany({ userId }, { session });
      });
    } finally {
      await session.endSession();
    }

    await setExpiredSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AccountDeletionBlockedError) {
      if (error.reason === 'active-orders') {
        return Response.json(
          { error: 'Selesaikan atau batalkan pesanan yang masih aktif sebelum menghapus akun.' },
          { status: 409 },
        );
      }
      return Response.json(
        { error: 'Akun admin terakhir tidak dapat dihapus. Tambahkan admin lain terlebih dahulu.' },
        { status: 409 },
      );
    }

    const unavailable = isMongoUnavailable(error);
    return Response.json(
      {
        error: unavailable
          ? getMongoErrorMessage(error)
          : 'Penghapusan akun gagal diproses. Coba lagi.',
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}
