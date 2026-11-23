import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { dashboardForRole, getCurrentUser } from '@/lib/auth';

function safeNextPath(path: string | undefined): string | undefined {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return undefined;
  return path;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(dashboardForRole(user.role));

  const { next } = await searchParams;
  return <AuthForm mode="login" nextPath={safeNextPath(next)} />;
}
