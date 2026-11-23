import { cookies } from 'next/headers';
import {
  deleteUserSession,
  isSameOrigin,
  sessionCookieName,
  setExpiredSessionCookie,
} from '@/lib/auth';
import { isMongoUnavailable } from '@/lib/mongodb';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }

  try {
    const token = (await cookies()).get(sessionCookieName)?.value;
    if (token) await deleteUserSession(token);
    await setExpiredSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      {
        error: unavailable
          ? 'Logout tidak dapat dikonfirmasi karena MongoDB tidak tersedia. Coba lagi.'
          : 'Logout gagal. Coba lagi.',
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}
