'use client';

import type { SpecialLevelDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';

/**
 * Levels where something special happens (owner decision, 2026-10-14) — a
 * check mark once reached. Deliberately no full table of every level: what
 * higher levels give stays a bit of a discovery.
 */
export function SpecialLevels({ levels }: { levels: SpecialLevelDto[] }) {
  const t = useTranslations();
  if (levels.length === 0) return null;
  return (
    <div className="mb-3 rounded border border-wellBorder bg-well p-2.5 text-[11px]">
      <div className="mb-1 text-[8px] uppercase text-textFaint">{t('specialLevels.title')}</div>
      <ul className="flex flex-col gap-0.5">
        {levels.map((entry) => (
          <li key={`${entry.kind}-${entry.level}`} className={entry.reached ? 'text-positive' : 'text-textMuted'}>
            <span className="inline-block w-4">{entry.reached ? '✓' : ''}</span>
            {t('specialLevels.level', { level: entry.level })} — {t(`specialLevels.kinds.${entry.kind}`, { name: entry.nameKey ? t(entry.nameKey) : '' })}
          </li>
        ))}
      </ul>
    </div>
  );
}
