'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

type Voucher = {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  maxDiscount: number | null;
  minimumSpend: number;
  quota: number;
  usedCount: number;
  perUserLimit: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

type Review = {
  checkoutId: string;
  customerName: string;
  items: string[];
  subtotal: number;
  discountAmount: number;
  voucherCode: string;
  total: number;
  checkoutStatus: string;
  paymentStatus: string;
  riskScore: number;
  reasons: string[];
  createdAt: string;
};

type VoucherForm = {
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  maxDiscount: string;
  minimumSpend: string;
  quota: string;
  perUserLimit: string;
  startsAt: string;
  endsAt: string;
};

const emptyVoucherForm = (): VoucherForm => ({
  code: '',
  discountType: 'percent',
  discountValue: '',
  maxDiscount: '',
  minimumSpend: '0',
  quota: '100',
  perUserLimit: '1',
  startsAt: toLocalDateTime(new Date()),
  endsAt: toLocalDateTime(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
});

function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatStatus(value: string) {
  const labels: Record<string, string> = {
    pending_payment: 'Menunggu pembayaran',
    pending: 'Menunggu',
    paid: 'Berhasil',
    failed: 'Gagal',
    expired: 'Kedaluwarsa',
    refunded: 'Refund',
    cancelled: 'Dibatalkan',
  };
  return labels[value] ?? value;
}

function riskLevel(score: number) {
  return score >= 70 ? 'Tinggi' : 'Perlu ditinjau';
}

function toLocalDateTime(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Permintaan gagal.');
  return data;
}

export default function AdminDashboard() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [form, setForm] = useState<VoucherForm>(emptyVoucherForm);
  const [editingId, setEditingId] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState('');

  async function loadDashboard() {
    setError('');
    const [voucherData, reviewData] = await Promise.all([
      requestJson('/api/admin/vouchers'),
      requestJson('/api/admin/reviews'),
    ]);
    setVouchers(voucherData.vouchers);
    setReviews(reviewData.reviews);
    setIsLoading(false);
  }

  useEffect(() => {
    let active = true;
    Promise.all([requestJson('/api/admin/vouchers'), requestJson('/api/admin/reviews')])
      .then(([voucherData, reviewData]) => {
        if (!active) return;
        setVouchers(voucherData.vouchers);
        setReviews(reviewData.reviews);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Dashboard gagal dimuat.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function editVoucher(voucher: Voucher) {
    setEditingId(voucher.id);
    setForm({
      code: voucher.code,
      discountType: voucher.discountType,
      discountValue: String(voucher.discountValue),
      maxDiscount: voucher.maxDiscount === null ? '' : String(voucher.maxDiscount),
      minimumSpend: String(voucher.minimumSpend),
      quota: String(voucher.quota),
      perUserLimit: String(voucher.perUserLimit),
      startsAt: toLocalDateTime(voucher.startsAt),
      endsAt: toLocalDateTime(voucher.endsAt),
    });
    document.getElementById('admin-voucher-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveVoucher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...form,
      discountValue: Number(form.discountValue),
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
      minimumSpend: Number(form.minimumSpend),
      quota: Number(form.quota),
      perUserLimit: Number(form.perUserLimit),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    };
    try {
      await requestJson(
        editingId ? `/api/admin/vouchers/${editingId}` : '/api/admin/vouchers',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      setForm(emptyVoucherForm());
      setEditingId('');
      setNotice(editingId ? 'Voucher diperbarui.' : 'Voucher dibuat.');
      await loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Voucher gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleVoucher(voucher: Voucher) {
    setError('');
    try {
      await requestJson(`/api/admin/vouchers/${voucher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !voucher.isActive }),
      });
      setNotice(voucher.isActive ? 'Voucher dinonaktifkan.' : 'Voucher diaktifkan.');
      await loadDashboard();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Status voucher gagal diperbarui.');
    }
  }

  async function reviewOrder(checkoutId: string, decision: 'approved' | 'rejected') {
    if (reviewingId) return;
    setReviewingId(checkoutId);
    setError('');
    setNotice('');
    try {
      const data = await requestJson(`/api/admin/reviews/${checkoutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: reviewNotes[checkoutId] ?? '' }),
      });
      setNotice(data.note ?? 'Keputusan tinjauan tersimpan.');
      await loadDashboard();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Tinjauan gagal disimpan.');
    } finally {
      setReviewingId('');
    }
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="auth-brand" href="/">indomie<span>corner</span></Link>
        <Link href="/" className="dashboard-back">Kembali ke toko</Link>
      </header>
      <div className="dashboard-content">
        <p className="panel-kicker">DASHBOARD ADMIN / ANALIS RISIKO</p>
        <h1>Promo dan tinjauan risiko</h1>
        <p className="dashboard-intro">Konfigurasikan voucher serta tinjau order yang mencapai skor risiko 40/100. Skor adalah indikator untuk ditinjau, bukan bukti fraud.</p>
        {error && <p className="api-error" role="alert">{error}</p>}
        {notice && <p className="dashboard-notice" role="status">{notice}</p>}

        <section className="dashboard-panel" id="admin-voucher-form">
          <div className="dashboard-panel-heading">
            <div><p className="panel-kicker">PROMO</p><h2>{editingId ? 'Edit voucher' : 'Buat voucher'}</h2></div>
            {editingId && <button className="text-back" onClick={() => { setEditingId(''); setForm(emptyVoucherForm()); }}>Batal edit</button>}
          </div>
          <form className="admin-voucher-form" onSubmit={saveVoucher}>
            <label className="field-label">Kode<input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_-]+" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label>
            <label className="field-label">Jenis diskon<select value={form.discountType} onChange={(event) => setForm({ ...form, discountType: event.target.value as VoucherForm['discountType'] })}><option value="percent">Persentase</option><option value="fixed">Nominal rupiah</option></select></label>
            <label className="field-label">Nilai diskon<input required type="number" min="1" step="1" max={form.discountType === 'percent' ? 100 : undefined} value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: event.target.value })} /></label>
            <label className="field-label">Batas diskon rupiah<input type="number" min="1" step="1" value={form.maxDiscount} onChange={(event) => setForm({ ...form, maxDiscount: event.target.value })} /></label>
            <label className="field-label">Minimum belanja<input required type="number" min="0" step="1" value={form.minimumSpend} onChange={(event) => setForm({ ...form, minimumSpend: event.target.value })} /></label>
            <label className="field-label">Kuota global<input required type="number" min="1" max="1000000" step="1" value={form.quota} onChange={(event) => setForm({ ...form, quota: event.target.value })} /></label>
            <label className="field-label">Batas per customer<input required type="number" min="1" step="1" value={form.perUserLimit} onChange={(event) => setForm({ ...form, perUserLimit: event.target.value })} /></label>
            <label className="field-label">Mulai<input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
            <label className="field-label">Berakhir<input required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
            <button className="primary-button form-wide" type="submit" disabled={isSaving}>{isSaving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Buat voucher'}</button>
          </form>
          {isLoading ? <p>Memuat voucher…</p> : (
            <div className="managed-product-list">
              {vouchers.map((voucher) => (
                <article className="managed-product" key={voucher.id}>
                  <div className="managed-product-info">
                    <strong>{voucher.code}</strong>
                    <span>{voucher.discountType === 'percent' ? `${voucher.discountValue}%` : formatRupiah(voucher.discountValue)} · min. {formatRupiah(voucher.minimumSpend)}</span>
                    <small>{voucher.usedCount}/{voucher.quota} digunakan · per akun {voucher.perUserLimit} · {voucher.isActive ? 'Aktif' : 'Nonaktif'}</small>
                    <small>{formatDate(voucher.startsAt)} – {formatDate(voucher.endsAt)}</small>
                  </div>
                  <div className="managed-actions"><button className="text-back" onClick={() => editVoucher(voucher)}>Edit</button><button className="text-back" onClick={() => void toggleVoucher(voucher)}>{voucher.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-heading"><div><p className="panel-kicker">FRAUD REVIEW</p><h2>Antrean tinjauan</h2></div><span className="dashboard-count">{reviews.length} flagged</span></div>
          {isLoading ? <p>Memuat antrean…</p> : reviews.length === 0 ? <p className="empty-dashboard">Belum ada order yang perlu ditinjau.</p> : (
            <div className="managed-order-list">
              {reviews.map((review) => (
                <article className="managed-order" key={review.checkoutId}>
                  <div className="order-heading">
                    <strong>IM-{review.checkoutId.slice(-8).toUpperCase()} · {review.customerName}</strong>
                    <span className={`risk-score ${review.riskScore >= 70 ? 'risk-score-high' : ''}`}>
                      Risiko {riskLevel(review.riskScore)} · {review.riskScore}/100
                    </span>
                  </div>
                  <small className="review-meta">{formatDate(review.createdAt)} · Pesanan {formatStatus(review.checkoutStatus)} · Pembayaran {formatStatus(review.paymentStatus)}</small>
                  <p>{review.items.join(', ')}</p>
                  <p>{review.voucherCode ? `Voucher ${review.voucherCode} · diskon ${formatRupiah(review.discountAmount)}` : 'Tanpa voucher'} · tagihan {formatRupiah(review.total)}</p>
                  {review.reasons.length > 0 ? (
                    <ul className="risk-reasons" aria-label="Alasan skor risiko">
                      {review.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  ) : <p className="review-meta">Tidak ada alasan risiko tersimpan. Periksa transaksi secara manual sebelum mengambil keputusan.</p>}
                  <label className="field-label">Catatan review<textarea rows={2} maxLength={500} value={reviewNotes[review.checkoutId] ?? ''} onChange={(event) => setReviewNotes({ ...reviewNotes, [review.checkoutId]: event.target.value })} /></label>
                  <div className="review-actions">
                    <button className="primary-button" disabled={Boolean(reviewingId)} onClick={() => void reviewOrder(review.checkoutId, 'approved')}>
                      {reviewingId === review.checkoutId ? 'Menyimpan...' : 'Setujui'}
                    </button>
                    <button className="review-reject" disabled={Boolean(reviewingId)} onClick={() => void reviewOrder(review.checkoutId, 'rejected')}>
                      {reviewingId === review.checkoutId ? 'Menyimpan...' : 'Tolak'}
                    </button>
                  </div>
                  <small>Keputusan dicatat di audit log; pembatalan pembayaran/refund tidak dilakukan otomatis.</small>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
