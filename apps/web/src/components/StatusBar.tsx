'use client';

import type { PlayerProfileDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function Bar({
  label,
  current,
  max,
  colorClass,
  countdownTarget,
}: {
  label: string;
  current: number;
  max: number | null;
  colorClass: string;
  countdownTarget?: string | null;
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
    <div className="flex min-w-[140px] flex-1 flex-col gap-1">
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

export function StatusBar({ profile }: { profile: PlayerProfileDto }) {
  const t = useTranslations();

  return (
    <div className="border-b border-panelBorder bg-inkRaised px-3 py-2.5 md:px-7">
      <div className="mb-2.5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Bar
          label={t('dashboard.energy')}
          current={profile.energy.current}
          max={profile.energy.max}
          colorClass="bg-energy"
          countdownTarget={profile.energy.nextRegenAt}
        />
        <Bar label={`${t('dashboard.xp')} · ${t('dashboard.level')} ${profile.level}`} current={profile.xp} max={profile.xpForNextLevel} colorClass="bg-gold" />
      </div>
      <div className="flex gap-5 overflow-x-auto text-xs text-textMuted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="whitespace-nowrap">
          {t('resource.METAL')} <strong className="ml-1 font-semibold text-text">{profile.resources.metal.toLocaleString()}</strong>
        </span>
        <span className="whitespace-nowrap">
          {t('resource.CRYSTAL')} <strong className="ml-1 font-semibold text-text">{profile.resources.crystal.toLocaleString()}</strong>
        </span>
        <span className="whitespace-nowrap">
          {t('resource.CREDITS')} <strong className="ml-1 font-semibold text-text">{profile.resources.credits.toLocaleString()}</strong>
        </span>
      </div>
    </div>
  );
}
