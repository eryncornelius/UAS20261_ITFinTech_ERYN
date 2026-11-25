import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { connectToDatabase } from '@/lib/mongodb';
import { Session, User, type AuthUser, type UserRole } from '@/lib/models';
import { hashSessionToken } from '@/lib/auth-crypto';

export const sessionCookieName = 'indomie_session';
const sessionDurationSeconds = 60 * 60 * 24 * 7;

export function isUserRole(value: unknown): value is UserRole {
  return value === 'customer' || value === 'merchant' || value === 'admin';
}

export function dashboardForRole(role: UserRole): string {
  if (role === 'merchant') return '/merchant';
  if (role === 'admin') return '/admin';
  return '/';
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  const allowedOrigins = new Set([new URL(request.url).origin]);
  const appUrl = process.env.APP_URL;
  if (appUrl) allowedOrigins.add(new URL(appUrl).origin);

  return allowedOrigins.has(origin);
}

export async function createUserSession(userId: string): Promise<void> {
  await connectToDatabase();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);
  await Session.create({ tokenHash: hashSessionToken(token), userId, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;

  await connectToDatabase();
  const session = await Session.findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: new Date() },
  })
    .select('userId')
    .lean();
  if (!session) return null;

  const user = await User.findById(session.userId).select('name email role isActive').lean();
  if (!user || !user.isActive || !isUserRole(user.role)) return null;

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function deleteUserSession(token: string): Promise<void> {
  await connectToDatabase();
  await Session.deleteOne({ tokenHash: hashSessionToken(token) });
}

export async function setExpiredSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
}
