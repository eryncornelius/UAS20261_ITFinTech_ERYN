'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Flame, ShieldCheck } from 'lucide-react';

type ReturnState = 'waiting' | 'paid' | 'failed';
type PaymentReturnStatusProps = {
  checkoutId: string;
  initialState: ReturnState;
  initialCustomerName: string;
  initialTotal: number | null;
  initialError: string;
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PaymentReturnStatus({
  checkoutId,
  initialState,
  initialCustomerName,
  initialTotal,
  initialError,
}: PaymentReturnStatusProps) {
  const [state, setState] = useState<ReturnState>(initialState);
  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [total, setTotal] = useState<number | null>(initialTotal);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    if (!checkoutId || initialState !== 'waiting') return;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function pollStatus() {
      try {
        const response = await fetch(`/api/checkouts/${encodeURIComponent(checkoutId)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Status pesanan tidak dapat dimuat.');
        if (!active) return;

        setCustomerName(typeof data.customerName === 'string' ? data.customerName : '');
        setTotal(typeof data.total === 'number' ? data.total : null);
        if (data.status === 'paid' && data.paymentStatus === 'paid') {
          setState('paid');
          return;
        }
        if (data.status === 'cancelled' || ['expired', 'failed'].includes(data.paymentStatus)) {
          setState('failed');
          setError('Pembayaran belum selesai. Silakan kembali ke toko dan buat pesanan baru.');
          return;
        }

        setState('waiting');
        timer = setTimeout(pollStatus, 3000);
      } catch (cause) {
        if (!active) return;
        setState('failed');
        setError(cause instanceof Error ? cause.message : 'Status pesanan tidak dapat dimuat.');
      }
    }

    void pollStatus();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [checkoutId, initialState]);

  const currentState = state;

  return (
    <main className="storefront">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Indomie Corner home">
          <span className="brand-mark"><Flame size={19} strokeWidth={1.8} /></span>
          <span className="brand-name">indomie<span>corner</span></span>
        </Link>
      </header>
      <div className="page-content">
        <div className="stepper" aria-label="Tahapan pemesanan">
          <span className="step-item complete"><span className="step-dot"><Check size={14} /></span><span className="step-name">Pilih produk</span><span className="step-rule" /></span>
          <span className="step-item complete"><span className="step-dot"><Check size={14} /></span><span className="step-name">Checkout</span><span className="step-rule" /></span>
          <span className={`step-item ${currentState === 'paid' ? 'complete' : 'current'}`}><span className="step-dot">{currentState === 'paid' ? <Check size={14} /> : '03'}</span><span className="step-name">Pembayaran</span></span>
        </div>

        <section className="success-view">
          <div className={`success-icon ${currentState === 'failed' ? 'payment-failed-icon' : ''}`}>
            {currentState === 'paid' ? <Check size={30} strokeWidth={1.8} /> : <ShieldCheck size={27} strokeWidth={1.8} />}
          </div>
          {currentState === 'paid' ? (
            <>
              <h1 className="return-heading">Pesananmu sedang<br /><em>kami siapkan.</em></h1>
              <p className="success-copy">Terima kasih, {customerName}. Pembayaran sebesar <strong>{formatRupiah(total ?? 0)}</strong> sudah diterima.</p>
              <div className="receipt-number">NO. PESANAN <strong>IM-{checkoutId.slice(-8).toUpperCase()}</strong></div>
            </>
          ) : currentState === 'failed' ? (
            <>
              <h1 className="return-heading">Status pembayaran<br /><em>belum tersedia.</em></h1>
              <p className="api-error" role="alert">{error || 'ID pesanan tidak ditemukan pada tautan kembali pembayaran.'}</p>
            </>
          ) : (
            <>
              <h1 className="return-heading">Menunggu konfirmasi<br /><em>pembayaran.</em></h1>
              <p className="success-copy">Kami sedang menunggu konfirmasi Xendit untuk pesanan {checkoutId.slice(-8).toUpperCase()}.</p>
              <p className="secure-note">Halaman ini akan diperbarui otomatis setelah webhook memverifikasi pembayaran.</p>
            </>
          )}
          <Link className="primary-button success-return" href="/">
            Kembali ke menu <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><Flame size={17} /></span><span className="brand-name">indomie<span>corner</span></span></div><span>Teman makan enak, kapan saja.</span><span className="footer-right">© 2026 INDOMIE CORNER</span></footer>
    </main>
  );
}
