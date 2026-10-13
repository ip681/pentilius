'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Link } from '@/i18n/navigation';
import { requestPasswordReset } from '@/lib/api-client';

/** "Forgot password" (owner decision, 2026-10-13): always the same answer, so it never reveals whether an email is registered. */
export default function ForgotPasswordPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      await requestPasswordReset(email, locale === 'en' ? 'en' : 'bg');
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('authEmail.forgotTitle')}>
      {sent ? (
        <p className="text-xs leading-relaxed text-textMuted">{t('authEmail.forgotSent')}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-xs text-textMuted">{t('authEmail.forgotIntro')}</p>
          <label className="flex flex-col gap-1.5 text-xs text-textMuted">
            {t('auth.email')}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-wellBorder bg-well px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
            />
          </label>
          {error && <p className="text-xs text-danger">{t('authEmail.error')}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase tracking-wide hover:bg-accentBgHover disabled:opacity-30"
          >
            {t('authEmail.forgotSubmit')}
          </button>
        </form>
      )}
      <Link href="/login" className="mt-4 block text-center text-xs text-textFaint underline hover:text-text">
        {t('authEmail.backToLogin')}
      </Link>
    </AuthShell>
  );
}
