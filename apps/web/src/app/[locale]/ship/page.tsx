'use client';

import type { EquipmentSlot, InventoryItemDto, ShipSlotDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { equipItem, getInventory, getShip, unequipSlot, upgradeItem } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

const SLOTS: EquipmentSlot[] = ['WEAPON', 'ENGINE', 'HULL', 'SHIELD', 'REACTOR', 'UTILITY'];

const SLOT_POSITION: Record<EquipmentSlot, string> = {
  WEAPON: 'left-[6%] top-[18%]',
  SHIELD: 'left-[6%] bottom-[18%]',
  ENGINE: 'right-[6%] top-[18%]',
  REACTOR: 'right-[6%] bottom-[18%]',
  HULL: 'left-1/2 top-[4%] -translate-x-1/2',
  UTILITY: 'left-1/2 bottom-[4%] -translate-x-1/2',
};

export default function ShipPage() {
  useRequireAuth();
  const t = useTranslations();
  const [items, setItems] = useState<InventoryItemDto[] | null>(null);
  const [slots, setSlots] = useState<ShipSlotDto[] | null>(null);
  const [filter, setFilter] = useState<EquipmentSlot | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [inventory, ship] = await Promise.all([getInventory(), getShip()]);
      setItems(inventory);
      setSlots(ship);
    } catch {
      setError(t('ship.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = items?.find((item) => item.id === selectedId) ?? null;
  const visibleItems = useMemo(() => {
    if (!items) return [];
    return filter === 'ALL' ? items : items.filter((item) => item.slot === filter);
  }, [items, filter]);

  async function handleEquip() {
    if (!selected) return;
    try {
      await equipItem(selected.id);
      await load();
    } catch {
      setError(t('ship.actionError'));
    }
  }

  async function handleUnequip() {
    if (!selected) return;
    try {
      await unequipSlot(selected.slot);
      await load();
    } catch {
      setError(t('ship.actionError'));
    }
  }

  async function handleUpgrade() {
    if (!selected) return;
    try {
      await upgradeItem(selected.id);
      await load();
    } catch {
      setError(t('ship.actionError'));
    }
  }

  return (
    <GameLayout>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('ship.title')}</h1>
          <p className="text-xs text-textMuted">{t('ship.subtitle')}</p>
        </div>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr_310px]">
        {/* INVENTORY */}
        <section className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
          <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
            <strong className="text-xs">{t('ship.inventory')}</strong>
            <span className="text-[9px] uppercase text-textFaint">{visibleItems.length} {t('ship.items')}</span>
          </div>

          <div className="p-3">
            <div className="mb-3 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className={`rounded px-2 py-1.5 text-[9px] uppercase ${filter === 'ALL' ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`}
              >
                {t('ship.all')}
              </button>
              {SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setFilter(slot)}
                  className={`rounded px-2 py-1.5 text-[9px] uppercase ${filter === slot ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`}
                >
                  {t(`equipmentSlot.${slot}`)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`min-h-[100px] rounded-md border p-2.5 text-left ${
                    selectedId === item.id ? 'border-textFaint' : 'border-wellBorder'
                  } ${item.equipped ? 'opacity-50' : ''} bg-well`}
                >
                  <div className="text-[10px] font-semibold leading-tight">{t(item.nameKey)}</div>
                  <div className="mt-1.5 text-[8px] uppercase tracking-wide text-textMuted">{t(`equipmentSlot.${item.slot}`)}</div>
                  <div className="mt-1.5 text-[8px] text-textMuted">
                    +{item.upgradeLevel}/{item.maxUpgradeLevel}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* SHIP */}
        <section className="rounded-lg border border-panelBorder bg-panel p-5">
          <div className="mb-3 text-center">
            <h2 className="text-base font-semibold">{t('ship.vessel')}</h2>
          </div>

          <div className="relative flex h-[420px] items-center justify-center rounded-md border border-panelBorder bg-well">
            <div
              className="h-32 w-64 bg-accent opacity-60"
              style={{ clipPath: 'polygon(0 50%, 17% 20%, 70% 20%, 100% 50%, 70% 80%, 17% 80%)' }}
            />

            {slots?.map((slotEntry) => (
              <button
                key={slotEntry.slot}
                type="button"
                onClick={() => slotEntry.item && setSelectedId(slotEntry.item.itemInstanceId)}
                className={`absolute w-[120px] min-h-[65px] rounded-md border border-dashed p-2 text-left ${SLOT_POSITION[slotEntry.slot]} ${
                  slotEntry.item ? 'border-textFaint' : 'border-accent'
                }`}
              >
                <div className="mb-1 text-[8px] uppercase tracking-wide text-textMuted">{t(`equipmentSlot.${slotEntry.slot}`)}</div>
                {slotEntry.item ? (
                  <div className="text-[9px] font-semibold">{t(slotEntry.item.nameKey)}</div>
                ) : (
                  <div className="text-[8px] text-textFaint">{t('ship.empty')}</div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* DETAILS */}
        <section className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
          <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
            <strong className="text-xs">{t('ship.details')}</strong>
            <span className="text-[9px] uppercase text-textFaint">
              {selected ? t(`equipmentSlot.${selected.slot}`) : t('ship.notSelected')}
            </span>
          </div>

          <div className="p-4">
            <div className="rounded-md border border-wellBorder bg-well p-4">
              {selected ? (
                <>
                  <h3 className="mb-1 text-sm font-semibold">{t(selected.nameKey)}</h3>
                  <p className="text-[10px] text-textMuted">
                    {t('ship.upgradeLevel')}: {selected.upgradeLevel}/{selected.maxUpgradeLevel}
                  </p>
                </>
              ) : (
                <p className="text-[10px] text-textMuted">{t('ship.selectPrompt')}</p>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!selected || selected.equipped}
                onClick={handleEquip}
                className="flex-1 rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
              >
                {t('ship.equip')}
              </button>
              <button
                type="button"
                disabled={!selected || !selected.equipped}
                onClick={handleUnequip}
                className="flex-1 rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
              >
                {t('ship.unequip')}
              </button>
            </div>

            <button
              type="button"
              disabled={!selected || selected.upgradeLevel >= selected.maxUpgradeLevel}
              onClick={handleUpgrade}
              className="mt-2 w-full rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
            >
              {t('ship.upgrade')}
            </button>
          </div>
        </section>
      </div>
    </GameLayout>
  );
}
