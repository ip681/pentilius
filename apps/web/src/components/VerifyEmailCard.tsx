'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ApiError, getProfile, resendVerificationEmail } from '@/lib/api-client';

const SNOOZE_KEY = 'pentilius.verifyEmail.promptSnoozedUntil';
const SNOOZE_DAYS = 7;

/**
 * Command Center reminder to confirm the email (owner decision, 2026-10-13) —
 * confirmation is optional, so the player plays right away. Works like the
 * notifications card: "Send again" or "Not now" (hidden for 7 days).
 */
export function VerifyEmailCard() {
  const t = useTranslations();
  const locale = useLocale();
  const [email, setEmail] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'limit' | 'error'>('idle');

  useEffect(() => {
    try {
      if (Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now()) return;
    } catch {
      // Storage blocked — just show it.
    }
    getProfile()
      .then((profile) => {
        if (profile.emailVerified) return;
        setEmail(profile.email);
        setVisible(true);
      })
      .catch(() => undefined);
  }, []);

  async function handleSend() {
    setState('busy');
    try {
      await resendVerificationEmail(locale === 'en' ? 'en' : 'bg');
      setState('sent');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_ALREADY_VERIFIED') {
        setVisible(false);
        return;
      }
      setState(err instanceof ApiError && err.code === 'TOO_MANY_EMAILS' ? 'limit' : 'error');
    }
  }

  function handleLater() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-accent bg-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{t('authEmail.cardTitle')}</h3>
        <p className="text-xs text-textMuted">
          {state === 'sent'
            ? t('authEmail.cardSent', { email: email ?? '' })
            : state === 'limit'
              ? t('authEmail.cardLimit')
              : state === 'error'
                ? t('authEmail.error')
                : t('authEmail.cardBody', { email: email ?? '' })}
        </p>
      </div>
      {state !== 'sent' && (
        <div className="flex gap-2 sm:shrink-0">
          <button type="button" onClick={handleLater} className="flex-1 rounded-md border border-panelBorder px-3 py-1.5 text-[11px] uppercase text-textMuted hover:bg-accentBgHover sm:flex-none">
            {t('dashboard.enableNotifications.later')}
          </button>
          <button
            type="button"
            disabled={state === 'busy'}
            onClick={handleSend}
            className="flex-1 rounded-md border border-accent bg-accentBg px-4 py-1.5 text-[11px] uppercase hover:bg-accentBgHover disabled:opacity-30 sm:flex-none"
          >
            {t('authEmail.cardSend')}
          </button>
        </div>
      )}
    </div>
  );
}
