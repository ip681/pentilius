'use client';

import type { BoxOpenResultDto, CombatStatsDto, EquipmentSlot, EquippedItemDto, InventoryItemDto, PlayerProfileDto, Race, RobotAttributesDto, RobotSlotDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { CombatStatsCard } from '@/components/CombatStatsCard';
import { ConfirmButton } from '@/components/ConfirmButton';
import { GameLayout } from '@/components/GameLayout';
import { NextLevelValue } from '@/components/NextLevelValue';
import { ResourceIcon } from '@/components/ResourceIcon';
import {
  allocateAttribute,
  ApiError,
  consumeItem,
  equipItem,
  getInventory,
  getProfile,
  getRobot,
  getRobotAttributes,
  getRobotCombatStats,
  openBox,
  recycleItem,
  sellItem,
  unequipSlot,
  upgradeItem,
} from '@/lib/api-client';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';

const SLOTS: EquipmentSlot[] = ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'ARMOR', 'CORE', 'LEFT_LEG', 'RIGHT_LEG'];

// A race-locked item's inventory square gets a tint of its race's brand color
// (instructions/PRODUCT_SPEC.md) instead of the plain well background — still
// darker than the full brand color, but strong enough to actually read at a
// glance against the icon and dark theme.
const RACE_BG_CLASS: Record<Race, string> = {
  LUXARI: 'bg-raceLuxari/20',
  VORLUN: 'bg-raceVorlun/20',
  ZARYTH: 'bg-raceZaryth/20',
  THALION: 'bg-raceThalion/20',
  NEXAR: 'bg-raceNexar/20',
};

const ATTRIBUTE_STATS = ['damage', 'defense', 'hp', 'evasion'] as const;
type AttributeStat = (typeof ATTRIBUTE_STATS)[number];

function itemForSlot(slots: RobotSlotDto[] | null, slot: EquipmentSlot): EquippedItemDto | null {
  return slots?.find((s) => s.slot === slot)?.item ?? null;
}

const TOOLTIP_WIDTH = 224;

// `position: fixed` (viewport-relative) rather than an absolutely-positioned
// child, so the tooltip can't be clipped by the inventory grid's own
// overflow-y-auto scroll container — it escapes that ancestor entirely.
// Flips above the item when there isn't enough room below the viewport edge.
function tooltipPositionStyle(rect: DOMRect): CSSProperties {
  const gap = 8;
  const left = Math.min(Math.max(gap, rect.left), window.innerWidth - TOOLTIP_WIDTH - gap);
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 140) {
    return { left, bottom: window.innerHeight - rect.top + gap };
  }
  return { left, top: rect.bottom + gap };
}

// Desktop-only hover preview (mouse enter/leave never meaningfully fires on
// touch) — the native `title` tooltip it replaces only ever showed the name
// and can't be styled or hold real content. `children` lets callers show
// either a plain description or the equipped-item's full stat breakdown.
function ItemHoverTooltip({ rect, name, children }: { rect: DOMRect; name: string; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-md border border-panelBorder bg-panel p-2.5 text-[11px] shadow-lg"
      style={{ width: TOOLTIP_WIDTH, ...tooltipPositionStyle(rect) }}
    >
      <p className="mb-1 font-semibold text-text">{name}</p>
      {children}
    </div>
  );
}

// Full stat/race/options breakdown for an equipment item's hover tooltip —
// any item with a slot (EQUIPMENT), equipped or not — same information as
// the click-through details panel below, minus its action rows
// (upgrade/sell/recycle), which don't belong in a hover preview.
function EquipmentTooltipDetails({ item, playerRace }: { item: InventoryItemDto; playerRace: Race | undefined }) {
  const t = useTranslations();
  const hasStats = item.currentStats?.attack !== undefined || item.currentStats?.defense !== undefined || item.currentStats?.hp !== undefined;

  return (
    <>
      <p className="mb-1.5 text-textMuted">
        {t('robot.upgradeLevel')}: {item.upgradeLevel}/{item.maxUpgradeLevel}
      </p>
      {hasStats && (
        <div className="mb-1.5 rounded border border-wellBorder bg-ink p-2">
          {(['attack', 'defense', 'hp'] as const).map((key) => {
            const value = item.currentStats?.[key];
            if (value === undefined) return null;
            return (
              <div key={key} className="flex justify-between text-textFaint">
                <span>{t(`robot.stat.${key === 'attack' ? 'damage' : key}`)}</span>
                <span className="text-text">{value}</span>
              </div>
            );
          })}
        </div>
      )}
      {item.race && (
        <p className={`mb-1.5 flex items-center gap-1.5 ${item.race === playerRace ? 'text-positive' : 'text-danger'}`}>
          <AssetIcon
            assetId={`races.${item.race.toLowerCase()}.icon`}
            alt={t(`race.${item.race}.name`)}
            className="h-3.5 w-3.5 shrink-0 object-contain"
            fallback={<span className="text-[8px] font-semibold">{t(`race.${item.race}.name`).charAt(0)}</span>}
          />
          {t('robot.raceLocked', { race: t(`race.${item.race}.name`) })}
        </p>
      )}
      {item.rolledOptions.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {item.rolledOptions.map((option) => (
            <li key={option} className="text-positive">
              {t(`itemOption.${option}`)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function SlotBadge({
  slot,
  item,
  fullItem,
  playerRace,
  onSelect,
}: {
  slot: EquipmentSlot;
  item: EquippedItemDto | null;
  // The same instance as looked up from the full inventory list — carries
  // stats/race/options that the stripped-down EquippedItemDto doesn't, purely
  // for the richer hover tooltip below.
  fullItem: InventoryItemDto | null;
  playerRace: Race | undefined;
  onSelect: (itemInstanceId: string) => void;
}) {
  const t = useTranslations();
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);

  if (!item) {
    return (
      <div
        title={t(`equipmentSlot.${slot}`)}
        className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-accent bg-well text-sm text-textFaint sm:h-20 sm:w-20"
      >
        +
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(item.itemInstanceId)}
        onMouseEnter={(e) => setHoverRect(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setHoverRect(null)}
        className={`relative flex h-14 w-14 items-center justify-center rounded-md border-2 hover:border-accent sm:h-20 sm:w-20 ${
          item.quality === 'EPIC' ? 'border-epic' : item.quality === 'RARE' ? 'border-positive' : 'border-textFaint'
        } ${item.race ? RACE_BG_CLASS[item.race] : 'bg-well'}`}
      >
        <AssetIcon
          assetId={item.iconAssetId}
          alt={t(item.nameKey)}
          className="h-full w-full rounded-md object-contain p-1"
          fallback={<span className="text-xs font-semibold text-textMuted">{t(item.nameKey).charAt(0)}</span>}
        />
        {item.upgradeLevel > 0 && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-accent px-1 text-[7px] font-semibold text-text">+{item.upgradeLevel}</span>
        )}
      </button>
      {hoverRect && (
        <ItemHoverTooltip rect={hoverRect} name={t(item.nameKey)}>
          {fullItem ? <EquipmentTooltipDetails item={fullItem} playerRace={playerRace} /> : <p className="text-textMuted">{t(item.descriptionKey)}</p>}
        </ItemHoverTooltip>
      )}
    </>
  );
}

function SlotRow({
  slot,
  item,
  fullItem,
  playerRace,
  onSelect,
}: {
  slot: EquipmentSlot;
  item: EquippedItemDto | null;
  fullItem: InventoryItemDto | null;
  playerRace: Race | undefined;
  onSelect: (itemInstanceId: string) => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-col items-center gap-1">
      <SlotBadge slot={slot} item={item} fullItem={fullItem} playerRace={playerRace} onSelect={onSelect} />
      <span className="text-center text-[8px] uppercase tracking-wide text-textFaint">{t(`equipmentSlot.${slot}`)}</span>
    </div>
  );
}

// Its effect targets a specific building's construction timer, so it can only be used from the Base screen.
function isBuildingTargetedConsumable(item: InventoryItemDto): boolean {
  return item.itemDefinitionKey.startsWith('construction_speedup');
}

// A loot box (owner decision) — opened for a guaranteed Rare/Epic item of its tier, never "used" like a plain consumable.
function isBox(item: InventoryItemDto): boolean {
  return item.itemDefinitionKey.endsWith('_box');
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
  const [hoveredItem, setHoveredItem] = useState<{ item: InventoryItemDto; rect: DOMRect } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boxResult, setBoxResult] = useState<BoxOpenResultDto | null>(null);

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
  // Equipped items are also part of the full inventory list (marked `equipped: true`),
  // so the richer InventoryItemDto for a slot's item is just a lookup by id — no
  // separate backend data needed for the equipment hover tooltip's stat breakdown.
  function fullItemForSlot(slot: EquipmentSlot): InventoryItemDto | null {
    const equipped = itemForSlot(slots, slot);
    return equipped ? (items?.find((i) => i.id === equipped.itemInstanceId) ?? null) : null;
  }
  const ownedUpgradeMaterial = selected?.upgradeCost
    ? (items?.find((i) => i.itemDefinitionKey === selected.upgradeCost!.itemDefinitionKey)?.quantity ?? 0)
    : 0;
  const canAffordUpgrade = !selected?.upgradeCost || ownedUpgradeMaterial >= selected.upgradeCost.quantity;
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
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'RACE_MISMATCH' ? t('robot.raceMismatch') : t('robot.actionError'));
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

  async function handleOpenBox() {
    if (!selected) return;
    setError(null);
    try {
      const result = await openBox(selected.id);
      setBoxResult(result);
      setSelectedId(null);
      notifyProfileChanged();
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'INVENTORY_FULL' ? t('robot.inventoryFull') : t('robot.openError'));
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

  async function handleSell() {
    if (!selected) return;
    try {
      await sellItem(selected.id);
      notifyProfileChanged();
      setSelectedId(null);
      await load();
    } catch {
      setError(t('robot.actionError'));
    }
  }

  async function handleRecycle() {
    if (!selected) return;
    try {
      await recycleItem(selected.id);
      notifyProfileChanged();
      setSelectedId(null);
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

      {boxResult && (
        <div className="mb-6 flex items-center gap-4 rounded-lg border border-panelBorder bg-panel p-5">
          <div className="h-14 w-14 shrink-0">
            <AssetIcon
              assetId={boxResult.iconAssetId}
              alt={t(boxResult.nameKey)}
              className="h-full w-full object-contain"
              fallback={<span className="text-lg font-semibold text-textMuted">{t(boxResult.nameKey).charAt(0)}</span>}
            />
          </div>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-textFaint">{t('robot.boxOpenedTitle')}</div>
            <p className="text-sm font-semibold">
              {t(boxResult.nameKey)} · <span className={boxResult.quality === 'EPIC' ? 'text-epic' : 'text-positive'}>{t(`itemQuality.${boxResult.quality}`)}</span>
            </p>
            {boxResult.rolledOptions.length > 0 && (
              <p className={`mt-1 text-[11px] ${boxResult.quality === 'EPIC' ? 'text-epic' : 'text-positive'}`}>
                {boxResult.rolledOptions.map((option) => t(`itemOption.${option}`)).join(', ')}
              </p>
            )}
            {boxResult.race && (
              <p className="mt-1 flex items-center gap-1.5 text-[10px] text-textFaint">
                <AssetIcon
                  assetId={`races.${boxResult.race.toLowerCase()}.icon`}
                  alt={t(`race.${boxResult.race}.name`)}
                  className="h-3.5 w-3.5 shrink-0 object-contain"
                  fallback={<span className="text-[8px] font-semibold">{t(`race.${boxResult.race}.name`).charAt(0)}</span>}
                />
                {t('robot.raceLocked', { race: t(`race.${boxResult.race}.name`) })}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        {/* INVENTORY */}
        <section className="overflow-hidden rounded-lg border border-panelBorder bg-panel lg:flex lg:flex-col">
          <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
            <strong className="text-xs">{t('robot.inventory')}</strong>
            <span className="text-[9px] uppercase text-textFaint tabular-nums">
              {used}/{capacity}
            </span>
          </div>

          <div className="p-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
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

            <div className="grid grid-cols-5 gap-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-0.5">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  onMouseEnter={(e) => setHoveredItem({ item, rect: e.currentTarget.getBoundingClientRect() })}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`relative flex aspect-square items-center justify-center rounded-md border ${
                    selectedId === item.id
                      ? 'border-textFaint'
                      : item.quality === 'EPIC'
                        ? 'border-epic'
                        : item.quality === 'RARE'
                          ? 'border-positive'
                          : 'border-wellBorder'
                  } ${item.race ? RACE_BG_CLASS[item.race] : 'bg-well'}`}
                >
                  <AssetIcon
                    assetId={item.iconAssetId}
                    alt={t(item.nameKey)}
                    className="h-full w-full object-contain p-1"
                    fallback={<span className="text-sm font-semibold text-textMuted">{t(item.nameKey).charAt(0)}</span>}
                  />
                  {item.quality === 'EPIC' && <span className="absolute left-0.5 top-0.5 text-[7px] font-semibold uppercase text-epic">{t('itemQuality.EPIC')}</span>}
                  {item.quality === 'RARE' && <span className="absolute left-0.5 top-0.5 text-[7px] font-semibold uppercase text-positive">{t('itemQuality.RARE')}</span>}
                  {item.equipped && (
                    <span className="absolute bottom-0.5 left-0.5 rounded bg-[#1e40af] px-1 py-0.5 text-[7px] font-semibold uppercase leading-none text-text">
                      {t('robot.equippedBadge')}
                    </span>
                  )}
                  {item.slot ? (
                    item.upgradeLevel > 0 && (
                      <span className="absolute bottom-0.5 right-1 text-[8px] font-semibold text-accent">+{item.upgradeLevel}</span>
                    )
                  ) : (
                    <span className="absolute bottom-0.5 right-1 text-[8px] font-semibold text-text">×{item.quantity}</span>
                  )}
                </button>
              ))}
              {filter === 'ALL' &&
                Array.from({ length: Math.max(0, capacity - used) }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square rounded-md border border-dashed border-wellBorder/60 bg-ink/40" />
                ))}
            </div>
          </div>
          {hoveredItem && (
            <ItemHoverTooltip rect={hoveredItem.rect} name={t(hoveredItem.item.nameKey)}>
              {hoveredItem.item.slot ? (
                <EquipmentTooltipDetails item={hoveredItem.item} playerRace={profile?.race} />
              ) : (
                <p className="text-textMuted">{t(hoveredItem.item.descriptionKey)}</p>
              )}
            </ItemHoverTooltip>
          )}
        </section>

        {/* Nested so Equipment and Stats stretch to match each other's height
            on desktop — that height (via the outer grid's default stretch)
            is what Inventory matches too, scrolling internally if its item
            grid would otherwise need more room than that. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[460px_1fr]">
          {/* ROBOT */}
          <section className="rounded-lg border border-panelBorder bg-panel p-5">
          <div className="mb-4 text-center">
            <h2 className="text-base font-semibold">{t('robot.equipment')}</h2>
          </div>

          <div className="mx-auto max-w-[420px] rounded-md border border-panelBorder bg-well p-6">
            <div className="flex justify-center gap-4">
              <div className="h-14 w-14 sm:h-20 sm:w-20" aria-hidden="true" />
              <SlotRow slot="HEAD" item={itemForSlot(slots, 'HEAD')} fullItem={fullItemForSlot('HEAD')} playerRace={profile?.race} onSelect={setSelectedId} />
              <SlotRow slot="CORE" item={itemForSlot(slots, 'CORE')} fullItem={fullItemForSlot('CORE')} playerRace={profile?.race} onSelect={setSelectedId} />
            </div>

            <div className="mt-6 flex justify-center gap-4">
              <SlotRow slot="LEFT_ARM" item={itemForSlot(slots, 'LEFT_ARM')} fullItem={fullItemForSlot('LEFT_ARM')} playerRace={profile?.race} onSelect={setSelectedId} />
              <SlotRow slot="ARMOR" item={itemForSlot(slots, 'ARMOR')} fullItem={fullItemForSlot('ARMOR')} playerRace={profile?.race} onSelect={setSelectedId} />
              <SlotRow slot="RIGHT_ARM" item={itemForSlot(slots, 'RIGHT_ARM')} fullItem={fullItemForSlot('RIGHT_ARM')} playerRace={profile?.race} onSelect={setSelectedId} />
            </div>

            <div className="mt-6 flex justify-center gap-4">
              <SlotRow slot="LEFT_LEG" item={itemForSlot(slots, 'LEFT_LEG')} fullItem={fullItemForSlot('LEFT_LEG')} playerRace={profile?.race} onSelect={setSelectedId} />
              <SlotRow slot="RIGHT_LEG" item={itemForSlot(slots, 'RIGHT_LEG')} fullItem={fullItemForSlot('RIGHT_LEG')} playerRace={profile?.race} onSelect={setSelectedId} />
            </div>
          </div>

          {combatStats && (
            <div className="mt-4">
              <CombatStatsCard title={t('robot.combatStats')} stats={combatStats} variant="player" />
            </div>
          )}
        </section>

        {/* STATS */}
        <section className="rounded-lg border border-panelBorder bg-panel p-5">
          {attributes && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">{t('robot.attributes')}</h2>
                <span className="text-[9px] uppercase text-textFaint">
                  {t('robot.attributePoints')}: <span className="text-text">{attributes.available}</span>
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {ATTRIBUTE_STATS.map((stat) => {
                  const atCap = stat === 'evasion' && attributes.evasionAtCap;
                  return (
                    <div key={stat} className="flex items-center justify-between gap-3 rounded-md border border-wellBorder bg-well p-2.5">
                      <div>
                        <div className="text-[9px] uppercase text-textFaint">{t(`robot.stat.${stat}`)}</div>
                        <div className="text-base font-semibold">{attributes.base[stat]}</div>
                      </div>
                      <button
                        type="button"
                        disabled={atCap || attributes.available < attributes.nextCost[stat]}
                        onClick={() => handleAllocate(stat)}
                        className="shrink-0 rounded border border-accent bg-accentBg px-3 py-1.5 text-[10px] hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {atCap ? t('robot.attributeMax') : `+1 (${attributes.nextCost[stat]})`}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[9px] text-textFaint">{t('robot.attributeNote')}</p>
            </>
          )}
        </section>
        </div>
      </div>

      <BottomSheet open={!!selected} onClose={() => setSelectedId(null)}>
        {selected && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[9px] uppercase text-textFaint">
                {selected.slot ? t(`equipmentSlot.${selected.slot}`) : t('robot.consumables')}
              </span>
              <button type="button" onClick={() => setSelectedId(null)} aria-label={t('common.close')} className="text-textFaint hover:text-text">
                ✕
              </button>
            </div>

            <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-md border border-wellBorder bg-well">
              <AssetIcon
                assetId={selected.iconAssetId}
                alt={t(selected.nameKey)}
                className="h-full w-full object-contain p-2"
                fallback={<span className="text-xl font-semibold text-textMuted">{t(selected.nameKey).charAt(0)}</span>}
              />
            </div>

            <div className="rounded-md border border-wellBorder bg-well p-4">
              {selected.category === 'CONSUMABLE' ? (
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
                  {(selected.currentStats?.attack !== undefined || selected.currentStats?.defense !== undefined || selected.currentStats?.hp !== undefined) && (
                    <div className="mt-2 rounded border border-wellBorder bg-ink p-2.5">
                      {(['attack', 'defense', 'hp'] as const).map((key) => {
                        const current = selected.currentStats?.[key];
                        if (current === undefined) return null;
                        const next = selected.nextLevelStats?.[key];
                        return (
                          <div key={key} className="mb-1 flex justify-between text-[10px] last:mb-0">
                            <span className="text-textFaint">{t(`robot.stat.${key === 'attack' ? 'damage' : key}`)}</span>
                            <span>
                              <NextLevelValue current={String(current)} next={next !== undefined ? String(next) : null} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selected.upgradeCost && (
                    <p className={`mt-2 text-[10px] ${canAffordUpgrade ? 'text-textFaint' : 'text-danger'}`}>
                      {t('robot.upgradeCost')}: {t(`items.${selected.upgradeCost.itemDefinitionKey}.name`)} × {selected.upgradeCost.quantity} (
                      {t('robot.owned')}: {ownedUpgradeMaterial})
                    </p>
                  )}
                  {selected.race && (
                    <p className={`mt-1 flex items-center gap-1.5 text-[10px] ${selected.race === profile?.race ? 'text-positive' : 'text-danger'}`}>
                      <AssetIcon
                        assetId={`races.${selected.race.toLowerCase()}.icon`}
                        alt={t(`race.${selected.race}.name`)}
                        className="h-3.5 w-3.5 shrink-0 object-contain"
                        fallback={<span className="text-[8px] font-semibold">{t(`race.${selected.race}.name`).charAt(0)}</span>}
                      />
                      {t('robot.raceLocked', { race: t(`race.${selected.race}.name`) })}
                    </p>
                  )}
                  {selected.rolledOptions.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-0.5">
                      {selected.rolledOptions.map((option) => (
                        <li key={option} className="text-[10px] text-positive">
                          {t(`itemOption.${option}`)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {selected.sellValue && (
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-textFaint">
                      <span>{t('robot.sellValue')}:</span>
                      <span className="flex items-center gap-1">
                        {selected.sellValue.metal} <ResourceIcon type="METAL" className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex items-center gap-1">
                        {selected.sellValue.crystal} <ResourceIcon type="CRYSTAL" className="h-3.5 w-3.5" />
                      </span>
                    </p>
                  )}
                  {selected.recycleValue && (
                    <p className="mt-1 text-[10px] text-textFaint">
                      {t('robot.recycleProgress', {
                        name: t(`items.${selected.recycleValue.fragmentItemDefinitionKey}.name`),
                        owned: selected.recycleValue.ownedFragments,
                        required: selected.recycleValue.fragmentsPerStone,
                      })}
                    </p>
                  )}
                </>
              )}
            </div>

            {selected.category === 'CONSUMABLE' ? (
              isBox(selected) ? (
                <button
                  type="button"
                  onClick={handleOpenBox}
                  className="mt-3 w-full rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover"
                >
                  {t('robot.open')}
                </button>
              ) : isBuildingTargetedConsumable(selected) ? (
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
                    disabled={selected.equipped || (!!selected.race && selected.race !== profile?.race)}
                    onClick={handleEquip}
                    className="flex-1 rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('robot.equip')}
                  </button>
                  <button
                    type="button"
                    disabled={!selected.equipped}
                    onClick={handleUnequip}
                    className="flex-1 rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('robot.unequip')}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={selected.upgradeLevel >= selected.maxUpgradeLevel || !canAffordUpgrade}
                  onClick={handleUpgrade}
                  className="mt-2 w-full rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {t('robot.upgrade')}
                </button>

                <div className="mt-2 flex gap-2">
                  <ConfirmButton
                    key={`sell-${selected.id}`}
                    label={t('robot.sell')}
                    confirmLabel={t('common.confirm')}
                    cancelLabel={t('common.cancel')}
                    message={
                      selected.sellValue
                        ? t('robot.sellConfirm', { metal: selected.sellValue.metal, crystal: selected.sellValue.crystal })
                        : undefined
                    }
                    onConfirm={handleSell}
                    disabled={selected.equipped}
                    className="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-[10px] uppercase text-danger hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                    confirmClassName="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-[10px] uppercase text-danger hover:bg-accentBgHover"
                    cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel py-2.5 text-[10px] uppercase text-textMuted hover:bg-accentBgHover"
                    wrapperClassName="flex-1"
                  />
                  <ConfirmButton
                    key={`recycle-${selected.id}`}
                    label={t('robot.recycle')}
                    confirmLabel={t('common.confirm')}
                    cancelLabel={t('common.cancel')}
                    message={
                      selected.recycleValue
                        ? t('robot.recycleConfirm', { name: t(`items.${selected.recycleValue.fragmentItemDefinitionKey}.name`) })
                        : undefined
                    }
                    onConfirm={handleRecycle}
                    disabled={selected.equipped}
                    className="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-[10px] uppercase text-danger hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                    confirmClassName="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-[10px] uppercase text-danger hover:bg-accentBgHover"
                    cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel py-2.5 text-[10px] uppercase text-textMuted hover:bg-accentBgHover"
                    wrapperClassName="flex-1"
                  />
                </div>
              </>
            )}
          </>
        )}
      </BottomSheet>
    </GameLayout>
  );
}
