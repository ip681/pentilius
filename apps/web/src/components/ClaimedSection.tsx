'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

/**
 * Claimed rewards, folded away at the bottom of a list (owner decision,
 * 2026-10-14) — shared by the daily missions and the achievements so both
 * lists follow the same rule.
 */
export function ClaimedSection({ count, children }: { count: number; children: ReactNode }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="self-start text-[11px] text-textFaint hover:text-text">
        {open ? '▾' : '▸'} {t('claimedSection.title', { count })}
      </button>
      {open && children}
    </div>
  );
}
