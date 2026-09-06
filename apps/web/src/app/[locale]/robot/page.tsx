'use client';

import type { CombatStatsDto, EquipmentSlot, InventoryItemDto, PlayerProfileDto, RobotAttributesDto, RobotSlotDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { CombatStatsCard } from '@/components/CombatStatsCard';
import { GameLayout } from '@/components/GameLayout';
import {
  allocateAttribute,
  consumeItem,
  equipItem,
  getInventory,
  getProfile,
  getRobot,
  getRobotAttributes,
  getRobotCombatStats,
  unequipSlot,
  upgradeItem,
} from '@/lib/api-client';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';

const SLOTS: EquipmentSlot[] = ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'ARMOR', 'CORE', 'LEFT_LEG', 'RIGHT_LEG'];

const SLOT_POSITION: Record<EquipmentSlot, string> = {
  HEAD: 'left-1/2 top-[2%] -translate-x-1/2',
  LEFT_ARM: 'left-[2%] top-[26%]',
  RIGHT_ARM: 'right-[2%] top-[26%]',
  ARMOR: 'left-1/2 top-[42%] -translate-x-1/2',
  CORE: 'left-1/2 top-[58%] -translate-x-1/2',
  LEFT_LEG: 'left-[10%] bottom-[3%]',
  RIGHT_LEG: 'right-[10%] bottom-[3%]',
};

const ATTRIBUTE_STATS = ['damage', 'defense', 'hp', 'evasion'] as const;
type AttributeStat = (typeof ATTRIBUTE_STATS)[number];

// Its effect targets a specific building's construction timer, so it can only be used from the Base screen.
function isBuildingTargetedConsumable(item: InventoryItemDto): boolean {
  return item.itemDefinitionKey.startsWith('construction_speedup');
}

export default function RobotPage() {
  useRequireAuth();
  const t = useTranslations();
  const [items, setItems] = useState<InventoryItemDto[] | null>(null);
  const [capacity, setCapacity] = useState(0);
  const [used, setUsed] = useState(0);
  const [slots, setSlots] = useState<RobotSlotDto[] | null>(null);
  const [attributes, setAttributes] = useState<RobotAttributesDto | null>(null);
  const [combatStats, setCombatStats] = useState<CombatStatsDto | null>(null);
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);
  const [filter, setFilter] = useState<EquipmentSlot | 'ALL' | 'CONSUMABLE'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [inventory, robot, attrs, stats, profileRes] = await Promise.all([
        getInventory(),
        getRobot(),
        getRobotAttributes(),
        getRobotCombatStats(),
        getProfile(),
      ]);
      setItems(inventory.items);
      setCapacity(inventory.capacity);
      setUsed(inventory.used);
      setSlots(robot);
      setAttributes(attrs);
      setCombatStats(stats);
      setProfile(profileRes);
    } catch {
      setError(t('robot.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = items?.find((item) => item.id === selectedId) ?? null;
  const visibleItems = useMemo(() => {
    if (!items) return [];
    if (filter === 'ALL') return items;
    if (filter === 'CONSUMABLE') return items.filter((item) => item.category === 'CONSUMABLE');
    return items.filter((item) => item.slot === filter);
  }, [items, filter]);

  async function handleEquip() {
    if (!selected) return;
    try {
      await equipItem(selected.id);
      await load();
    } catch {
      setError(t('robot.actionError'));
    }
  }

  async function handleUnequip() {
    if (!selected || !selected.slot) return;
    try {
      await unequipSlot(selected.slot);
      await load();
    } catch {
      setError(t('robot.actionError'));
    }
  }

  async function handleUseConsumable() {
    if (!selected) return;
    try {
      await consumeItem(selected.id);
      notifyProfileChanged();
      await load();
    } catch {
      setError(t('robot.useError'));
    }
  }

  async function handleUpgrade() {
    if (!selected) return;
    try {
      await upgradeItem(selected.id);
      notifyProfileChanged();
      await load();
    } catch {
      setError(t('robot.actionError'));
    }
  }

  async function handleAllocate(stat: AttributeStat) {
    try {
      await allocateAttribute(stat);
      await load();
    } catch {
      setError(t('robot.allocateError'));
    }
  }

  return (
    <GameLayout>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('robot.title')}</h1>
          <p className="text-xs text-textMuted">{t('robot.subtitle')}</p>
        </div>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr_310px]">
        {/* INVENTORY */}
        <section className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
          <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
            <strong className="text-xs">{t('robot.inventory')}</strong>
            <span className="text-[9px] uppercase text-textFaint tabular-nums">
              {used}/{capacity}
            </span>
          </div>

          <div className="p-3">
            <div className="mb-3 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className={`rounded px-2 py-1.5 text-[9px] uppercase ${filter === 'ALL' ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`}
              >
                {t('robot.all')}
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
              <button
                type="button"
                onClick={() => setFilter('CONSUMABLE')}
                className={`rounded px-2 py-1.5 text-[9px] uppercase ${filter === 'CONSUMABLE' ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`}
              >
                {t('robot.consumables')}
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={t(item.nameKey)}
                  onClick={() => setSelectedId(item.id)}
                  className={`relative flex aspect-square items-center justify-center rounded-md border ${
                    selectedId === item.id ? 'border-textFaint' : 'border-wellBorder'
                  } ${item.equipped ? 'opacity-50' : ''} bg-well`}
                >
                  <AssetIcon
                    assetId={item.iconAssetId}
                    alt={t(item.nameKey)}
                    className="h-full w-full object-contain p-1"
                    fallback={<span className="text-sm font-semibold text-textMuted">{t(item.nameKey).charAt(0)}</span>}
                  />
                  {item.slot ? (
                    item.upgradeLevel > 0 && (
                      <span className="absolute bottom-0.5 right-1 text-[8px] font-semibold text-accent">+{item.upgradeLevel}</span>
                    )
                  ) : (
                    <span className="absolute bottom-0.5 right-1 text-[8px] font-semibold text-accent">×{item.quantity}</span>
                  )}
                </button>
              ))}
              {filter === 'ALL' &&
                Array.from({ length: Math.max(0, capacity - used) }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square rounded-md border border-dashed border-wellBorder/60 bg-ink/40" />
                ))}
            </div>
          </div>
        </section>

        {/* ROBOT */}
        <section className="rounded-lg border border-panelBorder bg-panel p-5">
          <div className="mb-3 text-center">
            <h2 className="text-base font-semibold">{t('robot.frame')}</h2>
          </div>

          <div className="relative flex h-[420px] items-center justify-center rounded-md border border-panelBorder bg-well">
            <div className="relative h-[300px] w-[170px] opacity-60">
              <div className="absolute left-1/2 top-0 h-[46px] w-[62px] -translate-x-1/2 bg-accent" style={{ clipPath: 'polygon(15% 0, 85% 0, 100% 40%, 85% 100%, 15% 100%, 0 40%)' }} />
              <div className="absolute left-1/2 top-[52px] h-[100px] w-[100px] -translate-x-1/2 bg-accent" style={{ clipPath: 'polygon(20% 0, 80% 0, 100% 24%, 88% 100%, 12% 100%, 0 24%)' }} />
              <div className="absolute left-0 top-[62px] h-[120px] w-[34px] bg-accent" style={{ clipPath: 'polygon(30% 0, 100% 8%, 85% 78%, 55% 100%, 10% 92%, 0 20%)' }} />
              <div className="absolute right-0 top-[62px] h-[120px] w-[34px] bg-accent" style={{ clipPath: 'polygon(0 8%, 70% 0, 100% 20%, 90% 92%, 45% 100%, 15% 78%)' }} />
              <div className="absolute left-[24px] top-[150px] h-[140px] w-[44px] bg-accent" style={{ clipPath: 'polygon(12% 0, 90% 0, 100% 78%, 70% 100%, 5% 100%, 0 30%)' }} />
              <div className="absolute right-[24px] top-[150px] h-[140px] w-[44px] bg-accent" style={{ clipPath: 'polygon(10% 0, 88% 0, 100% 30%, 95% 100%, 30% 100%, 0 78%)' }} />
            </div>

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
                  <div className="text-[8px] text-textFaint">{t('robot.empty')}</div>
                )}
              </button>
            ))}
          </div>

          {combatStats && (
            <div className="mt-4">
              <CombatStatsCard title={profile?.username ?? t('robot.frame')} stats={combatStats} variant="player" />
            </div>
          )}

          {attributes && (
            <div className="mt-4 rounded-md border border-wellBorder bg-well p-4">
              <div className="mb-3 flex items-center justify-between">
                <strong className="text-xs">{t('robot.attributes')}</strong>
                <span className="text-[9px] uppercase text-textFaint">
                  {t('robot.attributePoints')}: <span className="text-text">{attributes.available}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ATTRIBUTE_STATS.map((stat) => {
                  const atCap = stat === 'evasion' && attributes.evasionAtCap;
                  return (
                    <div key={stat} className="rounded-md border border-wellBorder bg-ink p-2.5 text-center">
                      <div className="text-[9px] uppercase text-textFaint">{t(`robot.stat.${stat}`)}</div>
                      <div className="my-1 text-base font-semibold">{attributes.base[stat]}</div>
                      <button
                        type="button"
                        disabled={atCap || attributes.available < attributes.nextCost[stat]}
                        onClick={() => handleAllocate(stat)}
                        className="w-full rounded border border-accent bg-accentBg py-1 text-[10px] hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {atCap ? t('robot.attributeMax') : `+1 (${attributes.nextCost[stat]})`}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[9px] text-textFaint">{t('robot.attributeNote')}</p>
            </div>
          )}
        </section>

        {/* DETAILS */}
        <section className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
          <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
            <strong className="text-xs">{t('robot.details')}</strong>
            <span className="text-[9px] uppercase text-textFaint">
              {selected ? (selected.slot ? t(`equipmentSlot.${selected.slot}`) : t('robot.consumables')) : t('robot.notSelected')}
            </span>
          </div>

          <div className="p-4">
            {selected && (
              <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-md border border-wellBorder bg-well">
                <AssetIcon
                  assetId={selected.iconAssetId}
                  alt={t(selected.nameKey)}
                  className="h-full w-full object-contain p-2"
                  fallback={<span className="text-xl font-semibold text-textMuted">{t(selected.nameKey).charAt(0)}</span>}
                />
              </div>
            )}
            <div className="rounded-md border border-wellBorder bg-well p-4">
              {selected ? (
                selected.category === 'CONSUMABLE' ? (
                  <>
                    <h3 className="mb-1 text-sm font-semibold">{t(selected.nameKey)}</h3>
                    <p className="mb-2 text-[10px] text-textMuted">{t(selected.descriptionKey)}</p>
                    <p className="text-[10px] text-textFaint">
                      {t('robot.quantity')}: {selected.quantity}
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="mb-1 text-sm font-semibold">{t(selected.nameKey)}</h3>
                    <p className="text-[10px] text-textMuted">
                      {t('robot.upgradeLevel')}: {selected.upgradeLevel}/{selected.maxUpgradeLevel}
                    </p>
                  </>
                )
              ) : (
                <p className="text-[10px] text-textMuted">{t('robot.selectPrompt')}</p>
              )}
            </div>

            {selected?.category === 'CONSUMABLE' ? (
              isBuildingTargetedConsumable(selected) ? (
                <p className="mt-3 text-[10px] text-textFaint">{t('robot.useOnBase')}</p>
              ) : (
                <button
                  type="button"
                  onClick={handleUseConsumable}
                  className="mt-3 w-full rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover"
                >
                  {t('robot.use')}
                </button>
              )
            ) : (
              <>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={!selected || selected.equipped}
                    onClick={handleEquip}
                    className="flex-1 rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('robot.equip')}
                  </button>
                  <button
                    type="button"
                    disabled={!selected || !selected.equipped}
                    onClick={handleUnequip}
                    className="flex-1 rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('robot.unequip')}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!selected || selected.upgradeLevel >= selected.maxUpgradeLevel}
                  onClick={handleUpgrade}
                  className="mt-2 w-full rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {t('robot.upgrade')}
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </GameLayout>
  );
}
