import mongoose from 'mongoose';
import { isSameOrigin } from '@/lib/auth';
import { authorizeRoles } from '@/lib/role-access';
import { isRecord, validateVoucherInput } from '@/lib/admin-vouchers';
import { AuditLog, Voucher } from '@/lib/models';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ voucherId: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return Response.json({ error: 'Konfigurasi voucher tidak valid.' }, { status: 400 });
  }
  const input = validateVoucherInput(body);
  if (!input) return Response.json({ error: 'Konfigurasi voucher tidak valid.' }, { status: 400 });

  try {
    const authorization = await authorizeRoles(['admin']);
    if (authorization.response) return authorization.response;
    const { voucherId } = await params;
    if (!mongoose.isValidObjectId(voucherId)) {
      return Response.json({ error: 'ID voucher tidak valid.' }, { status: 400 });
    }
    await connectToDatabase();
    const voucher = await Voucher.findById(voucherId);
    if (!voucher) return Response.json({ error: 'Voucher tidak ditemukan.' }, { status: 404 });
    if (input.quota < voucher.usedCount) {
      return Response.json({ error: 'Kuota baru tidak boleh lebih kecil dari jumlah klaim yang sudah digunakan.' }, { status: 400 });
    }
    const changedCode = voucher.code !== input.code;
    Object.assign(voucher, input);
    await voucher.save();
    await AuditLog.create({
      actorId: authorization.user.id,
      action: 'voucher.updated',
      entityType: 'voucher',
      entityId: voucher._id,
      details: { changedCode, code: voucher.code, fields: Object.keys(input) },
    });
    return Response.json({ ok: true });
  } catch (error) {
    const duplicate =
      typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
    if (duplicate) return Response.json({ error: 'Kode voucher sudah digunakan.' }, { status: 409 });
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Voucher gagal diperbarui.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ voucherId: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || !('isActive' in body) || typeof body.isActive !== 'boolean') {
    return Response.json({ error: 'Status voucher tidak valid.' }, { status: 400 });
  }

  try {
    const authorization = await authorizeRoles(['admin']);
    if (authorization.response) return authorization.response;
    const { voucherId } = await params;
    if (!mongoose.isValidObjectId(voucherId)) {
      return Response.json({ error: 'ID voucher tidak valid.' }, { status: 400 });
    }
    await connectToDatabase();
    const voucher = await Voucher.findByIdAndUpdate(
      voucherId,
      { $set: { isActive: body.isActive } },
      { new: true },
    );
    if (!voucher) return Response.json({ error: 'Voucher tidak ditemukan.' }, { status: 404 });
    await AuditLog.create({
      actorId: authorization.user.id,
      action: body.isActive ? 'voucher.activated' : 'voucher.deactivated',
      entityType: 'voucher',
      entityId: voucher._id,
      details: { code: voucher.code },
    });
    return Response.json({ ok: true });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Status voucher gagal diperbarui.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}
