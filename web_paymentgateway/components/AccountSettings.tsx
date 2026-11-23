'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { AuthUser } from '@/lib/models';

type AccountSettingsProps = {
  user: AuthUser;
};

export default function AccountSettings({ user }: AccountSettingsProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const dashboardHref =
    user.role === 'admin' ? '/admin' : user.role === 'merchant' ? '/merchant' : '/';

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !window.confirm('Yakin ingin menghapus akun? Tindakan ini tidak dapat dibatalkan.')) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Penghapusan akun gagal.');
      setIsDeleted(true);
      setPassword('');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Penghapusan akun gagal.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isDeleted) {
    return (
      <main className="auth-page">
        <Link className="auth-brand" href="/">indomie<span>corner</span></Link>
        <section className="auth-card">
          <p className="panel-kicker">AKUN DINONAKTIFKAN</p>
          <h1>Akun berhasil dihapus</h1>
          <p className="auth-intro">
            Sesi telah dicabut dan data pribadi pada riwayat pesanan dianonimkan. Catatan transaksi
            dan audit yang diperlukan tetap disimpan.
          </p>
          <Link className="primary-button full-button account-home-button" href="/">Kembali ke toko</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/">indomie<span>corner</span></Link>
      <section className="auth-card account-card">
        <p className="panel-kicker">PENGATURAN AKUN</p>
        <h1>Akun saya</h1>
        <div className="account-details">
          <p><span>Nama</span><strong>{user.name}</strong></p>
          <p><span>Email</span><strong>{user.email}</strong></p>
          <p><span>Peran</span><strong>{user.role}</strong></p>
        </div>
        <Link className="account-dashboard-link" href={dashboardHref}>
          Kembali ke {user.role === 'customer' ? 'toko' : `dashboard ${user.role}`}
        </Link>

        <section className="account-danger-zone">
          <p className="panel-kicker">ZONA BERISIKO</p>
          <h2>Hapus akun</h2>
          <p>
            Akun akan dinonaktifkan, semua sesi dicabut, dan nama serta alamat pada riwayat pesanan
            dianonimkan. Catatan transaksi tetap disimpan untuk audit. Pesanan aktif harus diselesaikan
            atau dibatalkan terlebih dahulu.
          </p>
          <form className="auth-form" onSubmit={deleteAccount}>
            <label className="field-label">
              Kata sandi saat ini
              <input
                autoComplete="current-password"
                maxLength={128}
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <p className="api-error" role="alert">{error}</p>}
            <button className="danger-button full-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Menghapus akun...' : 'Hapus akun saya'}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
