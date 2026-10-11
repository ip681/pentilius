'use client';

import type { BaseResponseDto, BuildingStateDto, InventoryItemDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { GameLayout } from '@/components/GameLayout';
import { ResourceIcon } from '@/components/ResourceIcon';
import { ApiError, consumeItem, getBase, getInventory, upgradeBuilding } from '@/lib/api-client';
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

export default function BasePage() {
  useRequireAuth();
  const t = useTranslations();
  const [data, setData] = useState<BaseResponseDto | null>(null);
  const [speedupItems, setSpeedupItems] = useState<InventoryItemDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [wallHover, setWallHover] = useState(false);

  async function load() {
    try {
      const [base, inventory] = await Promise.all([getBase(), getInventory()]);
      setData(base);
      setSpeedupItems(inventory.items.filter(isConstructionSpeedup));
    } catch {
      setError(t('base.loadError'));
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpgrade(key: string) {
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

  async function handleUseSpeedup(itemInstanceId: string, buildingKey: string) {
    try {
      await consumeItem(itemInstanceId, buildingKey);
      await load();
    } catch {
      setError(t('base.speedupError'));
    }
  }

  // Temporary base-grid mockup — the wall is 4 separate bar/corner elements
  // laid out via CSS grid (not a padded border around the terrain)
  // specifically so the hover/click color-change only fires on the wall
  // segments themselves, never on the terrain rectangle between them.
  // Real art from the owner: public/assets/buildings/defensive_wall.png
  // (128x256, portrait — tiles top-to-bottom for the vertical bars as-is)
  // and guard_tower.png (128x128 — reused for all 4 corners via rotation).
  const wallThickness = 'clamp(22px, 5vw, 36px)';
  const wallFilter = wallHover ? 'brightness(1.35)' : 'brightness(1)';
  const wallGlow = wallHover ? '0 0 14px 2px rgba(93,234,255,0.55)' : 'none';
  const wallTransition = { transition: 'filter 200ms, box-shadow 200ms' };
  const wallSegmentProps = {
    onMouseEnter: () => setWallHover(true),
    onMouseLeave: () => setWallHover(false),
    onClick: () => setWallHover((v) => v),
    className: 'relative cursor-pointer',
  };
  function cornerStyle(rotateDeg: number): CSSProperties {
    return {
      backgroundImage: 'url(/assets/buildings/guard_tower.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      transform: `rotate(${rotateDeg}deg)`,
      filter: wallFilter,
      boxShadow: wallGlow,
      ...wallTransition,
    };
  }
  const verticalStyle: CSSProperties = {
    backgroundImage: 'url(/assets/buildings/defensive_wall.png)',
    backgroundRepeat: 'repeat-y',
    backgroundSize: `${wallThickness} auto`,
    filter: wallFilter,
    boxShadow: wallGlow,
    ...wallTransition,
  };
  // defensive_wall.png is a portrait tile — the top/bottom bars reuse it
  // rotated 90°. A plain CSS background can't rotate independently of its
  // element, so the fill lives in an oversized (100vw-tall) absolutely
  // positioned child that gets rotated and clipped by the parent's own
  // overflow-hidden, instead of needing a second horizontal-oriented asset.
  const horizontalOuterStyle: CSSProperties = { filter: wallFilter, boxShadow: wallGlow, ...wallTransition };
  const horizontalFillStyle: CSSProperties = {
    width: wallThickness,
    height: '100vw',
    backgroundImage: 'url(/assets/buildings/defensive_wall.png)',
    backgroundRepeat: 'repeat-y',
    backgroundSize: `${wallThickness} auto`,
    transform: 'translate(-50%, -50%) rotate(90deg)',
  };

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('base.title')}</h1>
        <p className="text-xs text-textMuted">{t('base.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {data && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {data.buildings.map((building) => {
            const progress = buildingProgress(building);
            const anotherActive = !progress.active && data.buildings.some((b) => buildingProgress(b).active);
            return (
              <section key={building.key} className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
                <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
                  <span className="text-sm font-semibold">{t(building.nameKey)}</span>
                  <span className="text-[10px] uppercase text-textFaint">
                    {t('base.level')} {building.level}
                  </span>
                </div>

                <div className="p-5">
                  <div className="mb-4 flex h-[90px] items-center justify-center rounded-md border border-panelBorder bg-well">
                    <AssetIcon
                      assetId={building.iconAssetId}
                      alt={t(building.nameKey)}
                      className="h-full w-full object-contain p-3"
                      fallback={<div className="h-12 w-16 rounded-sm bg-accent opacity-80" />}
                    />
                  </div>

                  {building.currentProduction ||
                  building.nextLevelProduction ||
                  building.currentCapacityBonus !== null ||
                  building.nextLevelCapacityBonus !== null ||
                  building.currentMarketSlotBonus !== null ||
                  building.nextLevelMarketSlotBonus !== null ? (
                    <div className="mb-4 rounded border border-wellBorder bg-well p-2.5 text-[11px]">
                      {building.currentProduction ? (
                        <div className="flex justify-between">
                          <span className="text-textFaint">{t('base.currentEffect')}</span>
                          <span>
                            +{building.currentProduction.perHour} {t(`resource.${building.currentProduction.resourceType}`)}/{t('base.perHour')}
                          </span>
                        </div>
                      ) : building.currentCapacityBonus !== null ? (
                        <div className="flex justify-between">
                          <span className="text-textFaint">{t('base.currentEffect')}</span>
                          <span>
                            +{building.currentCapacityBonus} {t('base.inventorySlots')}
                          </span>
                        </div>
                      ) : building.currentMarketSlotBonus !== null ? (
                        <div className="flex justify-between">
                          <span className="text-textFaint">{t('base.currentEffect')}</span>
                          <span>
                            +{building.currentMarketSlotBonus} {t('base.marketSlots')}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-textFaint">
                          <span>{t('base.currentEffect')}</span>
                          <span>{t('base.noEffect')}</span>
                        </div>
                      )}
                      {building.nextLevelProduction ? (
                        <div className="mt-1 flex justify-between text-positive">
                          <span className="text-textFaint">{t('base.nextEffect')}</span>
                          <span>
                            +{building.nextLevelProduction.perHour} {t(`resource.${building.nextLevelProduction.resourceType}`)}/{t('base.perHour')}
                          </span>
                        </div>
                      ) : building.nextLevelCapacityBonus !== null ? (
                        <div className="mt-1 flex justify-between text-positive">
                          <span className="text-textFaint">{t('base.nextEffect')}</span>
                          <span>
                            +{building.nextLevelCapacityBonus} {t('base.inventorySlots')}
                          </span>
                        </div>
                      ) : (
                        building.nextLevelMarketSlotBonus !== null && (
                          <div className="mt-1 flex justify-between text-positive">
                            <span className="text-textFaint">{t('base.nextEffect')}</span>
                            <span>
                              +{building.nextLevelMarketSlotBonus} {t('base.marketSlots')}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="mb-4 text-[10px] text-textFaint">{t('base.noEffect')}</p>
                  )}

                  {progress.active ? (
                    <>
                      <div className="mb-1 flex justify-between text-[10px] text-textMuted">
                        <span>{t('base.underConstruction')}</span>
                        <span className="tabular-nums">{formatDuration(progress.secondsLeft)}</span>
                      </div>
                      <div className="mb-4 h-[7px] overflow-hidden rounded-full bg-wellBorder">
                        <div className="h-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} />
                      </div>
                      {speedupItems.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-2">
                          {speedupItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              title={t(item.descriptionKey)}
                              onClick={() => handleUseSpeedup(item.id, building.key)}
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
                    <div className="mb-4 grid grid-cols-2 gap-2">
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
                    <p className="mb-4 text-xs text-textMuted">{t('base.maxLevel')}</p>
                  )}

                  <button
                    type="button"
                    disabled={progress.active || !building.nextLevelCost}
                    aria-disabled={anotherActive}
                    onClick={() => handleUpgrade(building.key)}
                    className="w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase text-text hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30 aria-disabled:cursor-not-allowed aria-disabled:opacity-30"
                  >
                    {t('base.upgrade')}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {data && (
        <div className="mt-10">
          <p className="mb-3 text-xs text-textFaint">
            Временен визуален макет — сградите, положени директно върху терен, без квадратчета (не е свързано с нищо, само за преглед):
          </p>
          <div
            className="grid overflow-hidden rounded-xl"
            style={{ gridTemplateColumns: `${wallThickness} 1fr ${wallThickness}`, gridTemplateRows: `${wallThickness} 1fr ${wallThickness}` }}
          >
            <div {...wallSegmentProps} style={cornerStyle(0)} />
            <div {...wallSegmentProps} style={horizontalOuterStyle}>
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute left-1/2 top-1/2" style={horizontalFillStyle} />
              </div>
            </div>
            <div {...wallSegmentProps} style={cornerStyle(90)} />

            <div {...wallSegmentProps} style={verticalStyle} />
            <div className="overflow-hidden p-4 sm:p-6" style={{ background: 'radial-gradient(ellipse at 50% 30%, #1b232c 0%, rgb(16, 23, 30) 100%)' }}>
              <div className="grid justify-center gap-x-4 gap-y-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 120px))' }}>
                {[
                  ...data.buildings.map((b) => ({ key: b.key, label: t(b.nameKey), iconAssetId: b.iconAssetId, built: b.level > 0 })),
                  // Примерни бъдещи сгради, само за да видим как изглежда грида с повече елементи — не са свързани с нищо
                  { key: 'mock_command_center', label: 'Команден център', iconAssetId: 'buildings.mock.icon', built: false },
                  { key: 'mock_hideout', label: 'Скривалище', iconAssetId: 'buildings.mock.icon', built: false },
                  { key: 'mock_energy_core', label: 'Енергийно ядро', iconAssetId: 'buildings.mock.icon', built: false },
                  { key: 'mock_research_institute', label: 'Научен институт', iconAssetId: 'buildings.mock.icon', built: false },
                  { key: 'mock_expedition_hangar', label: 'Експедиционен хангар', iconAssetId: 'buildings.mock.icon', built: false },
                ].map((building) => (
                  <div key={building.key} className="flex flex-col items-center gap-1">
                    <AssetIcon
                      assetId={building.iconAssetId}
                      alt={building.label}
                      className={`h-16 w-16 object-contain drop-shadow-lg sm:h-24 sm:w-24 ${building.built ? '' : 'opacity-40 grayscale'}`}
                      fallback={
                        <div
                          className={`h-14 w-14 rounded-sm bg-accent drop-shadow-lg sm:h-20 sm:w-20 ${building.built ? 'opacity-80' : 'opacity-20'}`}
                        />
                      }
                    />
                    <span className="rounded bg-black/40 px-1.5 py-0.5 text-[8px] text-white sm:text-[10px]">{building.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div {...wallSegmentProps} style={verticalStyle} />

            <div {...wallSegmentProps} style={cornerStyle(270)} />
            <div {...wallSegmentProps} style={horizontalOuterStyle}>
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute left-1/2 top-1/2" style={horizontalFillStyle} />
              </div>
            </div>
            <div {...wallSegmentProps} style={cornerStyle(180)} />
          </div>
        </div>
      )}
    </GameLayout>
  );
}
