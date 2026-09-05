'use client';

import Image from 'next/image';
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
      router.push('/dashboard');
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
    <main className="flex min-h-screen items-center justify-center bg-ink px-4 text-text">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Image src="/logo.png" alt="Pentilius" width={220} height={132} className="h-auto w-[220px]" priority />
        </div>

        <div className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
          <div className="flex border-b border-panelBorder">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-3 text-xs uppercase tracking-wide ${
                mode === 'login' ? 'bg-panelHeader text-text' : 'text-textMuted hover:text-text'
              }`}
            >
              {t('login')}
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-3 text-xs uppercase tracking-wide ${
                mode === 'register' ? 'bg-panelHeader text-text' : 'text-textMuted hover:text-text'
              }`}
            >
              {t('register')}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
            <label className="flex flex-col gap-1.5 text-xs text-textMuted">
              {t('email')}
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-md border border-wellBorder bg-well px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-textMuted">
              {t('password')}
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-md border border-wellBorder bg-well px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
              />
            </label>

            {status.kind === 'error' && <p className="text-xs text-danger">{t(status.messageKey)}</p>}

            <button
              type="submit"
              className="mt-1 w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase tracking-wide text-text hover:bg-accentBgHover"
            >
              {t('submit')}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
