import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { dashboardForRole, getCurrentUser } from '@/lib/auth';

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(dashboardForRole(user.role));

  return <AuthForm mode="register" />;
}
