import { isSameOrigin } from '@/lib/auth';
import { isRecord, validateVoucherInput } from '@/lib/admin-vouchers';
import { authorizeRoles } from '@/lib/role-access';
import { AuditLog, Voucher } from '@/lib/models';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';

export async function GET() {
  try {
    const authorization = await authorizeRoles(['admin']);
    if (authorization.response) return authorization.response;
    await connectToDatabase();
    const vouchers = await Voucher.find().sort({ createdAt: -1 }).lean();
    return Response.json({
      vouchers: vouchers.map((voucher) => ({
        id: voucher._id.toString(),
        code: voucher.code,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        maxDiscount: voucher.maxDiscount ?? null,
        minimumSpend: voucher.minimumSpend,
        quota: voucher.quota,
        usedCount: voucher.usedCount,
        perUserLimit: voucher.perUserLimit,
        startsAt: voucher.startsAt,
        endsAt: voucher.endsAt,
        isActive: voucher.isActive,
      })),
    });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Voucher gagal dimuat.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return Response.json({ error: 'Konfigurasi voucher tidak valid.' }, { status: 400 });
  const input = validateVoucherInput(body);
  if (!input) return Response.json({ error: 'Konfigurasi voucher tidak valid.' }, { status: 400 });

  try {
    const authorization = await authorizeRoles(['admin']);
    if (authorization.response) return authorization.response;
    await connectToDatabase();
    const voucher = await Voucher.create({ ...input, createdBy: authorization.user.id });
    await AuditLog.create({
      actorId: authorization.user.id,
      action: 'voucher.created',
      entityType: 'voucher',
      entityId: voucher._id,
      details: { code: voucher.code, quota: voucher.quota },
    });
    return Response.json({ id: voucher._id.toString() }, { status: 201 });
  } catch (error) {
    const duplicate =
      typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
    if (duplicate) return Response.json({ error: 'Kode voucher sudah digunakan.' }, { status: 409 });
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Voucher tidak dapat dibuat.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}
