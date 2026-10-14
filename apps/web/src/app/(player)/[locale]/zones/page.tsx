'use client';

import type { BossDto, CoreStateDto, ZoneDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { GameLayout } from '@/components/GameLayout';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, attackPentili, attackPentiliMulti, getBossFormations, getCoreState, getZones } from '@/lib/api-client';
import { usePlayerEnergy } from '@/lib/use-player-energy';
import { isVipActive, multiAttackCount } from '@/lib/vip';
import { assetUrl } from '@/lib/assets';
import { formatDuration } from '@/lib/format-duration';
import { setPendingBattle } from '@/lib/pending-battle';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';
import { EnergyRefill } from '@/components/EnergyRefill';

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

// The last selected zone (or the Core) is remembered per browser, same as the
// last Pentili per zone above — so the planet reopens where the player left off.
const SELECTED_ZONE_STORAGE_KEY = 'zones.selected';

function rememberSelectedZone(id: string): void {
  try {
    localStorage.setItem(SELECTED_ZONE_STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

function getRememberedSelectedZone(): string | null {
  try {
    return localStorage.getItem(SELECTED_ZONE_STORAGE_KEY);
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

/** Just the outer rim arc from startDeg..endDeg — used to highlight the selected zone's edge of the shared outer circle. */
function outerArcPath(startDeg: number, endDeg: number): string {
  const start = polarToXY(OUTER_R, startDeg);
  const end = polarToXY(OUTER_R, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${OUTER_R} ${OUTER_R} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** Same as outerArcPath but along the inner (Core-facing) edge — note the sweep flag flips since the inner edge is traversed the opposite way around. */
function innerArcPath(startDeg: number, endDeg: number): string {
  const start = polarToXY(INNER_R, startDeg);
  const end = polarToXY(INNER_R, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${INNER_R} ${INNER_R} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export default function ZonesPage() {
  useRequireAuth();
  const t = useTranslations();
  const router = useRouter();
  const [zones, setZones] = useState<ZoneDto[] | null>(null);
  const [bosses, setBosses] = useState<BossDto[] | null>(null);
  const [core, setCore] = useState<CoreStateDto | null>(null);
  const [, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPentiliId, setSelectedPentiliId] = useState<string | null>(null);
  const [attackingFromPlanet, setAttackingFromPlanet] = useState(false);
  const [attackError, setAttackError] = useState<string | null>(null);
  const { profile, refreshProfile } = usePlayerEnergy();
  const multiCount = multiAttackCount(profile);

  // Fires the attack right here, before navigating — otherwise the player
  // sits through two separate waits in a row: the zone page's own loading,
  // then the attack itself (owner-reported issue, 2026-10-11). The result
  // travels to the zone page via sessionStorage so it can render the fight
  // immediately instead of re-requesting it.
  async function handleAttackFromPlanet(zoneId: string, pentiliId: string, multi = false) {
    setAttackError(null);
    setAttackingFromPlanet(true);
    try {
      const reports = multi ? (await attackPentiliMulti(pentiliId)).reports : [await attackPentili(pentiliId)];
      notifyProfileChanged();
      setPendingBattle(pentiliId, reports);
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
        setSelectedId((current) => {
          if (current) return current;
          // Reopen on the last selection if it still exists and is reachable.
          const remembered = getRememberedSelectedZone();
          if (remembered === CORE_ID || res.some((z) => z.id === remembered && z.unlocked)) return remembered;
          return res.find((z) => z.unlocked)?.id ?? res[0]?.id ?? null;
        });
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
    getCoreState()
      .then(setCore)
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

  useEffect(() => {
    if (selectedId) rememberSelectedZone(selectedId);
  }, [selectedId]);

  // Ticks the Core countdowns (planet centre + Core card) once a second while the Core is open.
  const showCoreCountdown = core?.status === 'OPEN';
  useEffect(() => {
    if (!showCoreCountdown) return;
    const clock = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(clock);
  }, [showCoreCountdown]);
  // The Core is only enterable while open, or after the season ended (final standings).
  const coreOpen = core?.status === 'OPEN';
  const coreEnded = core?.status === 'ENDED';
  const coreSecondsLeft = coreOpen && core?.endsAt ? Math.max(0, Math.ceil((new Date(core.endsAt).getTime() - Date.now()) / 1000)) : 0;
  // After the season: the clan that took the Core (top of the frozen standings), if any clan dealt damage.
  const coreWinner = coreEnded ? (core?.standings[0] ?? null) : null;
  const coreWinnerLabel = coreWinner ? `[${coreWinner.clanTag}] ${coreWinner.clanName}` : null;

  // The moment the countdown hits zero the server has closed the Core — fetch the final state
  // (winner) instead of sitting on 00:00:00.
  const coreJustClosed = coreOpen && coreSecondsLeft === 0;
  useEffect(() => {
    if (!coreJustClosed) return;
    const timeout = setTimeout(() => {
      getCoreState()
        .then(setCore)
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(timeout);
  }, [coreJustClosed]);
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
              <clipPath id="core-clip">
                <circle cx={CENTER} cy={CENTER} r={INNER_R} />
              </clipPath>
            </defs>

            {zones.map((zone) => {
              const startDeg = (zone.order - 1) * step + WEDGE_GAP_DEG / 2;
              const endDeg = zone.order * step - WEDGE_GAP_DEG / 2;
              const midDeg = (startDeg + endDeg) / 2;
              const labelPos = polarToXY(LABEL_R, midDeg);
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

            {/* Core (owner decision, 2026-10-12) — selecting it shows a card below the
                planet, like a zone: "Attack the Core" while open, "Coming soon" otherwise. */}
            <g
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(CORE_ID)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setSelectedId(CORE_ID);
              }}
              className="cursor-pointer outline-none"
            >
              <image
                href={assetUrl('zones.core')}
                x={CENTER - INNER_R}
                y={CENTER - INNER_R}
                width={INNER_R * 2}
                height={INNER_R * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath="url(#core-clip)"
                className={coreOpen || coreEnded ? 'opacity-80' : 'opacity-35 grayscale'}
              />
              {/* Readability backdrop — the image behind the text can be bright/busy */}
              <rect
                x={CENTER - INNER_R + 6}
                y={coreWinnerLabel ? CENTER - 22 : CENTER - 16}
                width={(INNER_R - 6) * 2}
                height={coreWinnerLabel ? 44 : 32}
                rx={6}
                className="fill-black/45"
              />
              <text x={CENTER} y={coreWinnerLabel ? CENTER - 10 : CENTER - 6} textAnchor="middle" className="select-none fill-white text-[10px] font-semibold uppercase">
                {t('zones.core')}
              </text>
              {coreWinnerLabel && (
                <>
                  <text x={CENTER} y={CENTER + 3} textAnchor="middle" className="select-none fill-white/80 text-[7px]">
                    {t('zones.coreTakenBy')}
                  </text>
                  <text x={CENTER} y={CENTER + 14} textAnchor="middle" className="select-none fill-white text-[8px] font-semibold">
                    {coreWinnerLabel.length > 18 ? `${coreWinnerLabel.slice(0, 17)}…` : coreWinnerLabel}
                  </text>
                </>
              )}
              {!coreOpen && !coreEnded && (
                <text x={CENTER} y={CENTER + 10} textAnchor="middle" className="select-none fill-white/80 text-[8px]">
                  {t('zones.coreComingSoon')}
                </text>
              )}
              {coreOpen && (
                <text x={CENTER} y={CENTER + 10} textAnchor="middle" className="select-none fill-white text-[8px] font-semibold tabular-nums">
                  {formatDuration(coreSecondsLeft)}
                </text>
              )}
            </g>

            {/* Structural lines — drawn once on top of every image/clip, shared
                between all zones and the Core, instead of each wedge drawing its
                own full outline (that duplicated the Core's own circle and made
                adjacent edges look doubled/crooked, owner-reported 2026-10-11). */}
            <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="none" className="stroke-white/15" strokeWidth={1} />
            <circle cx={CENTER} cy={CENTER} r={INNER_R} fill="none" className="stroke-white/15" strokeWidth={1} />
            {zones.map((zone) => {
              const boundaryDeg = (zone.order - 1) * step;
              // A boundary is highlighted if it's either the selected zone's own
              // left edge, or the left edge of its next neighbor (= the selected
              // zone's right edge, wrapping past the last zone back to the first).
              const isSelectedEdge = selected && (zone.order === selected.order || zone.order === (selected.order % zones.length) + 1);
              const inner = polarToXY(INNER_R, boundaryDeg);
              const outer = polarToXY(OUTER_R, boundaryDeg);
              return (
                <line
                  key={zone.id}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  className={isSelectedEdge ? 'stroke-gold' : 'stroke-white/15'}
                  strokeWidth={isSelectedEdge ? 3 : 1}
                />
              );
            })}
            {selected && (
              <>
                <path
                  d={outerArcPath((selected.order - 1) * step, selected.order * step)}
                  fill="none"
                  className="stroke-gold"
                  strokeWidth={3}
                />
                <path
                  d={innerArcPath((selected.order - 1) * step, selected.order * step)}
                  fill="none"
                  className="stroke-gold"
                  strokeWidth={3}
                />
              </>
            )}
            {selectedId === CORE_ID && <circle cx={CENTER} cy={CENTER} r={INNER_R} fill="none" className="stroke-gold" strokeWidth={3} />}
          </svg>

          {selected && (
            <div className="relative w-full max-w-sm overflow-hidden rounded-lg border border-panelBorder sm:max-w-md md:max-w-xl lg:max-w-2xl">
              {/* Zone art as the whole block's background, darkening toward the bottom so the
                  Pentili/boss content stays readable (owner-requested experiment, 2026-10-11) */}
              <div className="absolute inset-0">
                <AssetIcon assetId={selected.iconAssetId} alt={t(selected.nameKey)} className="h-full w-full object-cover" fallback={<div className="h-full w-full bg-well" />} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/55 to-black/85" />
              </div>

              <div className="relative z-10 p-4">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="inline-block rounded bg-black/55 px-1.5 py-0.5 font-medium text-white">{t(selected.nameKey)}</p>
                    {!selected.unlocked && (
                      <p className="mt-1 inline-block rounded bg-black/55 px-1.5 py-0.5 text-xs text-white/70">
                        {t('zones.unlocksAtLevel')} {selected.unlockLevel}
                      </p>
                    )}
                  </div>
                  {selected.unlocked ? (
                    <Link href={`/zones/${selected.id}`} className="shrink-0 rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase hover:bg-accentBgHover">
                      {t('zones.enter')}
                    </Link>
                  ) : (
                    <span className="shrink-0 text-xs text-white/70">{t('zones.locked')}</span>
                  )}
                </div>

                {selected.pentiliPreview.length > 0 && (
                  <div className={`mt-3 border-t border-white/10 pt-3 ${selected.unlocked ? '' : 'pointer-events-none'}`}>
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
                          className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-center ${isPicked ? 'border-gold bg-gold/20' : 'border-transparent hover:border-gold hover:bg-gold/20'}`}
                        >
                          <AssetIcon
                            assetId={pentili.iconAssetId}
                            alt={t(pentili.nameKey)}
                            className="h-12 w-auto object-contain drop-shadow"
                            fallback={<span className="flex h-12 w-12 items-center justify-center text-sm font-semibold text-textMuted">{t(pentili.nameKey).charAt(0)}</span>}
                          />
                          <span className="rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                            {t(pentili.nameKey)} (Lv. {pentili.level})
                          </span>
                          <span className="rounded bg-black/55 px-1.5 py-0.5 text-[9px] tabular-nums text-white/80">
                            HP {pentili.maxHp} · ATK {pentili.attack} · DEF {pentili.defense}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={!selectedPentiliId || attackingFromPlanet}
                      onClick={() => selectedPentiliId && handleAttackFromPlanet(selected.id, selectedPentiliId)}
                      className="block flex-1 rounded-md border border-accent bg-accentBg py-2 text-center text-xs uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {attackingFromPlanet ? '…' : selectedPentiliId ? t('pve.attack') : t('pve.chooseOpponent')}
                    </button>
                    {/* VIP "Attack xN" (owner decision, 2026-10-13). */}
                    {isVipActive(profile) && (
                      <button
                        type="button"
                        disabled={!selectedPentiliId || attackingFromPlanet || multiCount < 2}
                        onClick={() => selectedPentiliId && handleAttackFromPlanet(selected.id, selectedPentiliId, true)}
                        className="rounded-md border border-vip bg-accentBg px-4 py-2 text-center text-xs uppercase text-vip hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t('pve.attackMulti', { count: multiCount >= 2 ? multiCount : (profile?.vipMultiAttackCount ?? 3) })}
                      </button>
                    )}
                  </div>
                  {selectedPentiliId && <EnergyRefill profile={profile} onRefilled={refreshProfile} />}
                  {attackError && <p className="mt-2 text-center text-xs text-danger">{attackError}</p>}
                </div>
              )}

              {/* Boss teaser — gold-accented so it reads as distinct from the plain Pentili
                  row above, same color language as the zone page's own boss panel. */}
              {selectedBoss && (
                <div className="mt-3 border-t border-white/10 pt-3">
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
                    // Visible but inactive — icon/text greyed out rather than the whole card, so
                    // the bg-well backing stays solid instead of letting the zone art bleed through.
                    <div className="flex items-center gap-4 rounded-md border border-gold/50 bg-well p-2.5">
                      <AssetIcon
                        assetId={selectedBoss.iconAssetId}
                        alt={t(selectedBoss.nameKey)}
                        className="h-20 w-20 shrink-0 object-contain opacity-40 grayscale"
                        fallback={<span className="flex h-20 w-20 items-center justify-center text-sm font-semibold text-textMuted">{t(selectedBoss.nameKey).charAt(0)}</span>}
                      />
                      <div className="min-w-0 flex-1 opacity-60">
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
            </div>
          )}

          {selectedId === CORE_ID && (
            <div className="relative w-full max-w-sm overflow-hidden rounded-lg border border-panelBorder sm:max-w-md md:max-w-xl lg:max-w-2xl">
              {/* Core art as the card background — same treatment as a zone card. */}
              <div className="absolute inset-0">
                <AssetIcon assetId="zones.core" alt={t('zones.core')} className="h-full w-full object-cover" fallback={<div className="h-full w-full bg-well" />} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/55 to-black/85" />
              </div>

              <div className="relative z-10 flex min-h-[120px] items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="inline-block rounded bg-black/55 px-1.5 py-0.5 font-medium text-white">{t('zones.core')}</p>
                  {!coreOpen && !coreEnded && (
                    <p className="mt-1 block w-fit rounded bg-black/55 px-1.5 py-0.5 text-xs text-white/70">{t('zones.coreComingSoon')}</p>
                  )}
                  {coreWinnerLabel && (
                    <p className="mt-1 block w-fit rounded bg-black/55 px-1.5 py-0.5 text-xs text-white">
                      {t('zones.coreTakenByClan', { clan: coreWinnerLabel })}
                    </p>
                  )}
                  {coreOpen && (
                    <>
                      <p className="mt-1 block w-fit rounded bg-black/55 px-1.5 py-0.5 text-xs tabular-nums text-gold">
                        {t('zones.coreTimeLeft', { time: formatDuration(coreSecondsLeft) })}
                      </p>
                      <p className="mt-2 max-w-md rounded bg-black/55 px-1.5 py-1 text-xs text-white/80">{t('zones.coreCallToAction')}</p>
                    </>
                  )}
                </div>
                {coreOpen && (
                  <Link href="/core" className="shrink-0 rounded-md border border-gold bg-accentBg px-4 py-2 text-xs uppercase text-gold hover:bg-accentBgHover">
                    {t('zones.enterCore')}
                  </Link>
                )}
                {coreEnded && (
                  <Link href="/core" className="shrink-0 rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase hover:bg-accentBgHover">
                    {t('zones.coreStandings')}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </GameLayout>
  );
}
