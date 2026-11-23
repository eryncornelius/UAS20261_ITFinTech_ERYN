import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import MerchantDashboard from '@/components/MerchantDashboard';

export default async function MerchantPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fmerchant');
  if (user.role !== 'merchant') redirect('/account');

  return <MerchantDashboard />;
}
