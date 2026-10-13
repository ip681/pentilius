'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Link } from '@/i18n/navigation';
import { ApiError, resetPassword } from '@/lib/api-client';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

/** Set a new password from the emailed link (owner decision, 2026-10-13). */
function ResetPasswordInner() {
  const t = useTranslations();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('settings.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'INVALID_OR_EXPIRED_TOKEN' ? t('authEmail.linkInvalid') : t('authEmail.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('authEmail.resetTitle')}>
      {done ? (
        <p className="text-xs leading-relaxed text-positive">{t('authEmail.resetDone')}</p>
      ) : !token ? (
        <p className="text-xs text-danger">{t('authEmail.linkInvalid')}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs text-textMuted">
            {t('settings.newPassword')}
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-wellBorder bg-well px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-textMuted">
            {t('settings.confirmPassword')}
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-md border border-wellBorder bg-well px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
            />
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase tracking-wide hover:bg-accentBgHover disabled:opacity-30"
          >
            {t('authEmail.resetSubmit')}
          </button>
        </form>
      )}
      <Link href="/login" className="mt-4 block text-center text-xs text-textFaint underline hover:text-text">
        {t('authEmail.backToLogin')}
      </Link>
    </AuthShell>
  );
}
