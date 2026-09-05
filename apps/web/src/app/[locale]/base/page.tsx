'use client';

import type { BaseResponseDto, BuildingStateDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { getBase, upgradeBuilding } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

function buildingProgress(building: BuildingStateDto): { active: boolean; percent: number; secondsLeft: number } {
  if (!building.constructionEndsAt || !building.nextLevelCost) {
    return { active: false, percent: 0, secondsLeft: 0 };
  }
  const endsAt = new Date(building.constructionEndsAt).getTime();
  const now = Date.now();
  if (endsAt <= now) {
    return { active: false, percent: 100, secondsLeft: 0 };
  }
  const totalSeconds = building.nextLevelCost.constructionSeconds;
  const secondsLeft = Math.ceil((endsAt - now) / 1000);
  const percent = Math.max(0, Math.min(100, ((totalSeconds - secondsLeft) / totalSeconds) * 100));
  return { active: true, percent, secondsLeft };
}

export default function BasePage() {
  useRequireAuth();
  const t = useTranslations();
  const [data, setData] = useState<BaseResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setData(await getBase());
    } catch {
      setError(t('base.loadError'));
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpgrade(key: string) {
    try {
      await upgradeBuilding(key);
      await load();
    } catch {
      setError(t('base.upgradeError'));
    }
  }

  return (
    <GameLayout>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('base.title')}</h1>
          <p className="text-xs text-textMuted">{t('base.subtitle')}</p>
        </div>
        <div className="text-xs uppercase tracking-wide text-positive">● {t('base.status')}</div>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {data && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {data.buildings.map((building) => {
            const progress = buildingProgress(building);
            return (
              <section key={building.key} className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
                <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
                  <span className="text-sm font-semibold">{t(building.nameKey)}</span>
                  <span className="text-[10px] uppercase text-textFaint">
                    {t('base.level')} {building.level}
                  </span>
                </div>

                <div className="p-5">
                  <div className="mb-4 flex h-[90px] items-center justify-center rounded-md border border-panelBorder bg-well">
                    <div className="h-12 w-16 rounded-sm bg-accent opacity-80" />
                  </div>

                  {progress.active ? (
                    <>
                      <div className="mb-1 flex justify-between text-[10px] text-textMuted">
                        <span>{t('base.underConstruction')}</span>
                        <span>{progress.secondsLeft}s</span>
                      </div>
                      <div className="mb-4 h-[7px] overflow-hidden rounded-full bg-wellBorder">
                        <div className="h-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} />
                      </div>
                    </>
                  ) : building.nextLevelCost ? (
                    <div className="mb-4 grid grid-cols-2 gap-2">
                      <div className="rounded border border-wellBorder bg-well p-2.5">
                        <div className="mb-1 text-[8px] uppercase text-textFaint">{t('base.nextLevelCost')}</div>
                        <div className="text-sm">
                          {building.nextLevelCost.metalCost} {t('resource.METAL')}
                        </div>
                        <div className="text-sm">
                          {building.nextLevelCost.crystalCost} {t('resource.CRYSTAL')}
                        </div>
                      </div>
                      <div className="rounded border border-wellBorder bg-well p-2.5">
                        <div className="mb-1 text-[8px] uppercase text-textFaint">{t('base.buildTime')}</div>
                        <div className="text-sm">{building.nextLevelCost.constructionSeconds}s</div>
                      </div>
                    </div>
                  ) : (
                    <p className="mb-4 text-xs text-textMuted">{t('base.maxLevel')}</p>
                  )}

                  <button
                    type="button"
                    disabled={progress.active || !building.nextLevelCost}
                    onClick={() => handleUpgrade(building.key)}
                    className="w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase text-text hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('base.upgrade')}
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
