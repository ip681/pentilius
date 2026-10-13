'use client';

import type { BaseResponseDto, BuildingStateDto, InventoryItemDto, ResourcesDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { GameLayout } from '@/components/GameLayout';
import { ResourceIcon } from '@/components/ResourceIcon';
import { ApiError, cancelBuildQueue, consumeItem, getBase, getInventory, queueBuilding, upgradeBuilding } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';

function isConstructionSpeedup(item: InventoryItemDto): boolean {
  return item.itemDefinitionKey.startsWith('construction_speedup');
}

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

// Drawn as parts of the wall frame instead of tiles on the terrain:
// the 4 corner towers and the 4 wall segments.
const DEFENSE_SYSTEM_KEY = 'defense_system';
const DEFENSIVE_WALL_KEY = 'defensive_wall';
const FRAME_BUILDING_KEYS = [DEFENSE_SYSTEM_KEY, DEFENSIVE_WALL_KEY];

function canAffordUpgrade(building: BuildingStateDto, resources: ResourcesDto): boolean {
  return !!building.nextLevelCost && resources.metal >= building.nextLevelCost.metalCost && resources.crystal >= building.nextLevelCost.crystalCost;
}

/**
 * The base as a fortress (owner decision, 2026-10-12): buildings sit as tiles
 * on terrain inside a wall frame — picture, then "Name (level)" — and open a
 * sheet with effect, cost and actions on click, the same pattern as the clan
 * buildings. The walls and corner towers are only a frame for now; they are
 * planned to become buildings of their own later.
 */
export default function BasePage() {
  useRequireAuth();
  const t = useTranslations();
  const [data, setData] = useState<BaseResponseDto | null>(null);
  const [speedupItems, setSpeedupItems] = useState<InventoryItemDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  async function load() {
    try {
      const [base, inventory] = await Promise.all([getBase(), getInventory()]);
      setData(base);
      setSpeedupItems(inventory.items.filter(isConstructionSpeedup));
    } catch {
      setError(t('base.loadError'));
    }
  }

  // 1s re-render so construction countdowns tick smoothly between the 3s data refreshes.
  const [, setTick] = useState(0);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    const clock = setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpgrade(key: string) {
    setError(null);
    try {
      await upgradeBuilding(key);
      notifyProfileChanged();
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ANOTHER_BUILDING_UNDER_CONSTRUCTION') {
        setError(t('base.anotherBuildingActive'));
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t('base.notEnoughResources'));
      } else {
        setError(t('base.upgradeError'));
      }
    }
  }

  async function handleQueue(key: string) {
    setError(null);
    try {
      setData(await queueBuilding(key));
      notifyProfileChanged();
      closeSheet();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BUILD_QUEUE_FULL') {
        setError(t('base.queueFull'));
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t('base.notEnoughResources'));
      } else {
        setError(t('base.upgradeError'));
      }
    }
  }

  async function handleCancelQueue() {
    setError(null);
    try {
      setData(await cancelBuildQueue());
      notifyProfileChanged();
    } catch {
      await load();
    }
  }

  async function handleUseSpeedup(itemInstanceId: string, buildingKey: string) {
    setError(null);
    try {
      await consumeItem(itemInstanceId, buildingKey);
      await load();
    } catch {
      setError(t('base.speedupError'));
    }
  }

  function closeSheet() {
    setSelectedKey(null);
    setError(null);
  }

  const anyUnderConstruction = data?.buildings.some((b) => buildingProgress(b).active) ?? false;
  const selected = data?.buildings.find((b) => b.key === selectedKey) ?? null;
  const defenseSystem = data?.buildings.find((b) => b.key === DEFENSE_SYSTEM_KEY) ?? null;
  const defensiveWall = data?.buildings.find((b) => b.key === DEFENSIVE_WALL_KEY) ?? null;
  const terrainBuildings = data?.buildings.filter((b) => !FRAME_BUILDING_KEYS.includes(b.key)) ?? [];
  const toFramePart = (building: BuildingStateDto | null): FortressPart | null =>
    building && data
      ? {
          label: `${t(building.nameKey)} (${building.level})`,
          level: building.level,
          constructing: buildingProgress(building).active,
          upgradeReady: !anyUnderConstruction && canAffordUpgrade(building, data.resources),
          upgradeReadyLabel: t('base.upgradeAvailable'),
          onClick: () => setSelectedKey(building.key),
        }
      : null;
  // Only one base building can be under construction at a time.
  const constructing = data?.buildings.find((b) => buildingProgress(b).active) ?? null;
  const constructingProgress = constructing ? buildingProgress(constructing) : null;
  const queued = data?.buildQueue ? (data.buildings.find((b) => b.key === data.buildQueue!.buildingKey) ?? null) : null;
  // VIP build queue (owner decision, 2026-10-13): one slot, only while something is being built.
  const canQueue = !!data?.isVip && anyUnderConstruction && !data.buildQueue;

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('base.title')}</h1>
        <p className="text-xs text-textMuted">{t('base.subtitle')}</p>
      </div>

      {error && !selected && <p className="mb-4 text-xs text-danger">{error}</p>}

      {/* Construction banner — the only place progress is visible for buildings without a tile (the corner towers and walls). */}
      {constructing && constructingProgress && (
        <button
          type="button"
          onClick={() => setSelectedKey(constructing.key)}
          className="mb-4 block w-full rounded-lg border border-panelBorder bg-panel px-4 py-3 text-left hover:border-accent"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <span>
              {t('base.constructing', { building: t(constructing.nameKey), level: constructing.level + 1 })}
            </span>
            <span className="tabular-nums text-textMuted">{formatDuration(constructingProgress.secondsLeft)}</span>
          </div>
          <div className="h-[6px] overflow-hidden rounded-full bg-wellBorder">
            <div className="h-full bg-accent transition-all" style={{ width: `${constructingProgress.percent}%` }} />
          </div>
        </button>
      )}

      {data?.buildQueue && queued && (
        <div className="-mt-2 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-vip/40 bg-panel px-4 py-2 text-xs">
          <span className="text-vip">{t('base.queued', { building: t(queued.nameKey), level: data.buildQueue.targetLevel })}</span>
          <button type="button" onClick={handleCancelQueue} className="text-[11px] text-textFaint underline hover:text-text">
            {t('base.cancelQueue')}
          </button>
        </div>
      )}

      {data && (
        <FortressFrame corners={toFramePart(defenseSystem)} walls={toFramePart(defensiveWall)}>
          <div className="grid justify-center gap-x-4 gap-y-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 140px))' }}>
            {terrainBuildings.map((building) => {
              const progress = buildingProgress(building);
              const upgradeReady = !anyUnderConstruction && canAffordUpgrade(building, data.resources);
              return (
                <button
                  key={building.key}
                  type="button"
                  onClick={() => setSelectedKey(building.key)}
                  className="relative flex flex-col items-center gap-1 rounded-lg p-1 transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-accent"
                >
                  {upgradeReady && (
                    <span className="absolute right-2 top-1 z-10 h-2.5 w-2.5 rounded-full bg-positive" title={t('base.upgradeAvailable')} />
                  )}
                  {/* Production as an overlay in the top-left corner, so it doesn't make the tile taller. */}
                  {building.currentProduction && (
                    <span className="absolute left-0 top-0 z-10 flex items-center gap-1 rounded bg-black/35 px-1.5 py-0.5 text-[10px] tabular-nums text-positive">
                      <ResourceIcon type={building.currentProduction.resourceType} className="h-3 w-3" />+{building.currentProduction.perHour}/
                      {t('base.perHour')}
                    </span>
                  )}
                  <AssetIcon
                    assetId={building.iconAssetId}
                    alt={t(building.nameKey)}
                    className={`h-20 w-20 object-contain drop-shadow-lg sm:h-28 sm:w-28 ${building.level > 0 ? '' : 'opacity-40 grayscale'}`}
                    fallback={
                      <div
                        className={`flex h-20 w-20 items-center justify-center rounded-sm bg-accent text-2xl font-semibold text-textMuted drop-shadow-lg sm:h-28 sm:w-28 ${building.level > 0 ? 'opacity-80' : 'opacity-30'}`}
                      >
                        {t(building.nameKey).charAt(0)}
                      </div>
                    }
                  />
                  <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold text-white sm:text-xs">
                    {t(building.nameKey)} <span className="text-white/60">({building.level})</span>
                  </span>


                  {progress.active && (
                    <div className="w-full max-w-[110px]">
                      <div className="h-[4px] overflow-hidden rounded-full bg-black/50">
                        <div className="h-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} />
                      </div>
                      <span className="mt-0.5 block text-[10px] tabular-nums text-white/80">{formatDuration(progress.secondsLeft)}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </FortressFrame>
      )}

      {/* Compact list of every base building — "(level) Name" — opening the same sheet.
          Mainly so the frame buildings (corner towers, walls), which have no label of
          their own, are listed by name too. Owner trial (2026-10-12): may be removed. */}
      {data && (
        <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {data.buildings.map((building) => (
            <button
              key={building.key}
              type="button"
              onClick={() => setSelectedKey(building.key)}
              className="flex items-center gap-2 rounded-md border border-wellBorder bg-well px-2.5 py-1.5 text-left text-xs hover:border-accent"
            >
              <AssetIcon
                assetId={building.iconAssetId}
                alt={t(building.nameKey)}
                className={`h-6 w-6 shrink-0 object-contain ${building.level > 0 ? '' : 'opacity-40 grayscale'}`}
                fallback={<span className="flex h-6 w-6 shrink-0 items-center justify-center text-[10px] font-semibold text-textMuted">{t(building.nameKey).charAt(0)}</span>}
              />
              <span className="tabular-nums text-textMuted">({building.level})</span>
              <span className="truncate">{t(building.nameKey)}</span>
            </button>
          ))}
        </div>
      )}

      <BottomSheet open={!!selected} onClose={closeSheet}>
        {selected && data && (
          <BuildingDetails
            building={selected}
            anotherActive={!buildingProgress(selected).active && anyUnderConstruction}
            canQueue={canQueue}
            resources={data.resources}
            speedupItems={speedupItems}
            error={error}
            onUpgrade={() => handleUpgrade(selected.key)}
            onQueue={() => handleQueue(selected.key)}
            onUseSpeedup={(itemId) => handleUseSpeedup(itemId, selected.key)}
            onClose={closeSheet}
          />
        )}
      </BottomSheet>
    </GameLayout>
  );
}

function BuildingDetails({
  building,
  anotherActive,
  canQueue,
  resources,
  speedupItems,
  error,
  onUpgrade,
  onQueue,
  onUseSpeedup,
  onClose,
}: {
  building: BuildingStateDto;
  anotherActive: boolean;
  canQueue: boolean;
  resources: ResourcesDto;
  speedupItems: InventoryItemDto[];
  error: string | null;
  onUpgrade: () => void;
  onQueue: () => void;
  onUseSpeedup: (itemInstanceId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const progress = buildingProgress(building);
  // What a queue would build: the level after the current construction, or the next level.
  const queueCost = progress.active ? building.afterNextLevelCost : building.nextLevelCost;
  const queueLevel = building.level + (progress.active ? 2 : 1);
  const showQueue = canQueue && !!queueCost;
  const canAffordQueue = !!queueCost && resources.metal >= queueCost.metalCost && resources.crystal >= queueCost.crystalCost;

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center">
          <AssetIcon
            assetId={building.iconAssetId}
            alt={t(building.nameKey)}
            className="h-full w-full object-contain"
            fallback={<span className="text-2xl font-semibold text-textMuted">{t(building.nameKey).charAt(0)}</span>}
          />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{t(building.nameKey)}</h3>
          <span className="text-[10px] uppercase text-textFaint">
            {t('base.level')} {building.level}/{building.maxLevel}
          </span>
        </div>
      </div>

      <BuildingEffect building={building} />

      {progress.active ? (
        <>
          <div className="mb-1 flex justify-between text-[10px] text-textMuted">
            <span>{t('base.underConstruction')}</span>
            <span className="tabular-nums">{formatDuration(progress.secondsLeft)}</span>
          </div>
          <div className="mb-3 h-[7px] overflow-hidden rounded-full bg-wellBorder">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          {speedupItems.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {speedupItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={t(item.descriptionKey)}
                  onClick={() => onUseSpeedup(item.id)}
                  className="flex items-center gap-1.5 rounded border border-accent bg-accentBg px-2 py-1 text-[9px] uppercase hover:bg-accentBgHover"
                >
                  <AssetIcon assetId={item.iconAssetId} alt={t(item.nameKey)} className="h-4 w-4 object-contain" fallback={null} />
                  {t(item.nameKey)} (×{item.quantity})
                </button>
              ))}
            </div>
          )}
        </>
      ) : building.nextLevelCost ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded border border-wellBorder bg-well p-2.5">
            <div className="mb-1 text-[8px] uppercase text-textFaint">{t('base.nextLevelCost')}</div>
            <div className="flex items-center gap-1.5 text-sm">
              <ResourceIcon type="METAL" className="h-4 w-4" />
              {building.nextLevelCost.metalCost}
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <ResourceIcon type="CRYSTAL" className="h-4 w-4" />
              {building.nextLevelCost.crystalCost}
            </div>
          </div>
          <div className="rounded border border-wellBorder bg-well p-2.5">
            <div className="mb-1 text-[8px] uppercase text-textFaint">{t('base.buildTime')}</div>
            <div className="text-sm tabular-nums">{formatDuration(building.nextLevelCost.constructionSeconds)}</div>
          </div>
        </div>
      ) : (
        <p className="mb-3 text-xs text-textMuted">{t('base.maxLevel')}</p>
      )}

      <button
        type="button"
        disabled={progress.active || !building.nextLevelCost}
        aria-disabled={anotherActive}
        onClick={onUpgrade}
        className="w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase text-text hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30 aria-disabled:cursor-not-allowed aria-disabled:opacity-30"
      >
        {t('base.upgrade')}
      </button>

      {showQueue && queueCost && (
        <div className="mt-3 rounded border border-vip/40 bg-well p-2.5">
          {progress.active && (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-[10px] uppercase text-textFaint">{t('base.queueLevelCost', { level: queueLevel })}</span>
              <span className="flex items-center gap-1">
                <ResourceIcon type="METAL" className="h-3.5 w-3.5" />
                {queueCost.metalCost}
              </span>
              <span className="flex items-center gap-1">
                <ResourceIcon type="CRYSTAL" className="h-3.5 w-3.5" />
                {queueCost.crystalCost}
              </span>
              <span className="tabular-nums text-textMuted">{formatDuration(queueCost.constructionSeconds)}</span>
            </div>
          )}
          <button
            type="button"
            disabled={!canAffordQueue}
            onClick={onQueue}
            className="w-full rounded-md border border-vip bg-accentBg py-2 text-xs uppercase text-vip hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t('base.addToQueue', { level: queueLevel })}
          </button>
          <p className="mt-1.5 text-[10px] text-textFaint">{t('base.queueNote')}</p>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <button type="button" onClick={onClose} className="mt-4 w-full text-center text-xs text-textFaint underline">
        {t('common.close')}
      </button>
    </>
  );
}

type EffectSide = 'current' | 'next';

/** One building's effect at its current or next level, as display text — or null if none. A building has exactly one kind of effect. */
function describeEffect(building: BuildingStateDto, side: EffectSide, t: ReturnType<typeof useTranslations>): string | null {
  const production = side === 'current' ? building.currentProduction : building.nextLevelProduction;
  const capacity = side === 'current' ? building.currentCapacityBonus : building.nextLevelCapacityBonus;
  const marketSlots = side === 'current' ? building.currentMarketSlotBonus : building.nextLevelMarketSlotBonus;
  const defense = side === 'current' ? building.currentDefenseBonusPercent : building.nextLevelDefenseBonusPercent;
  const protection = side === 'current' ? building.currentPvpProtectionMinutes : building.nextLevelPvpProtectionMinutes;
  const hidden = side === 'current' ? building.currentProtectedResources : building.nextLevelProtectedResources;

  if (production) return `+${production.perHour} ${t(`resource.${production.resourceType}`)}/${t('base.perHour')}`;
  if (capacity !== null) return `+${capacity} ${t('base.inventorySlots')}`;
  if (marketSlots !== null) return `+${marketSlots} ${t('base.marketSlots')}`;
  if (defense !== null) return t('base.defenseBonus', { percent: defense });
  if (protection !== null) return t('base.pvpProtectionBonus', { minutes: protection });
  if (hidden) return t('base.protectedResources', { metal: hidden.metal, crystal: hidden.crystal, credits: hidden.credits });
  return null;
}

/** Defense-only buildings get a one-line note on when their effect applies. */
function effectNoteKey(building: BuildingStateDto): string | null {
  if (building.currentDefenseBonusPercent !== null || building.nextLevelDefenseBonusPercent !== null) return 'base.defenseBonusNote';
  if (building.currentPvpProtectionMinutes !== null || building.nextLevelPvpProtectionMinutes !== null) return 'base.pvpProtectionNote';
  if (building.currentProtectedResources || building.nextLevelProtectedResources) return 'base.protectedResourcesNote';
  return null;
}

/** Current vs. next-level effect. */
function BuildingEffect({ building }: { building: BuildingStateDto }) {
  const t = useTranslations();
  const current = describeEffect(building, 'current', t);
  const next = describeEffect(building, 'next', t);
  if (!current && !next) {
    return <p className="mb-3 text-[10px] text-textFaint">{t('base.noEffect')}</p>;
  }
  const noteKey = effectNoteKey(building);

  return (
    <div className="mb-3 rounded border border-wellBorder bg-well p-2.5 text-[11px]">
      <div className="flex justify-between gap-3">
        <span className="shrink-0 text-textFaint">{t('base.currentEffect')}</span>
        <span className={`text-right ${current ? '' : 'text-textFaint'}`}>{current ?? t('base.noEffect')}</span>
      </div>
      {next && (
        <div className="mt-1 flex justify-between gap-3 text-positive">
          <span className="shrink-0 text-textFaint">{t('base.nextEffect')}</span>
          <span className="text-right">{next}</span>
        </div>
      )}
      {noteKey && <p className="mt-2 text-[10px] text-textFaint">{t(noteKey)}</p>}
    </div>
  );
}

interface FortressPart {
  label: string;
  level: number;
  constructing: boolean;
  upgradeReady: boolean;
  upgradeReadyLabel: string;
  onClick: () => void;
}

/**
 * Walls + corner towers around the terrain. Built as 4 separate bar/corner
 * cells on a CSS grid (not a padded border) so each wall segment and corner
 * is its own element — they're planned to become buildings later (owner
 * decision), and can then get their own click handler/sheet without touching
 * the terrain. Both are buildings (owner decision, 2026-10-12): the 4 corner
 * towers are the Defense System, the 4 wall segments the Defensive Wall —
 * each part clickable, level in the tooltip and sheet only.
 * Art: public/assets/buildings/defensive_wall.png (128x256 portrait tile) and
 * guard_tower.png (128x128, reused for all 4 corners via rotation).
 */
function FortressFrame({ children, corners, walls }: { children: React.ReactNode; corners?: FortressPart | null; walls?: FortressPart | null }) {
  const wallThickness = 'clamp(22px, 5vw, 36px)';
  const corner = (rotateDeg: number): CSSProperties => ({
    backgroundImage: 'url(/assets/buildings/guard_tower.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    transform: `rotate(${rotateDeg}deg)`,
  });
  const vertical: CSSProperties = {
    backgroundImage: 'url(/assets/buildings/defensive_wall.png)',
    backgroundRepeat: 'repeat-y',
    backgroundSize: `${wallThickness} auto`,
  };
  // The wall tile is portrait — top/bottom bars reuse it rotated 90°. A CSS
  // background can't rotate on its own, so the fill is an oversized
  // (100vw-tall) child that's rotated and clipped by its parent.
  const horizontalFill: CSSProperties = {
    width: wallThickness,
    height: '100vw',
    backgroundImage: 'url(/assets/buildings/defensive_wall.png)',
    backgroundRepeat: 'repeat-y',
    backgroundSize: `${wallThickness} auto`,
    transform: 'translate(-50%, -50%) rotate(90deg)',
  };
  const cornerCell = (rotateDeg: number, showDot: boolean) =>
    corners ? (
      <button
        type="button"
        onClick={corners.onClick}
        title={corners.label}
        aria-label={corners.label}
        className="relative transition-[filter] hover:brightness-125 focus-visible:outline focus-visible:outline-accent"
      >
        {/* Rotated background in its own layer, so the upgrade dot on top isn't rotated with it. Level is in the tooltip/sheet only. */}
        <span
          className={`absolute inset-0 ${corners.level > 0 ? '' : 'opacity-60 grayscale'} ${corners.constructing ? 'animate-pulse' : ''}`}
          style={corner(rotateDeg)}
        />
        {showDot && corners.upgradeReady && (
          <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-positive" title={corners.upgradeReadyLabel} />
        )}
      </button>
    ) : (
      <div style={corner(rotateDeg)} />
    );
  // A wall segment: the clickable Defensive Wall when present, else plain decoration.
  // Grey-out/pulse go on the art layer only (not the button), so the green
  // "upgrade affordable" dot on top keeps its colour — same as the corner towers.
  const wallCell = (fill: React.ReactNode, style?: CSSProperties, dot?: React.ReactNode) =>
    walls ? (
      <button
        type="button"
        onClick={walls.onClick}
        title={walls.label}
        aria-label={walls.label}
        className="relative transition-[filter] hover:brightness-125 focus-visible:outline focus-visible:outline-accent"
      >
        <span className={`absolute inset-0 ${walls.level > 0 ? '' : 'opacity-60 grayscale'} ${walls.constructing ? 'animate-pulse' : ''}`} style={style}>
          {fill}
        </span>
        {dot}
      </button>
    ) : (
      <div className="relative" style={style}>
        {fill}
      </div>
    );
  const horizontalFillLayer = (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-1/2" style={horizontalFill} />
    </div>
  );
  const wallDot = walls?.upgradeReady ? (
    <span className="absolute left-1/2 top-0.5 h-2 w-2 -translate-x-1/2 rounded-full bg-positive" title={walls.upgradeReadyLabel} />
  ) : null;

  return (
    <div
      className="grid overflow-hidden rounded-xl"
      style={{ gridTemplateColumns: `${wallThickness} 1fr ${wallThickness}`, gridTemplateRows: `${wallThickness} 1fr ${wallThickness}` }}
    >
      {cornerCell(0, true)}
      {wallCell(horizontalFillLayer, undefined, wallDot)}
      {cornerCell(90, false)}

      {wallCell(null, vertical)}
      <div className="overflow-hidden p-4 sm:p-6" style={{ background: 'radial-gradient(ellipse at 50% 30%, #1b232c 0%, rgb(16, 23, 30) 100%)' }}>
        {children}
      </div>
      {wallCell(null, vertical)}

      {cornerCell(270, false)}
      {wallCell(horizontalFillLayer)}
      {cornerCell(180, false)}
    </div>
  );
}
