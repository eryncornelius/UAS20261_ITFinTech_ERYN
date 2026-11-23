import { createUserSession, isSameOrigin } from '@/lib/auth';
import { hashPassword } from '@/lib/auth-crypto';
import { connectToDatabase, isMongoUnavailable } from '@/lib/mongodb';
import { User } from '@/lib/models';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDuplicateEmail(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return Response.json({ error: 'Data pendaftaran tidak valid.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (name.length < 2 || name.length > 120) {
    return Response.json({ error: 'Nama harus terdiri dari 2–120 karakter.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return Response.json({ error: 'Masukkan alamat email yang valid.' }, { status: 400 });
  }
  if (password.length < 12 || password.length > 128) {
    return Response.json({ error: 'Kata sandi harus terdiri dari 12–128 karakter.' }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const user = await User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: 'customer',
    });
    await createUserSession(user._id.toString());

    return Response.json(
      { user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role } },
      { status: 201 },
    );
  } catch (error) {
    if (isDuplicateEmail(error)) {
      return Response.json({ error: 'Email tersebut sudah terdaftar.' }, { status: 409 });
    }

    const unavailable = isMongoUnavailable(error);
    return Response.json(
      {
        error: unavailable
          ? 'Pendaftaran tidak dapat diproses karena MongoDB tidak tersedia. Periksa koneksi database.'
          : 'Pendaftaran gagal disimpan. Coba lagi.',
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}
