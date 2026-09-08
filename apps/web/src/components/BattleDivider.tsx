'use client';

import { useTranslations } from 'next-intl';

// Center divider between two fighters in a battle screen (PvE/PvP) — a thin
// line + glyph instead of a bordered "VS" circle, so it stays unobtrusive
// and the two fighter cards can sit side by side even on narrow (mobile)
// screens, per owner design decision.
export function BattleDivider({ round }: { round?: number }) {
  const t = useTranslations();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-1">
      <div className="w-px flex-1 bg-panelBorder" />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent bg-panelHeader text-accent sm:h-10 sm:w-10">
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 sm:h-5 sm:w-5">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" />
        </svg>
      </div>
      <div className="w-px flex-1 bg-panelBorder" />
      {round !== undefined && (
        <div className="whitespace-nowrap text-[8px] uppercase tracking-widest text-textFaint sm:text-[10px]">{t('pve.round')} {round}</div>
      )}
    </div>
  );
}
