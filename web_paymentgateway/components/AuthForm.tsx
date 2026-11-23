'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type AuthFormProps = {
  mode: 'login' | 'register';
  nextPath?: string;
};

type AuthResponse = {
  error?: string;
  user?: { role: 'customer' | 'merchant' | 'admin' };
};

export default function AuthForm({ mode, nextPath }: AuthFormProps) {
  const router = useRouter();
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await response.json()) as AuthResponse;
      if (!response.ok) throw new Error(data.error ?? 'Permintaan gagal diproses.');

      const role = data.user?.role;
      const destination =
        role === 'admin' ? '/admin' : role === 'merchant' ? '/merchant' : nextPath ?? '/';
      router.replace(destination);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Permintaan gagal diproses.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/">indomie<span>corner</span></Link>
      <section className="auth-card">
        <p className="panel-kicker">{isRegister ? 'BUAT AKUN CUSTOMER' : 'SELAMAT DATANG KEMBALI'}</p>
        <h1>{isRegister ? 'Daftar akun' : 'Masuk ke akun'}</h1>
        <p className="auth-intro">
          {isRegister
            ? 'Buat akun untuk memesan dan menggunakan voucher.'
            : 'Masuk untuk melanjutkan pesanan dan melihat akunmu.'}
        </p>
        <form className="auth-form" onSubmit={submit}>
          {isRegister && (
            <label className="field-label">
              Nama lengkap
              <input
                autoComplete="name"
                maxLength={120}
                minLength={2}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <label className="field-label">
            Email
            <input
              autoComplete="email"
              maxLength={254}
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field-label">
            Kata sandi
            <input
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              maxLength={128}
              minLength={isRegister ? 12 : undefined}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {isRegister && <small>Gunakan minimal 12 karakter.</small>}
          </label>
          {error && <p className="api-error" role="alert">{error}</p>}
          <button className="primary-button full-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Memproses...' : isRegister ? 'Daftar' : 'Masuk'}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
          <Link href={isRegister ? '/login' : '/register'}>{isRegister ? 'Masuk' : 'Daftar'}</Link>
        </p>
      </section>
    </main>
  );
}
