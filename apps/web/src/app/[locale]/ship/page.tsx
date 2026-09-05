'use client';

import type { ShipSlotDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameNav } from '@/components/GameNav';
import { getShip, unequipSlot } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function ShipPage() {
  useRequireAuth();
  const t = useTranslations();
  const [slots, setSlots] = useState<ShipSlotDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setSlots(await getShip());
    } catch {
      setError(t('ship.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnequip(slot: string) {
    try {
      setSlots(await unequipSlot(slot));
    } catch {
      setError(t('ship.actionError'));
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <GameNav />
      <h1 className="mb-4 mt-6 text-xl font-bold">{t('ship.title')}</h1>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      {slots && (
        <ul className="flex flex-col gap-3">
          {slots.map((entry) => (
            <li key={entry.slot} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="text-xs uppercase text-gray-500">{t(`equipmentSlot.${entry.slot}`)}</p>
                {entry.item ? (
                  <p className="font-medium">
                    {t(entry.item.nameKey)} (+{entry.item.upgradeLevel})
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">{t('ship.empty')}</p>
                )}
              </div>
              {entry.item && (
                <button
                  type="button"
                  onClick={() => handleUnequip(entry.slot)}
                  className="rounded border px-3 py-1 text-sm"
                >
                  {t('ship.unequip')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
