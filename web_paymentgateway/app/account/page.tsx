import { redirect } from 'next/navigation';
import AccountSettings from '@/components/AccountSettings';
import { getCurrentUser } from '@/lib/auth';

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <AccountSettings user={user} />;
}
