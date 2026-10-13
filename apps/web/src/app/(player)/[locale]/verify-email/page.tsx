'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Link } from '@/i18n/navigation';
import { verifyEmail } from '@/lib/api-client';
import { isAuthenticated } from '@/lib/auth';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}

/** Opened from the confirmation email (owner decision, 2026-10-13); works logged in or out. */
function VerifyEmailInner() {
  const t = useTranslations();
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'invalid'>('working');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState('invalid');
      return;
    }
    verifyEmail(token)
      .then(() => setState('done'))
      .catch(() => setState('invalid'));
  }, [token]);

  const loggedIn = typeof window !== 'undefined' && isAuthenticated();

  return (
    <AuthShell title={t('authEmail.verifyTitle')}>
      {state === 'working' && <p className="text-xs text-textMuted">…</p>}
      {state === 'done' && <p className="text-xs leading-relaxed text-positive">{t('authEmail.verifyDone')}</p>}
      {state === 'invalid' && <p className="text-xs leading-relaxed text-danger">{t('authEmail.verifyInvalid')}</p>}
      <Link href={loggedIn ? '/dashboard' : '/login'} className="mt-4 block text-center text-xs text-textFaint underline hover:text-text">
        {loggedIn ? t('pages.backToGame') : t('authEmail.backToLogin')}
      </Link>
    </AuthShell>
  );
}
