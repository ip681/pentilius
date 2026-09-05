'use client';

import type { ZoneDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameNav } from '@/components/GameNav';
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
    <main className="mx-auto max-w-2xl p-6">
      <GameNav />
      <h1 className="mb-4 mt-6 text-xl font-bold">{t('zones.title')}</h1>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      {zones && (
        <ul className="flex flex-col gap-3">
          {zones.map((zone) => (
            <li key={zone.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{t(zone.nameKey)}</p>
                {!zone.unlocked && (
                  <p className="text-xs text-gray-500">
                    {t('zones.unlocksAtLevel')} {zone.unlockLevel}
                  </p>
                )}
              </div>
              {zone.unlocked ? (
                <Link href={`/zones/${zone.id}`} className="rounded bg-black px-3 py-1 text-sm text-white">
                  {t('zones.enter')}
                </Link>
              ) : (
                <span className="text-sm text-gray-400">{t('zones.locked')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
