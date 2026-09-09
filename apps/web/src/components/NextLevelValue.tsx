'use client';

import { useTranslations } from 'next-intl';

// Renders "current (value at next level)" instead of a bare "current → next"
// arrow — works for any unit (%, flat counts, per-hour rates, etc.) since the
// caller passes already-formatted strings; the arrow read ambiguously without
// a label, so this spells out what the parenthetical number actually means.
export function NextLevelValue({ current, next }: { current: string; next?: string | null }) {
  const t = useTranslations();

  if (!next) {
    return <strong className="font-semibold">{current}</strong>;
  }

  return (
    <>
      <strong className="font-semibold">{current}</strong> <span className="opacity-80">({t('common.atNextLevel', { value: next })})</span>
    </>
  );
}
