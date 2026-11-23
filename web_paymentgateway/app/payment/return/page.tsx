import { Checkout, Payment } from '@/lib/models';
import { getCurrentUser } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import PaymentReturnStatus from './PaymentReturnStatus';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ checkout_id?: string | string[] }>;
};

export default async function PaymentReturnPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const checkoutId = typeof params.checkout_id === 'string' ? params.checkout_id : '';
  const user = await getCurrentUser();
  if (!user) {
    const next = `/payment/return?checkout_id=${encodeURIComponent(checkoutId)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (user.role !== 'customer') redirect('/account');

  let initialState: 'waiting' | 'paid' | 'failed' = checkoutId ? 'waiting' : 'failed';
  let initialCustomerName = '';
  let initialTotal: number | null = null;
  let initialError = checkoutId ? '' : 'ID pesanan tidak ditemukan pada tautan kembali pembayaran.';

  if (checkoutId) {
    try {
      await connectToDatabase();
      const checkout = await Checkout.findOne({
        _id: checkoutId,
        customerUserId: user.id,
      })
        .select('customerName total status')
        .lean();
      if (!checkout) {
        initialState = 'failed';
        initialError = 'Pesanan tidak ditemukan di database.';
      } else {
        initialCustomerName = checkout.customerName;
        initialTotal = checkout.total;
        const paidPayment = await Payment.exists({ checkoutId: checkout._id, status: 'paid' });
        if (checkout.status === 'paid' && paidPayment) initialState = 'paid';
        else if (checkout.status === 'cancelled') {
          initialState = 'failed';
          initialError = 'Pembayaran belum selesai. Silakan kembali ke toko dan buat pesanan baru.';
        }
      }
    } catch {
      initialError = 'Status belum dapat dimuat. Halaman akan mencoba memeriksa ulang.';
    }
  }

  return (
    <PaymentReturnStatus
      checkoutId={checkoutId}
      initialState={initialState}
      initialCustomerName={initialCustomerName}
      initialTotal={initialTotal}
      initialError={initialError}
    />
  );
}
