'use client';

import type { ZoneDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
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
            <li key={zone.id} className="flex items-center justify-between rounded-lg border border-panelBorder bg-panel p-4">
              <div>
                <p className="font-medium">{t(zone.nameKey)}</p>
                {!zone.unlocked && (
                  <p className="text-xs text-textMuted">
                    {t('zones.unlocksAtLevel')} {zone.unlockLevel}
                  </p>
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
