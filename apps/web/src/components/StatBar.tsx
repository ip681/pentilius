'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AssetIcon } from './AssetIcon';

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Used twice by TopBar — inline between the logo and account cluster on
// desktop, and full-width in the merged mobile-only second row — so the
// Energy/XP display logic lives in one place regardless of layout.
export function StatBar({
  label,
  icon,
  hideLabelText = false,
  current,
  max,
  colorClass,
  countdownTarget,
  className,
}: {
  label: string;
  // Owner-prepared icon (e.g. "interface.energy.icon") shown before the label
  // — replaces the old plain-text "Energy"/"XP" wording.
  icon?: string;
  // The label word itself (e.g. "Energy") is fully replaced by the icon —
  // kept in the DOM for screen readers (sr-only) instead of rendered.
  hideLabelText?: boolean;
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
    <div className={`flex min-w-0 flex-1 flex-col gap-1 ${className ?? ''}`}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-text">
        <span className="flex items-center gap-1.5">
          {icon && (
            <AssetIcon
              assetId={icon}
              alt={label}
              className="h-3.5 w-3.5 shrink-0 object-contain"
              fallback={<span className="text-[8px] font-semibold">{label.charAt(0)}</span>}
            />
          )}
          <span className={hideLabelText ? 'sr-only' : undefined}>{label}</span>
          {countdownText && <span className="normal-case tabular-nums text-text">({countdownText})</span>}
        </span>
        <span className="tabular-nums normal-case text-text">{max !== null ? `${current}/${max}` : t('dashboard.maxLevel')}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-wellBorder">
        <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
