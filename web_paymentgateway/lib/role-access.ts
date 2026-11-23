import { getCurrentUser } from '@/lib/auth';
import type { AuthUser, UserRole } from '@/lib/models';

type RoleAuthorization =
  | { user: AuthUser; response: null }
  | { user: null; response: Response };

export async function authorizeRoles(allowedRoles: UserRole[]): Promise<RoleAuthorization> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: Response.json({ error: 'Silakan masuk terlebih dahulu.' }, { status: 401 }),
    };
  }
  if (!allowedRoles.includes(user.role)) {
    return {
      user: null,
      response: Response.json({ error: 'Akses ditolak untuk peran akun ini.' }, { status: 403 }),
    };
  }
  return { user, response: null };
}
