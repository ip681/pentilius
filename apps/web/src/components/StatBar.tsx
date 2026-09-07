'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Shared by StatusBar (mobile, below the TopBar) and TopBar (desktop, inline
// between the logo and the account cluster) so the Energy/XP display logic
// lives in one place regardless of where it's positioned responsively.
export function StatBar({
  label,
  current,
  max,
  colorClass,
  countdownTarget,
  className,
}: {
  label: string;
  current: number;
  max: number | null;
  colorClass: string;
  countdownTarget?: string | null;
  className?: string;
}) {
  const t = useTranslations();
  const percent = max ? Math.min(100, Math.max(0, (current / max) * 100)) : 100;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!countdownTarget) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [countdownTarget]);

  const remainingMs = countdownTarget ? new Date(countdownTarget).getTime() - now : null;
  const countdownText = remainingMs !== null && remainingMs > 0 ? formatCountdown(remainingMs) : null;

  return (
    <div className={`flex min-w-[140px] flex-1 flex-col gap-1 ${className ?? ''}`}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-textFaint">
        <span className="flex items-center gap-1.5">
          {label}
          {countdownText && <span className="normal-case tabular-nums text-textFaint">({countdownText})</span>}
        </span>
        <span className="tabular-nums normal-case text-textMuted">{max !== null ? `${current}/${max}` : t('dashboard.maxLevel')}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-wellBorder">
        <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
