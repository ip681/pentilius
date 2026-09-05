'use client';

import type { ResearchResponseDto, ResearchStateDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { getResearches, startResearch } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { useRequireAuth } from '@/lib/use-require-auth';

function researchProgress(research: ResearchStateDto): { active: boolean; percent: number; secondsLeft: number } {
  if (!research.researchEndsAt || !research.nextLevelCost) {
    return { active: false, percent: 0, secondsLeft: 0 };
  }
  const endsAt = new Date(research.researchEndsAt).getTime();
  const now = Date.now();
  if (endsAt <= now) {
    return { active: false, percent: 100, secondsLeft: 0 };
  }
  const totalSeconds = research.nextLevelCost.researchSeconds;
  const secondsLeft = Math.ceil((endsAt - now) / 1000);
  const percent = Math.max(0, Math.min(100, ((totalSeconds - secondsLeft) / totalSeconds) * 100));
  return { active: true, percent, secondsLeft };
}

export default function ResearchPage() {
  useRequireAuth();
  const t = useTranslations();
  const [data, setData] = useState<ResearchResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setData(await getResearches());
    } catch {
      setError(t('research.loadError'));
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart(key: string) {
    setError(null);
    try {
      await startResearch(key);
      await load();
    } catch {
      setError(t('research.startError'));
    }
  }

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('research.title')}</h1>
        <p className="text-xs text-textMuted">{t('research.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {data && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {data.researches.map((research) => {
            const progress = researchProgress(research);
            return (
              <section key={research.key} className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
                <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
                  <span className="text-sm font-semibold">{t(research.nameKey)}</span>
                  <span className="text-[10px] uppercase text-textFaint">
                    {t('research.level')} {research.level}/{research.maxLevel}
                  </span>
                </div>

                <div className="p-5">
                  <p className="mb-3 text-xs text-textMuted">{t(research.descriptionKey)}</p>
                  <p className="mb-4 text-[11px] text-accent">
                    {t('research.bonusPerLevel', { percent: Math.round(research.bonusPerLevel * 100) })}
                  </p>

                  {progress.active ? (
                    <>
                      <div className="mb-1 flex justify-between text-[10px] text-textMuted">
                        <span>{t('research.inProgress')}</span>
                        <span className="tabular-nums">{formatDuration(progress.secondsLeft)}</span>
                      </div>
                      <div className="mb-4 h-[7px] overflow-hidden rounded-full bg-wellBorder">
                        <div className="h-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} />
                      </div>
                    </>
                  ) : research.nextLevelCost ? (
                    <div className="mb-4 grid grid-cols-2 gap-2">
                      <div className="rounded border border-wellBorder bg-well p-2.5">
                        <div className="mb-1 text-[8px] uppercase text-textFaint">{t('research.nextLevelCost')}</div>
                        <div className="text-sm">
                          {research.nextLevelCost.metalCost} {t('resource.METAL')}
                        </div>
                        <div className="text-sm">
                          {research.nextLevelCost.crystalCost} {t('resource.CRYSTAL')}
                        </div>
                        {research.nextLevelCost.creditsCost > 0 && (
                          <div className="text-sm">
                            {research.nextLevelCost.creditsCost} {t('resource.CREDITS')}
                          </div>
                        )}
                      </div>
                      <div className="rounded border border-wellBorder bg-well p-2.5">
                        <div className="mb-1 text-[8px] uppercase text-textFaint">{t('research.researchTime')}</div>
                        <div className="text-sm tabular-nums">{formatDuration(research.nextLevelCost.researchSeconds)}</div>
                      </div>
                    </div>
                  ) : (
                    <p className="mb-4 text-xs text-textMuted">{t('research.maxLevel')}</p>
                  )}

                  <button
                    type="button"
                    disabled={progress.active || !research.nextLevelCost}
                    onClick={() => handleStart(research.key)}
                    className="w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase text-text hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('research.start')}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </GameLayout>
  );
}
