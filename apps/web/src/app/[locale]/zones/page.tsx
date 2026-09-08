'use client';

import type { ZoneDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { GameLayout } from '@/components/GameLayout';
import { Link } from '@/i18n/navigation';
import { getZones } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function ZonesPage() {
  useRequireAuth();
  const t = useTranslations();
  const [zones, setZones] = useState<ZoneDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getZones()
      .then(setZones)
      .catch(() => setError(t('zones.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameLayout>
      <h1 className="mb-6 text-2xl font-semibold">{t('zones.title')}</h1>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {zones && (
        <ul className="flex flex-col gap-3">
          {zones.map((zone) => (
            <li key={zone.id} className="flex flex-col gap-3 rounded-lg border border-panelBorder bg-panel p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                <div className="order-1 sm:order-2">
                  <p className="font-medium">{t(zone.nameKey)}</p>
                  {!zone.unlocked && (
                    <p className="text-xs text-textMuted">
                      {t('zones.unlocksAtLevel')} {zone.unlockLevel}
                    </p>
                  )}
                </div>
                <div
                  className={`order-2 -mx-4 h-40 w-[calc(100%+2rem)] overflow-hidden bg-well sm:order-1 sm:mx-0 sm:h-16 sm:w-24 sm:shrink-0 sm:rounded-md ${zone.unlocked ? '' : 'opacity-50'}`}
                >
                  <AssetIcon
                    assetId={zone.iconAssetId}
                    alt={t(zone.nameKey)}
                    className="h-full w-full object-cover"
                    fallback={<div className="flex h-full w-full items-center justify-center text-sm font-semibold text-textMuted">{t(zone.nameKey).charAt(0)}</div>}
                  />
                </div>
                {zone.pentiliPreview.length > 0 && (
                  <div className={`order-3 flex flex-wrap items-end gap-3 ${zone.unlocked ? '' : 'opacity-50'}`}>
                    {zone.pentiliPreview.map((pentili, index) => (
                      <div key={index} title={t(pentili.nameKey)} className="flex flex-col items-center gap-1">
                        <AssetIcon
                          assetId={pentili.iconAssetId}
                          alt={t(pentili.nameKey)}
                          className="h-16 w-auto object-contain"
                          fallback={
                            <span className="flex h-16 w-16 items-center justify-center text-sm font-semibold text-textMuted">
                              {t(pentili.nameKey).charAt(0)}
                            </span>
                          }
                        />
                        <span className="text-[10px] text-textFaint">{t(pentili.nameKey)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {zone.unlocked ? (
                <Link href={`/zones/${zone.id}`} className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase hover:bg-accentBgHover">
                  {t('zones.enter')}
                </Link>
              ) : (
                <span className="text-xs text-textFaint">{t('zones.locked')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </GameLayout>
  );
}
