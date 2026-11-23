import { createUserSession, isSameOrigin } from '@/lib/auth';
import { verifyPassword } from '@/lib/auth-crypto';
import { connectToDatabase, isMongoUnavailable } from '@/lib/mongodb';
import { User } from '@/lib/models';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return Response.json({ error: 'Email dan kata sandi wajib diisi.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || email.length > 254 || !password || password.length > 128) {
    return Response.json({ error: 'Email dan kata sandi wajib diisi.' }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const user = await User.findOne({ email }).select('+passwordHash name email role isActive');
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      return Response.json({ error: 'Email atau kata sandi salah.' }, { status: 401 });
    }

    await createUserSession(user._id.toString());
    return Response.json({
      user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      {
        error: unavailable
          ? 'Login tidak dapat diproses karena MongoDB tidak tersedia. Periksa koneksi database.'
          : 'Login gagal diproses. Coba lagi.',
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}
