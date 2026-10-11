'use client';

import type { BossDto, ZoneDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { GameLayout } from '@/components/GameLayout';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, attackPentili, getBossFormations, getZones } from '@/lib/api-client';
import { assetUrl } from '@/lib/assets';
import { setPendingBattle } from '@/lib/pending-battle';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';

// Planet layout geometry — a fixed viewBox so the whole thing scales
// responsively via the SVG's own width:100%, no JS resize handling needed.
// SIZE leaves enough margin beyond OUTER_R for the name labels (LABEL_R) to
// stay inside the viewBox instead of getting silently clipped off-canvas.
const SIZE = 400;
const CENTER = SIZE / 2;
const OUTER_R = 135;
const INNER_R = 46; // also the Core circle's radius
const LABEL_R = OUTER_R + 26;
const WEDGE_GAP_DEG = 2; // thin visual seam between zones
const CORE_ID = '__core__';

// Per-viewer convenience only (not synced, not read by the backend) — lets a
// player farming the same target repeatedly skip re-picking it on every
// visit. Keyed per zone so switching zones doesn't carry over a mismatched
// selection. Wrapped in try/catch since localStorage can throw or be
// unavailable (private browsing, blocked site data, etc.).
function pentiliStorageKey(zoneId: string): string {
  return `pentilius:lastPentili:${zoneId}`;
}

function rememberPentili(zoneId: string, pentiliId: string): void {
  try {
    localStorage.setItem(pentiliStorageKey(zoneId), pentiliId);
  } catch {
    // ignore
  }
}

function getRememberedPentili(zoneId: string): string | null {
  try {
    return localStorage.getItem(pentiliStorageKey(zoneId));
  } catch {
    return null;
  }
}

function polarToXY(r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

/** An annulus wedge (pie slice with the Core's circle cut out of the middle) spanning startDeg..endDeg. */
function wedgePath(startDeg: number, endDeg: number): string {
  const outerStart = polarToXY(OUTER_R, startDeg);
  const outerEnd = polarToXY(OUTER_R, endDeg);
  const innerEnd = polarToXY(INNER_R, endDeg);
  const innerStart = polarToXY(INNER_R, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export default function ZonesPage() {
  useRequireAuth();
  const t = useTranslations();
  const router = useRouter();
  const [zones, setZones] = useState<ZoneDto[] | null>(null);
  const [bosses, setBosses] = useState<BossDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPentiliId, setSelectedPentiliId] = useState<string | null>(null);
  const [attackingFromPlanet, setAttackingFromPlanet] = useState(false);
  const [attackError, setAttackError] = useState<string | null>(null);

  // Fires the attack right here, before navigating — otherwise the player
  // sits through two separate waits in a row: the zone page's own loading,
  // then the attack itself (owner-reported issue, 2026-10-11). The result
  // travels to the zone page via sessionStorage so it can render the fight
  // immediately instead of re-requesting it.
  async function handleAttackFromPlanet(zoneId: string, pentiliId: string) {
    setAttackError(null);
    setAttackingFromPlanet(true);
    try {
      const report = await attackPentili(pentiliId);
      notifyProfileChanged();
      setPendingBattle(pentiliId, report);
      router.push(`/zones/${zoneId}?pentili=${pentiliId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EXPEDITION_IN_PROGRESS') {
        setAttackError(t('pve.expeditionInProgress'));
      } else if (err instanceof ApiError && err.status === 400) {
        setAttackError(t('pve.notEnoughEnergy'));
      } else {
        setAttackError(t('pve.attackError'));
      }
    } finally {
      setAttackingFromPlanet(false);
    }
  }

  useEffect(() => {
    getZones()
      .then((res) => {
        setZones(res);
        setSelectedId((current) => current ?? res.find((z) => z.unlocked)?.id ?? res[0]?.id ?? null);
      })
      .catch(() => setError(t('zones.loadError')));
    // Bosses nav button was removed (owner decision, 2026-10-11) now that each
    // zone's own boss panel covers create/join — this is the quick-glance
    // replacement: which boss belongs here, and whether it has open formations,
    // without needing a separate page.
    getBossFormations()
      .then((res) => {
        setBosses(res.bosses);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A Pentili selection only makes sense within its own zone's card. Restore
  // the player's last pick for this zone (if it still exists in the zone's
  // roster) instead of always clearing it.
  useEffect(() => {
    const zone = zones?.find((z) => z.id === selectedId);
    if (!zone) {
      setSelectedPentiliId(null);
      return;
    }
    const remembered = getRememberedPentili(zone.id);
    const stillValid = remembered !== null && zone.pentiliPreview.some((p) => p.id === remembered);
    setSelectedPentiliId(stillValid ? remembered : null);
  }, [selectedId, zones]);

  const selected = zones?.find((z) => z.id === selectedId) ?? null;
  const selectedBoss = selected ? (bosses?.find((b) => b.zoneId === selected.id) ?? null) : null;
  const openFormationCount = selectedBoss?.formations.filter((f) => f.status === 'OPEN').length ?? 0;
  const step = 360 / Math.max(1, zones?.length ?? 1);

  return (
    <GameLayout>
      <h1 className="mb-1 text-2xl font-semibold">{t('zones.title')}</h1>
      <p className="mb-6 text-xs text-textMuted">{t('zones.selectHint')}</p>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {zones && (
        <div className="flex flex-col items-center gap-6">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-sm sm:max-w-md md:max-w-xl lg:max-w-2xl" role="img" aria-label={t('zones.title')}>
            <defs>
              {zones.map((zone) => {
                const startDeg = (zone.order - 1) * step + WEDGE_GAP_DEG / 2;
                const endDeg = zone.order * step - WEDGE_GAP_DEG / 2;
                return (
                  <clipPath key={zone.id} id={`wedge-clip-${zone.id}`}>
                    <path d={wedgePath(startDeg, endDeg)} />
                  </clipPath>
                );
              })}
            </defs>

            {zones.map((zone) => {
              const startDeg = (zone.order - 1) * step + WEDGE_GAP_DEG / 2;
              const endDeg = zone.order * step - WEDGE_GAP_DEG / 2;
              const midDeg = (startDeg + endDeg) / 2;
              const labelPos = polarToXY(LABEL_R, midDeg);
              const isSelected = zone.id === selectedId;
              const labelWords = t(zone.nameKey).split(' ');

              return (
                <g
                  key={zone.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(zone.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedId(zone.id);
                  }}
                  className="cursor-pointer outline-none"
                >
                  <image
                    href={assetUrl(zone.iconAssetId)}
                    x={CENTER - OUTER_R}
                    y={CENTER - OUTER_R}
                    width={OUTER_R * 2}
                    height={OUTER_R * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#wedge-clip-${zone.id})`}
                    className={`transition-opacity duration-150 ${zone.unlocked ? 'opacity-100' : 'opacity-35 grayscale'}`}
                  />
                  <path
                    d={wedgePath(startDeg, endDeg)}
                    fill="none"
                    className={isSelected ? 'stroke-gold' : 'stroke-white/15'}
                    strokeWidth={isSelected ? 3 : 1}
                  />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`select-none text-[9px] font-semibold uppercase ${zone.unlocked ? 'fill-text' : 'fill-textFaint'}`}
                  >
                    {labelWords.map((word, i) => (
                      <tspan key={i} x={labelPos.x} dy={i === 0 ? -((labelWords.length - 1) * 5) : 10}>
                        {word}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}

            {/* Core — placeholder, not yet a real feature, but still selectable so its
                details card (below the planet) can preview what's coming. */}
            <g
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(CORE_ID)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setSelectedId(CORE_ID);
              }}
              className="cursor-pointer outline-none"
            >
              <circle
                cx={CENTER}
                cy={CENTER}
                r={INNER_R}
                className={`fill-panel ${selectedId === CORE_ID ? 'stroke-gold' : 'stroke-panelBorder'}`}
                strokeWidth={selectedId === CORE_ID ? 3 : 2}
              />
              <text x={CENTER} y={CENTER - 6} textAnchor="middle" className="select-none fill-text text-[10px] font-semibold uppercase">
                {t('zones.core')}
              </text>
              <text x={CENTER} y={CENTER + 10} textAnchor="middle" className="select-none fill-textFaint text-[8px]">
                {t('zones.coreComingSoon')}
              </text>
            </g>
          </svg>

          {selected && (
            <div className="w-full max-w-sm sm:max-w-md md:max-w-xl lg:max-w-2xl rounded-lg border border-panelBorder bg-panel p-4">
              <div className="flex items-center gap-3">
                <div className={`h-14 w-14 shrink-0 overflow-hidden rounded-md bg-well ${selected.unlocked ? '' : 'opacity-50'}`}>
                  <AssetIcon
                    assetId={selected.iconAssetId}
                    alt={t(selected.nameKey)}
                    className="h-full w-full object-cover"
                    fallback={<div className="flex h-full w-full items-center justify-center text-sm font-semibold text-textMuted">{t(selected.nameKey).charAt(0)}</div>}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t(selected.nameKey)}</p>
                  {!selected.unlocked && (
                    <p className="text-xs text-textMuted">
                      {t('zones.unlocksAtLevel')} {selected.unlockLevel}
                    </p>
                  )}
                </div>
                {selected.unlocked ? (
                  <Link href={`/zones/${selected.id}`} className="shrink-0 rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase hover:bg-accentBgHover">
                    {t('zones.enter')}
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-textFaint">{t('zones.locked')}</span>
                )}
              </div>

              {selected.pentiliPreview.length > 0 && (
                <div className={`mt-3 border-t border-panelBorder pt-3 ${selected.unlocked ? '' : 'pointer-events-none opacity-50'}`}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {selected.pentiliPreview.map((pentili) => {
                      const isPicked = pentili.id === selectedPentiliId;
                      return (
                        <button
                          key={pentili.id}
                          type="button"
                          title={t(pentili.nameKey)}
                          onClick={() => {
                            setSelectedPentiliId(pentili.id);
                            rememberPentili(selected.id, pentili.id);
                          }}
                          className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-center ${isPicked ? 'border-gold bg-accentBgHover' : 'border-transparent hover:bg-accentBgHover'}`}
                        >
                          <AssetIcon
                            assetId={pentili.iconAssetId}
                            alt={t(pentili.nameKey)}
                            className="h-12 w-auto object-contain"
                            fallback={<span className="flex h-12 w-12 items-center justify-center text-sm font-semibold text-textMuted">{t(pentili.nameKey).charAt(0)}</span>}
                          />
                          <span className="text-[10px] text-textFaint">{t(pentili.nameKey)}</span>
                          <span className="text-[9px] tabular-nums text-textFaint">
                            HP {pentili.maxHp} · ATK {pentili.attack} · DEF {pentili.defense}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={!selectedPentiliId || attackingFromPlanet}
                    onClick={() => selectedPentiliId && handleAttackFromPlanet(selected.id, selectedPentiliId)}
                    className="mt-3 block w-full rounded-md border border-accent bg-accentBg py-2 text-center text-xs uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {attackingFromPlanet ? '…' : selectedPentiliId ? t('pve.attack') : t('pve.chooseOpponent')}
                  </button>
                  {attackError && <p className="mt-2 text-center text-xs text-danger">{attackError}</p>}
                </div>
              )}

              {/* Boss teaser — gold-accented so it reads as distinct from the plain Pentili
                  row above, same color language as the zone page's own boss panel. */}
              {selectedBoss && (
                <div className="mt-3 border-t border-panelBorder pt-3">
                  {selectedBoss.unlocked ? (
                    <Link
                      href={`/zones/${selected.id}?boss=1`}
                      className={`flex items-center gap-4 rounded-md border border-gold/50 bg-well p-2.5 hover:bg-accentBgHover ${selected.unlocked ? '' : 'pointer-events-none opacity-50'}`}
                    >
                      <AssetIcon
                        assetId={selectedBoss.iconAssetId}
                        alt={t(selectedBoss.nameKey)}
                        className="h-20 w-20 shrink-0 object-contain"
                        fallback={<span className="flex h-20 w-20 items-center justify-center text-sm font-semibold text-textMuted">{t(selectedBoss.nameKey).charAt(0)}</span>}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold uppercase text-gold">{t(selectedBoss.nameKey)}</p>
                        <div className="mt-1 flex flex-col text-[10px] text-textMuted">
                          <span>HP {selectedBoss.maxHp}</span>
                          <span>
                            {t('bosses.attack')} {selectedBoss.attack}
                          </span>
                          <span>
                            {t('bosses.defense')} {selectedBoss.defense}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-textFaint">
                          {openFormationCount > 0 ? t('zones.bossOpenFormations', { count: openFormationCount }) : t('zones.bossNoFormations')}
                        </p>
                      </div>
                    </Link>
                  ) : (
                    // Visible but inactive — shown greyed out/desaturated rather than hidden, same
                    // treatment as a locked zone wedge, so the player can see what's ahead.
                    <div className="flex items-center gap-4 rounded-md border border-gold/50 bg-well p-2.5 opacity-40 grayscale">
                      <AssetIcon
                        assetId={selectedBoss.iconAssetId}
                        alt={t(selectedBoss.nameKey)}
                        className="h-20 w-20 shrink-0 object-contain"
                        fallback={<span className="flex h-20 w-20 items-center justify-center text-sm font-semibold text-textMuted">{t(selectedBoss.nameKey).charAt(0)}</span>}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold uppercase text-gold">{t(selectedBoss.nameKey)}</p>
                        <div className="mt-1 flex flex-col text-[10px] text-textMuted">
                          <span>HP {selectedBoss.maxHp}</span>
                          <span>
                            {t('bosses.attack')} {selectedBoss.attack}
                          </span>
                          <span>
                            {t('bosses.defense')} {selectedBoss.defense}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-textFaint">{t('bosses.locked', { level: selectedBoss.minLevel })}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedId === CORE_ID && (
            <div className="w-full max-w-sm sm:max-w-md md:max-w-xl lg:max-w-2xl rounded-lg border border-panelBorder bg-panel p-4 text-center">
              <p className="font-medium uppercase">{t('zones.core')}</p>
              <p className="mt-1 text-xs text-textMuted">{t('zones.coreComingSoon')}</p>
            </div>
          )}
        </div>
      )}
    </GameLayout>
  );
}
