import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AdminDashboard from '@/components/AdminDashboard';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fadmin');
  if (user.role !== 'admin') redirect('/account');

  return <AdminDashboard />;
}
