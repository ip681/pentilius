'use client';

import type { BaseResponseDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameNav } from '@/components/GameNav';
import { getBase, upgradeBuilding } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

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
    const interval = setInterval(load, 5000);
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
    <main className="mx-auto max-w-2xl p-6">
      <GameNav />
      <h1 className="mb-4 mt-6 text-xl font-bold">{t('base.title')}</h1>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      {data && (
        <>
          <ul className="mb-6 flex flex-wrap gap-4 text-sm">
            <li>{t('resource.METAL')}: {data.resources.metal}</li>
            <li>{t('resource.CRYSTAL')}: {data.resources.crystal}</li>
            <li>{t('resource.OXYGEN')}: {data.resources.oxygen}</li>
            <li>{t('resource.CREDITS')}: {data.resources.credits}</li>
            <li>{t('resource.UPGRADE_STONES')}: {data.resources.upgradeStones}</li>
          </ul>

          <ul className="flex flex-col gap-3">
            {data.buildings.map((building) => {
              const underConstruction = building.constructionEndsAt && new Date(building.constructionEndsAt) > new Date();
              return (
                <li key={building.key} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <p className="font-medium">{t(building.nameKey)} — {t('base.level')} {building.level}</p>
                    {underConstruction && (
                      <p className="text-xs text-gray-500">
                        {t('base.underConstructionUntil')} {new Date(building.constructionEndsAt!).toLocaleTimeString()}
                      </p>
                    )}
                    {!underConstruction && building.nextLevelCost && (
                      <p className="text-xs text-gray-500">
                        {t('base.nextLevelCost')}: {building.nextLevelCost.metalCost} {t('resource.METAL')}, {building.nextLevelCost.crystalCost} {t('resource.CRYSTAL')}
                      </p>
                    )}
                    {!building.nextLevelCost && <p className="text-xs text-gray-500">{t('base.maxLevel')}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(underConstruction) || !building.nextLevelCost}
                    onClick={() => handleUpgrade(building.key)}
                    className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-40"
                  >
                    {t('base.upgrade')}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
