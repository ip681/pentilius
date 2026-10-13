'use client';

import type { CoreAttackResultDto, CorePlayerRankingPageDto, CorePlayerRankingScope, CorePlayerStandingDto, CoreStandingDto, CoreStateDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ClanLink } from '@/components/ClanLink';
import { GameLayout } from '@/components/GameLayout';
import { Pagination } from '@/components/Pagination';
import { PlayerLink } from '@/components/PlayerLink';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, attackCore, getCorePlayerRanking, getCoreState } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { notifyProfileChanged } from '@/lib/profile-events';
import { usePlayerEnergy } from '@/lib/use-player-energy';
import { useRefresh } from '@/lib/use-refresh';
import { useRequireAuth } from '@/lib/use-require-auth';

// Sliders refresh on their own so other clans' attacks show up without a
// reload (owner decision) — paused while the tab is hidden.
const POLL_INTERVAL_MS = 30_000;

/**
 * Seasons and the Core (owner decision, 2026-10-12): any clan member attacks
 * the Core for Action Energy, damage dealt becomes their clan's points, and
 * the sliders show every top clan relative to the leader (always 100%).
 * Every outcome is decided by the backend — this page only displays it.
 */
export default function CorePage() {
  useRequireAuth();
  const t = useTranslations();
  const router = useRouter();
  const { profile, refreshProfile } = usePlayerEnergy();
  const [state, setState] = useState<CoreStateDto | null>(null);
  const [lastAttack, setLastAttack] = useState<CoreAttackResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attacking, setAttacking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Bumped on every state refresh so the player rankings re-fetch in step with the sliders.
  const [refreshTick, setRefreshTick] = useState(0);
  // Server clock minus client clock, so countdowns don't drift with a wrong local clock.
  const clockOffsetRef = useRef(0);

  function applyState(next: CoreStateDto) {
    // Nothing to see before the Core opens (owner decision, 2026-10-13) — Zones shows "Coming soon".
    if (next.status === 'NOT_SCHEDULED' || next.status === 'SCHEDULED') {
      router.replace('/zones');
      return;
    }
    clockOffsetRef.current = new Date(next.serverNow).getTime() - Date.now();
    setState(next);
    setRefreshTick((tick) => tick + 1);
  }

  async function load() {
    try {
      applyState(await getCoreState());
    } catch {
      setError(t('core.loadError'));
    }
  }

  // Standings change with every clan's attacks — every 30 s while visible
  // (owner decision, 2026-10-13); the player's own attacks refresh at once.
  useRefresh(load, { intervalMs: POLL_INTERVAL_MS });

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  const serverNow = now + clockOffsetRef.current;
  const secondsUntil = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - serverNow) / 1000)) : 0);

  // A countdown hitting zero means the status changed server-side — refetch once.
  const opensIn = state?.status === 'SCHEDULED' ? secondsUntil(state.opensAt) : null;
  const endsIn = state?.status === 'OPEN' ? secondsUntil(state.endsAt) : null;
  const resetIn = state?.status === 'ENDED' && state.resetAt ? secondsUntil(state.resetAt) : null;
  useEffect(() => {
    if (opensIn === 0 || endsIn === 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opensIn === 0, endsIn === 0]);

  const cooldownLeft = secondsUntil(state?.nextAttackAt ?? null);
  const energy = profile?.energy.current ?? 0;
  const canAttack = state?.status === 'OPEN' && state.inClan && cooldownLeft === 0 && energy >= state.attackCostEnergy && !attacking;

  async function handleAttack() {
    if (!canAttack) return;
    setError(null);
    setAttacking(true);
    try {
      const result = await attackCore();
      setLastAttack(result);
      applyState(result.state);
      notifyProfileChanged();
    } catch (err) {
      const map: Record<string, string> = {
        CORE_NOT_OPEN: t('core.errorNotOpen'),
        NOT_IN_CLAN: t('core.errorNotInClan'),
        NOT_ENOUGH_ENERGY: t('core.errorNotEnoughEnergy'),
        CORE_ATTACK_COOLDOWN: t('core.errorCooldown'),
        EXPEDITION_IN_PROGRESS: t('core.errorExpedition'),
      };
      setError(err instanceof ApiError && err.code && map[err.code] ? map[err.code] : t('core.attackError'));
      load();
    } finally {
      setAttacking(false);
      refreshProfile();
    }
  }

  return (
    <GameLayout>
      <div className="mb-6 flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-gold/60 bg-well">
          <AssetIcon
            assetId="zones.core"
            alt={t('core.title')}
            className="h-full w-full object-cover"
            fallback={<div className="flex h-full w-full items-center justify-center text-lg font-semibold text-gold">{t('core.title').charAt(0)}</div>}
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{t('core.title')}</h1>
          {state && <p className="text-xs text-textMuted">{t('core.seasonLabel', { season: state.seasonId })}</p>}
        </div>
      </div>

      {error && <p className="mb-4 rounded-md border border-panelBorderDanger bg-panel px-3 py-2 text-xs text-danger">{error}</p>}

      {!state ? (
        <p className="text-xs text-textMuted">{t('core.loading')}</p>
      ) : (
        <>
          <StatusBanner state={state} opensIn={opensIn} endsIn={endsIn} resetIn={resetIn} />

          {state.status === 'OPEN' && (
            <section className="mb-6 rounded-lg border border-panelBorder bg-panel p-4">
              {!state.inClan ? (
                <p className="text-xs text-textMuted">
                  {t('core.joinClanFirst')}{' '}
                  <Link href="/clans" className="text-accent underline">
                    {t('nav.clans')}
                  </Link>
                </p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                    <span className="text-textMuted">
                      {t('core.myDamage')}: <span className="font-semibold tabular-nums text-text">{state.myDamage.toLocaleString()}</span>
                    </span>
                    {state.tavern && state.tavern.level > 0 && (
                      <span className={state.tavern.active ? 'text-positive' : 'text-textFaint'}>
                        {state.tavern.active
                          ? t('core.tavernActive', { percent: state.tavern.bonusPercent })
                          : t('core.tavernInactive', { percent: state.tavern.bonusPercent })}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAttack}
                    disabled={!canAttack}
                    className="w-full rounded-md border border-gold bg-accentBg py-3 text-sm font-semibold uppercase tracking-wide text-gold hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-40 sm:w-64"
                  >
                    {cooldownLeft > 0
                      ? t('core.attackCooldown', { seconds: cooldownLeft })
                      : t('core.attack', { energy: state.attackCostEnergy })}
                  </button>
                  {energy < state.attackCostEnergy && <p className="mt-2 text-xs text-textMuted">{t('core.errorNotEnoughEnergy')}</p>}

                  {lastAttack && (
                    <div className="mt-4 rounded-md border border-wellBorder bg-well p-3 text-xs">
                      <p className="mb-1 font-semibold">{t('core.lastAttack')}</p>
                      <p className="text-textMuted">
                        {t('core.lastAttackSummary', {
                          damage: lastAttack.damageDealt.toLocaleString(),
                          rounds: lastAttack.roundsSurvived,
                          maxRounds: lastAttack.maxRounds,
                          taken: lastAttack.damageTaken.toLocaleString(),
                        })}
                      </p>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <Standings state={state} />

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {state.myClan && <PlayerRanking scope="clan" title={`[${state.myClan.tag}] ${state.myClan.name}`} refreshTick={refreshTick} />}
            <PlayerRanking scope="server" title={t('core.topPlayers')} refreshTick={refreshTick} />
          </div>
        </>
      )}
    </GameLayout>
  );
}

function StatusBanner({ state, opensIn, endsIn, resetIn }: { state: CoreStateDto; opensIn: number | null; endsIn: number | null; resetIn: number | null }) {
  const t = useTranslations();
  const winner = state.standings[0];

  let text: React.ReactNode;
  if (state.status === 'NOT_SCHEDULED') {
    text = t('core.notScheduled');
  } else if (state.status === 'SCHEDULED') {
    text = t('core.opensIn', { time: formatDuration(opensIn ?? 0) });
  } else if (state.status === 'OPEN') {
    text = t('core.endsIn', { time: formatDuration(endsIn ?? 0), days: state.durationDays });
  } else {
    text = winner ? t('core.endedWinner', { clan: `[${winner.clanTag}] ${winner.clanName}` }) : t('core.endedNoWinner');
  }

  return (
    <div className={`mb-6 rounded-lg border p-4 text-sm ${state.status === 'OPEN' ? 'border-gold/60 bg-panel text-gold' : 'border-panelBorder bg-panel text-text'}`}>
      <p className="tabular-nums">{text}</p>
      {state.status !== 'ENDED' && <p className="mt-1 text-xs text-textMuted">{t('core.rulesSummary')}</p>}
      {state.status === 'ENDED' && resetIn !== null && (
        <p className="mt-2 text-xs tabular-nums text-danger">{t('core.resetIn', { time: formatDuration(resetIn) })}</p>
      )}
    </div>
  );
}

function Standings({ state }: { state: CoreStateDto }) {
  const t = useTranslations();
  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-[11px] uppercase tracking-wide text-textFaint">{t('core.standings')}</h2>
      {state.standings.length === 0 ? (
        <p className="text-xs text-textMuted">{t('core.noStandings')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {state.standings.map((standing) => (
            <StandingRow key={standing.clanId ?? standing.clanTag} standing={standing} />
          ))}
          {state.myClanStanding && (
            <>
              <div className="text-center text-xs text-textFaint">⋯</div>
              <StandingRow standing={state.myClanStanding} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

// Gold / silver / bronze for the top three clans' bars and rank numbers.
const PODIUM_BAR: Record<number, string> = { 1: 'bg-podiumGold', 2: 'bg-silver', 3: 'bg-bronze' };
const PODIUM_TEXT: Record<number, string> = { 1: 'text-podiumGold', 2: 'text-silver', 3: 'text-bronze' };

function StandingRow({ standing }: { standing: CoreStandingDto }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${standing.isMyClan ? 'border-accent bg-accentBg' : 'border-wellBorder bg-well'}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`w-6 shrink-0 tabular-nums ${PODIUM_TEXT[standing.rank] ? `font-semibold ${PODIUM_TEXT[standing.rank]}` : 'text-textFaint'}`}>
            #{standing.rank}
          </span>
          <span className="truncate">
            {standing.clanId ? (
              <ClanLink clanId={standing.clanId} tag={standing.clanTag} name={standing.clanName} />
            ) : (
              `[${standing.clanTag}] ${standing.clanName}`
            )}
          </span>
        </span>
        <span className="shrink-0 tabular-nums text-textMuted">{standing.damage.toLocaleString()}</span>
      </div>
      <div className="h-[8px] overflow-hidden rounded-full bg-wellBorder">
        <div
          className={`h-full transition-all duration-700 ${PODIUM_BAR[standing.rank] ?? (standing.isMyClan ? 'bg-energy' : 'bg-accent')}`}
          style={{ width: `${standing.percentOfLeader}%` }}
        />
      </div>
    </div>
  );
}

function PlayerRanking({ scope, title, refreshTick }: { scope: CorePlayerRankingScope; title: string; refreshTick: number }) {
  const t = useTranslations();
  const [data, setData] = useState<CorePlayerRankingPageDto | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    getCorePlayerRanking(scope, page)
      .then(setData)
      .catch(() => undefined);
  }, [scope, page, refreshTick]);

  const showClanTag = scope === 'server';
  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-[11px] uppercase tracking-wide text-textFaint">{title}</h2>

      {/* The viewer's own row, same layout as the list but pinned on top (highlighted via isCurrentPlayer). */}
      {data?.viewerEntry && (
        <div className="mb-3">
          <PlayerRankingRow row={data.viewerEntry} showClanTag={showClanTag} />
        </div>
      )}

      {!data ? (
        <p className="text-xs text-textMuted">{t('core.loading')}</p>
      ) : data.entries.length === 0 ? (
        <p className="text-xs text-textMuted">{t('core.noPlayerDamage')}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {data.entries.map((row) => (
            <PlayerRankingRow key={row.playerId} row={row} showClanTag={showClanTag} />
          ))}
        </div>
      )}

      {data && (
        <div className="-mx-4 -mb-4 mt-3">
          <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onChange={setPage} />
        </div>
      )}
    </section>
  );
}

function PlayerRankingRow({ row, showClanTag }: { row: CorePlayerStandingDto; showClanTag: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-xs ${
        row.isCurrentPlayer ? 'border-accent bg-accentBg' : 'border-wellBorder bg-well'
      } ${row.damage === 0 ? 'opacity-50' : ''}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={`w-6 shrink-0 tabular-nums ${row.rank === 1 ? 'font-semibold text-gold' : 'text-textFaint'}`}>
          {row.rank ? `#${row.rank}` : '—'}
        </span>
        <span className="truncate">
          <PlayerLink playerId={row.playerId} username={row.username} />
          {showClanTag && row.clanTag && <span className="ml-1 text-textFaint">[{row.clanTag}]</span>}
        </span>
      </span>
      <span className="shrink-0 tabular-nums text-textMuted">{row.damage.toLocaleString()}</span>
    </div>
  );
}
