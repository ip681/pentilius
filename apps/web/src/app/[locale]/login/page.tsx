'use client';

import type { Race } from '@pentilius/shared';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useRouter } from '@/i18n/navigation';
import { ApiError, login, register } from '@/lib/api-client';
import { storeTokens } from '@/lib/auth';

type Status = { kind: 'idle' } | { kind: 'error'; messageKey: string };

const RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [race, setRace] = useState<Race>('LUXARI');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: 'idle' });
    try {
      const result = mode === 'login' ? await login({ email, password }) : await register({ email, username, password, race });
      storeTokens(result);
      router.push('/dashboard');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const messageKey =
          error.code === 'USERNAME_TAKEN'
            ? 'auth.errorUsernameTaken'
            : error.code === 'EMAIL_TAKEN'
              ? 'auth.errorEmailTaken'
              : 'auth.errorConflict';
        setStatus({ kind: 'error', messageKey });
      } else if (error instanceof ApiError && error.status === 401) {
        setStatus({ kind: 'error', messageKey: 'auth.errorInvalidCredentials' });
      } else {
        setStatus({ kind: 'error', messageKey: 'auth.error' });
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-4 py-10 text-text">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>

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
              {t('auth.login')}
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-3 text-xs uppercase tracking-wide ${
                mode === 'register' ? 'bg-panelHeader text-text' : 'text-textMuted hover:text-text'
              }`}
            >
              {t('auth.register')}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
            <label className="flex flex-col gap-1.5 text-xs text-textMuted">
              {t('auth.email')}
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-md border border-wellBorder bg-well px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
              />
            </label>
            {mode === 'register' && (
              <label className="flex flex-col gap-1.5 text-xs text-textMuted">
                {t('auth.username')}
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]+"
                  title={t('auth.usernameHint')}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="rounded-md border border-wellBorder bg-well px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-xs text-textMuted">
              {t('auth.password')}
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-md border border-wellBorder bg-well px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
              />
            </label>

            {mode === 'register' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-textMuted">{t('race.chooseLabel')}</span>
                <div className="flex flex-col gap-1.5">
                  {RACES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setRace(option)}
                      className={`rounded-md border p-2.5 text-left ${
                        race === option ? 'border-textFaint bg-accentBgHover' : 'border-wellBorder bg-well hover:border-accent'
                      }`}
                    >
                      <div className="text-sm font-semibold">{t(`race.${option}.name`)}</div>
                      <div className="text-[10px] text-textMuted">{t(`race.${option}.theme`)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {status.kind === 'error' && <p className="text-xs text-danger">{t(status.messageKey)}</p>}

            <button
              type="submit"
              className="mt-1 w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase tracking-wide text-text hover:bg-accentBgHover"
            >
              {t('auth.submit')}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
