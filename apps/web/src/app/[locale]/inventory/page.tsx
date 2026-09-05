'use client';

import type { InventoryItemDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameNav } from '@/components/GameNav';
import { equipItem, getInventory, upgradeItem } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function InventoryPage() {
  useRequireAuth();
  const t = useTranslations();
  const [items, setItems] = useState<InventoryItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setItems(await getInventory());
    } catch {
      setError(t('inventory.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEquip(id: string) {
    try {
      await equipItem(id);
      await load();
    } catch {
      setError(t('inventory.actionError'));
    }
  }

  async function handleUpgrade(id: string) {
    try {
      await upgradeItem(id);
      await load();
    } catch {
      setError(t('inventory.actionError'));
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <GameNav />
      <h1 className="mb-4 mt-6 text-xl font-bold">{t('inventory.title')}</h1>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      {items && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">
                  {t(item.nameKey)} (+{item.upgradeLevel}/{item.maxUpgradeLevel})
                </p>
                <p className="text-xs text-gray-500">
                  {t(`equipmentSlot.${item.slot}`)} {item.equipped && `· ${t('inventory.equipped')}`}
                </p>
              </div>
              <div className="flex gap-2">
                {!item.equipped && (
                  <button type="button" onClick={() => handleEquip(item.id)} className="rounded border px-3 py-1 text-sm">
                    {t('inventory.equip')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={item.upgradeLevel >= item.maxUpgradeLevel}
                  onClick={() => handleUpgrade(item.id)}
                  className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-40"
                >
                  {t('inventory.upgrade')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
