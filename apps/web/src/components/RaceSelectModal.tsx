'use client';

import type { Race, RaceCountsDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { chooseRace, getRaceCounts } from '@/lib/api-client';

const RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

/**
 * New season (owner decision, 2026-10-13): after a season reset every player
 * picks their race again before playing on. Blocks the page until they choose
 * (it can't be dismissed). Same picker as registration, rarest race highlighted.
 */
export function RaceSelectModal({ seasonNumber, onChosen }: { seasonNumber: number; onChosen: () => void }) {
  const t = useTranslations();
  const [race, setRace] = useState<Race | null>(null);
  const [counts, setCounts] = useState<RaceCountsDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRaceCounts()
      .then(setCounts)
      .catch(() => setCounts(null));
  }, []);

  const rarest = counts ? Math.min(...RACES.map((r) => counts[r])) : null;

  async function handleConfirm() {
    if (!race) return;
    setBusy(true);
    setError(null);
    try {
      await chooseRace(race);
      onChosen();
    } catch {
      setError(t('newSeason.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg rounded-lg border border-panelBorder bg-panel p-6">
        <h2 className="mb-1 text-lg font-semibold">{t('newSeason.title', { season: seasonNumber })}</h2>
        <p className="mb-4 text-xs text-textMuted">{t('newSeason.chooseRace')}</p>

        <div className="mb-3 grid grid-cols-5 gap-2">
          {RACES.map((option) => {
            const isRarest = counts !== null && rarest !== null && counts[option] === rarest;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setRace(option)}
                title={t(`race.${option}.name`)}
                className={`relative flex flex-col items-center gap-1 rounded-md border p-2 ${
                  race === option ? 'border-textFaint bg-accentBgHover' : isRarest ? 'border-positive bg-well' : 'border-wellBorder bg-well hover:border-accent'
                }`}
              >
                {isRarest && (
                  <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-positive px-1 text-[6px] uppercase text-ink">
                    {t('race.recommended')}
                  </span>
                )}
                <AssetIcon
                  assetId={`races.${option.toLowerCase()}.icon`}
                  alt={t(`race.${option}.name`)}
                  className="aspect-square w-full object-contain"
                  fallback={<div className="aspect-square w-full rounded-sm bg-accent opacity-60" />}
                />
                <span className="text-center text-[9px] font-semibold uppercase leading-tight">{t(`race.${option}.name`)}</span>
              </button>
            );
          })}
        </div>
        <p className="mb-4 min-h-[2.5em] text-xs text-textMuted">{race ? t(`race.${race}.description`) : t('race.required')}</p>

        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <button
          type="button"
          disabled={!race || busy}
          onClick={handleConfirm}
          className="w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t('newSeason.confirm')}
        </button>
      </div>
    </div>
  );
}
