'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@/lib/models';

type AuthNavProps = {
  user: AuthUser | null;
};

export default function AuthNav({ user }: AuthNavProps) {
  const [error, setError] = useState('');
  const router = useRouter();

  async function logout() {
    setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Logout gagal.');
      router.replace('/');
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Logout gagal.');
    }
  }

  if (!user) {
    return (
      <div className="auth-nav">
        <Link href="/login">Masuk</Link>
        <Link className="auth-nav-register" href="/register">Daftar</Link>
      </div>
    );
  }

  return (
    <div className="auth-nav">
      <Link href="/account" title={`${user.name} · ${user.role}`}>
        {user.name}
      </Link>
      <button onClick={logout}>Keluar</button>
      {error && <span className="auth-nav-error" role="alert">{error}</span>}
    </div>
  );
}
