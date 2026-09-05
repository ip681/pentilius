'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ApiError, login, register } from '@/lib/api-client';
import { storeTokens } from '@/lib/auth';

type Status = { kind: 'idle' } | { kind: 'error'; messageKey: string };

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: 'idle' });
    try {
      const action = mode === 'login' ? login : register;
      const result = await action({ email, password });
      storeTokens(result);
      router.push('/base');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setStatus({ kind: 'error', messageKey: 'errorConflict' });
      } else if (error instanceof ApiError && error.status === 401) {
        setStatus({ kind: 'error', messageKey: 'errorInvalidCredentials' });
      } else {
        setStatus({ kind: 'error', messageKey: 'error' });
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <div className="flex gap-4 text-sm">
        <button
          type="button"
          className={mode === 'login' ? 'font-bold underline' : ''}
          onClick={() => setMode('login')}
        >
          {t('login')}
        </button>
        <button
          type="button"
          className={mode === 'register' ? 'font-bold underline' : ''}
          onClick={() => setMode('register')}
        >
          {t('register')}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t('email')}
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('password')}
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          {t('submit')}
        </button>
      </form>

      {status.kind === 'error' && <p className="text-red-600">{t(status.messageKey)}</p>}
    </main>
  );
}
