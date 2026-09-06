'use client';

import type { Race, RaceCountsDto } from '@pentilius/shared';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useRouter } from '@/i18n/navigation';
import { ApiError, getRaceCounts, login, register } from '@/lib/api-client';
import { storeTokens } from '@/lib/auth';

type Status = { kind: 'idle' } | { kind: 'error'; messageKey: string };

const RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [race, setRace] = useState<Race | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [raceCounts, setRaceCounts] = useState<RaceCountsDto | null>(null);

  useEffect(() => {
    getRaceCounts()
      .then(setRaceCounts)
      .catch(() => setRaceCounts(null));
  }, []);

  const rarestCount = raceCounts ? Math.min(...RACES.map((option) => raceCounts[option])) : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === 'register' && !race) {
      setStatus({ kind: 'error', messageKey: 'race.required' });
      return;
    }
    setStatus({ kind: 'idle' });
    try {
      const result = mode === 'login' ? await login({ email, password }) : await register({ email, username, password, race: race as Race });
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
                <p className="text-[10px] text-textFaint">{t('race.rarityHint')}</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {RACES.map((option) => {
                    const count = raceCounts?.[option];
                    const isRarest = raceCounts !== null && rarestCount !== null && count === rarestCount;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setRace(option)}
                        title={t(`race.${option}.name`)}
                        className={`relative flex flex-col items-center gap-1 rounded-md border p-1.5 ${
                          race === option
                            ? 'border-textFaint bg-accentBgHover'
                            : isRarest
                              ? 'border-positive bg-well hover:border-positive'
                              : 'border-wellBorder bg-well hover:border-accent'
                        }`}
                      >
                        {isRarest && (
                          <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-positive px-1 text-[6px] uppercase text-ink">
                            {t('race.recommended')}
                          </span>
                        )}
                        <AssetIcon
                          assetId={`races.${option.toLowerCase()}.icon`}
                          alt={t(`race.${option}.name`)}
                          className="aspect-square w-full object-contain"
                          fallback={<div className="aspect-square w-full rounded-sm bg-accent opacity-60" />}
                        />
                        <span className="text-center text-[8px] font-semibold uppercase leading-tight">{t(`race.${option}.name`)}</span>
                        {count !== undefined && <span className="text-[8px] tabular-nums text-textFaint">{t('race.playerCount', { count })}</span>}
                      </button>
                    );
                  })}
                </div>
                {race ? (
                  <p className="text-[10px] text-textMuted">{t(`race.${race}.theme`)}</p>
                ) : (
                  <p className="text-[10px] text-textFaint">{t('race.required')}</p>
                )}
              </div>
            )}

            {status.kind === 'error' && <p className="text-xs text-danger">{t(status.messageKey)}</p>}

            <button
              type="submit"
              disabled={mode === 'register' && !race}
              className="mt-1 w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase tracking-wide text-text hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
            >
              {t('auth.submit')}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
