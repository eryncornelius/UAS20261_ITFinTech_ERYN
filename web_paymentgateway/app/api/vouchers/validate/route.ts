import { getCurrentUser, isSameOrigin } from '@/lib/auth';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';
import { validateVoucher } from '@/lib/vouchers';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user || user.role !== 'customer') {
    return Response.json({ error: 'Masuk sebagai customer untuk menggunakan voucher.' }, { status: 401 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (
    typeof body !== 'object' ||
    body === null ||
    !('code' in body) ||
    typeof body.code !== 'string' ||
    !('subtotal' in body) ||
    typeof body.subtotal !== 'number' ||
    !Number.isSafeInteger(body.subtotal) ||
    body.subtotal < 1
  ) {
    return Response.json({ error: 'Kode voucher atau subtotal tidak valid.' }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const result = await validateVoucher(body.code, body.subtotal, user.id);
    if (!result.valid) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({
      valid: true,
      code: result.voucher.code,
      discountAmount: result.discountAmount,
    });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Voucher gagal divalidasi.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}
