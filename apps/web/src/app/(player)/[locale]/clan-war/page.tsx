'use client';

import type {
  ClanWarAttackReportDto,
  ClanWarContributionEntryDto,
  ClanWarContributionsDto,
  ClanWarHistoryEntryDto,
  ClanWarStateDto,
  ClanWarTargetDto,
} from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BattleDivider } from '@/components/BattleDivider';
import { GameLayout } from '@/components/GameLayout';
import { LootEntry } from '@/components/LootEntry';
import { ResourceIcon } from '@/components/ResourceIcon';
import { ApiError, attackClanWarTarget, getClanWarContributions, getClanWarHistory, getClanWarStatus, getClanWarTargets } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-datetime';
import { formatDuration } from '@/lib/format-duration';
import { notifyProfileChanged } from '@/lib/profile-events';
import { usePlayerEnergy } from '@/lib/use-player-energy';
import { useRequireAuth } from '@/lib/use-require-auth';

interface LogLine {
  text: React.ReactNode;
  kind: 'player' | 'enemy' | 'system';
}

interface BattleState {
  report: ClanWarAttackReportDto;
  round: number;
  youHp: number;
  opponentHp: number;
  log: LogLine[];
  finished: boolean;
}

const ROUND_INTERVAL_MS = 550;

function RewardSummary({ report }: { report: ClanWarAttackReportDto }) {
  if (report.lootSummary.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {report.lootSummary.map((loot, index) => (
        <LootEntry key={index} loot={loot} />
      ))}
    </span>
  );
}

export default function ClanWarPage() {
  useRequireAuth();
  const t = useTranslations();
  const [war, setWar] = useState<ClanWarStateDto | null | undefined>(undefined);
  const [targets, setTargets] = useState<ClanWarTargetDto[] | null>(null);
  const [contributions, setContributions] = useState<ClanWarContributionsDto | null>(null);
  const [lastWar, setLastWar] = useState<ClanWarHistoryEntryDto | null>(null);
  const { profile, refreshProfile } = usePlayerEnergy();
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [attacking, setAttacking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const myName = t('pve.you');

  async function load() {
    try {
      const { war: status } = await getClanWarStatus();
      setWar(status);
      if (status) {
        const [list, contributionsRes] = await Promise.all([getClanWarTargets(), getClanWarContributions(status.id)]);
        setTargets(list);
        setContributions(contributionsRes);
        setLastWar(null);
      } else {
        setTargets(null);
        setContributions(null);
        const history = await getClanWarHistory();
        setLastWar(history[0] ?? null);
      }
    } catch {
      setError(t('clans.war.loadError'));
    }
  }

  useEffect(() => {
    load();
    const dataInterval = setInterval(load, 10_000);
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(clockInterval);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [battle?.log]);

  async function handleAttack(defenderId: string) {
    if (attacking) return;
    setError(null);
    setAttacking(true);
    try {
      const report = await attackClanWarTarget(defenderId);
      notifyProfileChanged();

      setBattle({
        report,
        round: 0,
        youHp: report.attackerMaxHp,
        opponentHp: report.defenderMaxHp,
        log: [{ text: t('pvp.encounterStart', { name: report.opponentUsername }), kind: 'system' }],
        finished: report.rounds.length === 0,
      });

      let index = 0;
      timerRef.current = setInterval(() => {
        if (index >= report.rounds.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }
        const roundData = report.rounds[index];
        index += 1;

        setBattle((previous) => {
          if (!previous) return previous;
          const log: LogLine[] = [...previous.log];
          if (roundData.pentiliDodged) {
            log.push({ text: t('pvp.roundDodge', { name: report.opponentUsername }), kind: 'enemy' });
          } else {
            log.push({ text: t('pvp.roundHit', { name: myName, damage: roundData.playerDamage }), kind: 'player' });
            if (roundData.playerCritical) log.push({ text: t('pvp.roundCritical', { name: myName }), kind: 'player' });
            if (roundData.pentiliReflectedDamage > 0) {
              log.push({ text: t('pvp.roundReflect', { name: report.opponentUsername, damage: roundData.pentiliReflectedDamage }), kind: 'enemy' });
            }
          }
          if (roundData.playerDodged) {
            log.push({ text: t('pvp.roundDodge', { name: myName }), kind: 'player' });
          } else if (roundData.pentiliDamage > 0) {
            log.push({ text: t('pvp.roundHit', { name: report.opponentUsername, damage: roundData.pentiliDamage }), kind: 'enemy' });
            if (roundData.pentiliCritical) log.push({ text: t('pvp.roundCritical', { name: report.opponentUsername }), kind: 'enemy' });
            if (roundData.playerReflectedDamage > 0) {
              log.push({ text: t('pvp.roundReflect', { name: myName, damage: roundData.playerReflectedDamage }), kind: 'player' });
            }
          }
          const finished = index >= report.rounds.length;
          if (finished) {
            const outcomeText = report.outcome === 'WIN' ? t('pvp.victoryLog') : t('pvp.defeatLog');
            const hasReward = report.outcome === 'WIN' && report.lootSummary.length > 0;
            log.push({
              text: hasReward ? (
                <>
                  {outcomeText}{' '}
                  <strong className="font-semibold">
                    <RewardSummary report={report} />
                  </strong>
                </>
              ) : (
                outcomeText
              ),
              kind: report.outcome === 'WIN' ? 'player' : 'enemy',
            });
          }
          return {
            ...previous,
            round: roundData.round,
            youHp: roundData.playerHpAfter,
            opponentHp: roundData.pentiliHpAfter,
            log,
            finished,
          };
        });
      }, ROUND_INTERVAL_MS);

      await Promise.all([load(), refreshProfile()]);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TARGET_PROTECTED') {
        setError(t('clans.war.errorTargetProtected'));
      } else if (err instanceof ApiError && err.code === 'ATTACK_COOLDOWN') {
        setError(t('clans.war.errorAttackCooldown'));
      } else if (err instanceof ApiError && err.code === 'EXPEDITION_IN_PROGRESS') {
        setError(t('pve.expeditionInProgress'));
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t('pvp.notEnoughEnergy'));
      } else {
        setError(t('pvp.attackError'));
      }
      await Promise.all([load(), refreshProfile()]);
    } finally {
      setAttacking(false);
    }
  }

  const myPercent = war ? Math.max(0, Math.min(100, (war.myPoolRemaining / Math.max(1, war.myPoolRemaining + war.enemyPoolRemaining)) * 100)) : 50;
  const secondsLeft = war ? Math.max(0, Math.ceil((new Date(war.endsAt).getTime() - now) / 1000)) : 0;

  return (
    <GameLayout>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">{t('clans.war.title')}</h1>
        <p className="text-xs text-textMuted">{t('clans.war.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-center text-red-400">{error}</p>}

      {war === undefined && null}

      {war === null && (
        <div className="rounded-lg border border-panelBorder bg-panel p-5 text-center text-sm text-textMuted">
          {lastWar ? (
            <>
              <p className="mb-3">{t('clans.war.notAtWar')}</p>
              <LastWarResultCard entry={lastWar} />
            </>
          ) : (
            <p>{t('clans.war.notAtWar')}</p>
          )}
        </div>
      )}

      {war && (
        <>
          <section className="mb-6 rounded-lg border border-panelBorderDanger bg-panel p-5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-positive">
                [{war.myClanTag}] {war.myClanName}
              </span>
              <span className="font-semibold text-danger">
                [{war.enemyClanTag}] {war.enemyClanName}
              </span>
            </div>
            <div className="mb-2 flex h-4 overflow-hidden rounded-full bg-wellBorder">
              <div className="h-full bg-positive transition-all duration-500" style={{ width: `${myPercent}%` }} />
              <div className="h-full bg-danger transition-all duration-500" style={{ width: `${100 - myPercent}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-textFaint">
              <span>
                {war.myPoolRemaining.toLocaleString()} / {war.myPoolMax.toLocaleString()}
              </span>
              <span className="tabular-nums">{t('clans.war.timeLeft')}: {formatDuration(secondsLeft)}</span>
              <span>
                {war.enemyPoolRemaining.toLocaleString()} / {war.enemyPoolMax.toLocaleString()}
              </span>
            </div>
          </section>

          {battle ? (
            <>
              <section className="mb-6 grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 sm:gap-5">
                <FighterPanel name={myName} hp={battle.youHp} maxHp={battle.report.attackerMaxHp} variant="player" />
                <BattleDivider round={battle.round} />
                <FighterPanel name={battle.report.opponentUsername} hp={battle.opponentHp} maxHp={battle.report.defenderMaxHp} variant="enemy" />
              </section>

              <section className="mb-6 rounded-lg border border-panelBorder bg-panel p-4">
                <h2 className="mb-3 text-sm font-semibold">{t('pve.combatLog')}</h2>
                <div ref={logRef} className="h-[190px] overflow-y-auto rounded border border-wellBorder bg-ink p-2.5 font-mono text-[11px] leading-relaxed">
                  {battle.log.map((line, index) => (
                    <div key={index} className={line.kind === 'player' ? 'text-positive' : line.kind === 'enemy' ? 'text-danger' : 'text-textMuted'}>
                      {line.text}
                    </div>
                  ))}
                </div>
                {battle.finished && (
                  <button
                    type="button"
                    onClick={() => setBattle(null)}
                    className="mt-4 w-full rounded-md border border-accent bg-accentBg py-2.5 text-[11px] uppercase hover:bg-accentBgHover"
                  >
                    {t('clans.war.backToTargets')}
                  </button>
                )}
              </section>
            </>
          ) : (
            <section className="rounded-lg border border-panelBorder bg-panel p-4">
              <h2 className="mb-3 text-sm font-semibold">{t('clans.war.targets')}</h2>
              <div className="flex flex-col gap-2">
                {targets?.length === 0 && <p className="p-2 text-xs text-textFaint">{t('clans.war.noTargets')}</p>}
                {targets?.map((target) => {
                  const onCooldown = !!target.attackableAt && new Date(target.attackableAt).getTime() > now;
                  const secondsUntil = target.attackableAt ? Math.max(0, Math.ceil((new Date(target.attackableAt).getTime() - now) / 1000)) : 0;
                  const hasEnergy = (profile?.energy.current ?? 0) >= 1;
                  const attackable = !onCooldown && hasEnergy && !attacking;
                  return (
                    <div key={target.playerId} className="flex items-center gap-3 rounded-md border border-wellBorder bg-well p-3">
                      <AssetIcon
                        assetId={`races.${target.race.toLowerCase()}.icon`}
                        alt={t(`race.${target.race}.name`)}
                        className="h-8 w-8 shrink-0 object-contain"
                        fallback={<div className="h-8 w-8 shrink-0 rounded-full bg-accent opacity-60" />}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{target.username}</p>
                        <p className="text-[10px] text-textFaint">{t('pvp.level')} {target.level}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[9px] text-textFaint">
                          <span>{t('robot.stat.damage')} {Math.round(target.stats.attack)}</span>
                          <span>{t('robot.stat.defense')} {Math.round(target.stats.defense)}</span>
                          <span>{t('robot.stat.hp')} {Math.round(target.stats.hp)}</span>
                          <span>{t('robot.stat.evasion')} {target.stats.evasion}%</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={onCooldown || attacking}
                        aria-disabled={!hasEnergy}
                        onClick={() => handleAttack(target.playerId)}
                        className="shrink-0 rounded-md border border-panelBorderDanger bg-well px-4 py-2 text-[10px] uppercase text-danger hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30 aria-disabled:cursor-not-allowed aria-disabled:opacity-30"
                      >
                        {onCooldown ? formatDuration(secondsUntil) : t('clans.war.attack')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {!battle && contributions && (contributions.mine.length > 0 || contributions.enemy.length > 0) && (
            <section className="mt-6 rounded-lg border border-panelBorder bg-panel p-4">
              <h2 className="mb-3 text-sm font-semibold">{t('clans.war.contributions')}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ContributionList title={t('clans.war.contributionsMine')} entries={contributions.mine} accent="text-positive" />
                <ContributionList title={t('clans.war.contributionsEnemy')} entries={contributions.enemy} accent="text-danger" />
              </div>
            </section>
          )}
        </>
      )}
    </GameLayout>
  );
}

function LastWarResultCard({ entry }: { entry: ClanWarHistoryEntryDto }) {
  const t = useTranslations();
  const hasTreasuryChange = entry.treasuryMetalChange !== 0 || entry.treasuryCrystalChange !== 0 || entry.treasuryCreditsChange !== 0;
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-1.5 rounded-md border border-wellBorder bg-well p-4 text-left">
      <p>
        <span
          className={entry.won === true ? 'font-semibold text-positive' : entry.won === false ? 'font-semibold text-danger' : 'font-semibold text-textMuted'}
        >
          {entry.won === true ? t('clans.war.outcomeWon') : entry.won === false ? t('clans.war.outcomeLost') : t('clans.war.outcomeDraw')}
        </span>{' '}
        <span className="text-textFaint">
          {t(`clans.war.outcomeType.${entry.outcome}`)} · {t('clans.war.vs')} [{entry.opponentClanTag}] {entry.opponentClanName}
        </span>
      </p>
      <p className="text-[10px] text-textFaint">{formatDateTime(entry.resolvedAt)}</p>
      {hasTreasuryChange && (
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          {entry.treasuryMetalChange !== 0 && (
            <span className={entry.treasuryMetalChange > 0 ? 'text-positive' : 'text-danger'}>
              {entry.treasuryMetalChange > 0 ? '+' : ''}
              {entry.treasuryMetalChange.toLocaleString()} <ResourceIcon type="METAL" className="inline h-3 w-3" />
            </span>
          )}
          {entry.treasuryCrystalChange !== 0 && (
            <span className={entry.treasuryCrystalChange > 0 ? 'text-positive' : 'text-danger'}>
              {entry.treasuryCrystalChange > 0 ? '+' : ''}
              {entry.treasuryCrystalChange.toLocaleString()} <ResourceIcon type="CRYSTAL" className="inline h-3 w-3" />
            </span>
          )}
          {entry.treasuryCreditsChange !== 0 && (
            <span className={entry.treasuryCreditsChange > 0 ? 'text-positive' : 'text-danger'}>
              {entry.treasuryCreditsChange > 0 ? '+' : ''}
              {entry.treasuryCreditsChange.toLocaleString()} <ResourceIcon type="CREDITS" className="inline h-3 w-3" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ContributionList({ title, entries, accent }: { title: string; entries: ClanWarContributionEntryDto[]; accent: string }) {
  const t = useTranslations();
  return (
    <div>
      <h3 className={`mb-2 text-[10px] font-semibold uppercase tracking-wide ${accent}`}>{title}</h3>
      {entries.length === 0 ? (
        <p className="text-[10px] text-textFaint">{t('clans.war.noTargets')}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map((entry, index) => (
            <div key={entry.playerId} className="flex items-center justify-between rounded-md border border-wellBorder bg-well px-2.5 py-1.5 text-[11px]">
              <span className="truncate">
                <span className="text-textFaint">#{index + 1}</span> {entry.username}
              </span>
              <span className="shrink-0 text-textFaint">
                {entry.totalDamageDealt.toLocaleString()} · {entry.attackCount} {t('clans.war.hits')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FighterPanel({ name, hp, maxHp, variant }: { name: React.ReactNode; hp: number; maxHp: number; variant: 'player' | 'enemy' }) {
  const t = useTranslations();
  const percent = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
  return (
    <div className={`min-w-0 rounded-lg border p-2 sm:p-5 ${variant === 'enemy' ? 'border-panelBorderDanger' : 'border-panelBorder'} bg-panel`}>
      <div className="mb-2 truncate text-[11px] font-semibold sm:mb-4 sm:text-base">{name}</div>
      <div className="mb-1 flex justify-between text-[9px] text-textMuted sm:mb-1.5 sm:text-[11px]">
        <span>{t('robot.stat.hp')}</span>
        <span>
          {Math.round(hp)} / {maxHp}
        </span>
      </div>
      <div className="h-[7px] overflow-hidden rounded-full bg-wellBorder sm:h-[9px]">
        <div className={`h-full transition-all duration-500 ${variant === 'enemy' ? 'bg-danger' : 'bg-positive'}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
