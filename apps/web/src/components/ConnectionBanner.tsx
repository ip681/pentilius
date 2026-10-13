'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { checkServerHealth } from '@/lib/api-client';
import { type ConnectionLossReason, notifyConnectionRestored, onConnectionLost } from '@/lib/connection-events';

const POLL_MS = 3000;

/**
 * Shown while the server can't be reached (owner decision, 2026-10-13) —
 * typically a few seconds during an update. Instead of error messages, a quiet
 * banner says we're reconnecting, polls /health, and lets every page refresh
 * once the server answers again. No reload, nothing lost.
 */
export function ConnectionBanner() {
  const t = useTranslations();
  const [lost, setLost] = useState<ConnectionLossReason | null>(null);

  useEffect(() => onConnectionLost((reason) => setLost((current) => current ?? reason)), []);

  useEffect(() => {
    if (!lost) return;
    const interval = setInterval(() => {
      checkServerHealth().then((ok) => {
        if (!ok) return;
        setLost(null);
        notifyConnectionRestored();
      });
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [lost]);

  if (!lost) return null;
  return (
    <div className="fixed left-1/2 top-2 z-[60] w-[min(92vw,420px)] -translate-x-1/2 rounded-md border border-accent bg-panel px-4 py-2 text-center text-xs shadow-lg">
      <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-gold align-middle" />
      {lost === 'maintenance' ? t('connection.maintenance') : t('connection.lost')}
    </div>
  );
}
