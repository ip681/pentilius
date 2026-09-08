'use client';

import type { MyClanResponseDto, PlayerProfileDto, PvpBattleReportDto, PvpScoutDto, PvpStatusDto, Race } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BattleDivider } from '@/components/BattleDivider';
import { CombatStatsCard } from '@/components/CombatStatsCard';
import { GameLayout } from '@/components/GameLayout';
import { LootEntry } from '@/components/LootEntry';
import { PlayerLink } from '@/components/PlayerLink';
import { Link } from '@/i18n/navigation';
import { ApiError, attackPvpOpponent, getMyClan, getProfile, getPvpReports, getPvpStatus, scoutPvpOpponent } from '@/lib/api-client';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';

interface LogLine {
  text: React.ReactNode;
  kind: 'player' | 'enemy' | 'system';
}

/** The reward summary appended in bold to the final combat-log line on a win — PvP has no XP, only stolen resources/items. */
function RewardSummary({ report }: { report: PvpBattleReportDto }) {
  if (report.lootSummary.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {report.lootSummary.map((loot, index) => (
        <LootEntry key={index} loot={loot} />
      ))}
    </span>
  );
}

interface BattleState {
  report: PvpBattleReportDto;
  round: number;
  youHp: number;
  opponentHp: number;
  log: LogLine[];
  finished: boolean;
}

const ROUND_INTERVAL_MS = 550;

export default function PvpPage() {
  useRequireAuth();
  const t = useTranslations();
  const [status, setStatus] = useState<PvpStatusDto | null>(null);
  const [reports, setReports] = useState<PvpBattleReportDto[] | null>(null);
  const [scout, setScout] = useState<PvpScoutDto | null>(null);
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);
  const [myClan, setMyClan] = useState<MyClanResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myName = profile?.username ?? t('pvp.you');

  async function loadScout() {
    try {
      const scoutRes = await scoutPvpOpponent();
      setScout(scoutRes);
    } catch (err) {
      setScout(null);
      if (err instanceof ApiError && err.status === 404) {
        setError(t('pvp.noOpponents'));
      }
    }
  }

  async function load() {
    try {
      const [statusRes, reportsRes, profileRes, myClanRes] = await Promise.all([getPvpStatus(), getPvpReports(), getProfile(), getMyClan()]);
      setStatus(statusRes);
      setReports(reportsRes);
      setProfile(profileRes);
      setMyClan(myClanRes);
      if (statusRes.unlocked) {
        await loadScout();
      }
    } catch {
      setError(t('pvp.loadError'));
    }
  }

  useEffect(() => {
    load();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAttack() {
    if (!scout) return;
    setError(null);
    try {
      const report = await attackPvpOpponent(scout.opponentId);
      notifyProfileChanged();
      setScout(null);

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

      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(t('pvp.opponentGone'));
        await loadScout();
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t('pvp.notEnoughEnergy'));
      } else {
        setError(t('pvp.attackError'));
      }
    }
  }

  async function handleReroll() {
    setError(null);
    await loadScout();
  }

  function reportLine(report: PvpBattleReportDto) {
    const key =
      report.role === 'attacker'
        ? report.outcome === 'WIN'
          ? 'pvp.outcomeYouWon'
          : 'pvp.outcomeYouLost'
        : report.outcome === 'WIN'
          ? 'pvp.outcomeDefeatedBy'
          : 'pvp.outcomeYouDefended';

    return t.rich(key, {
      name: report.opponentUsername,
      link: () => <PlayerLink playerId={report.opponentId} username={report.opponentUsername} />,
    });
  }

  return (
    <GameLayout>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">{t('pvp.title')}</h1>
        <p className="text-xs text-textMuted">{t('pvp.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-center text-red-400">{error}</p>}

      {status && !status.unlocked && (
        <div className="mb-6 rounded-lg border border-panelBorder bg-panel p-5 text-center text-sm text-textMuted">
          {t('pvp.locked', { level: status.minLevel })}
        </div>
      )}

      {status?.unlocked && !battle && (
        <div className="mb-6">
          {scout ? (
            <div className="rounded-lg border border-panelBorder bg-panel p-5">
              <h2 className="mb-4 text-center text-sm font-semibold">{t('pvp.scoutTitle')}</h2>
              <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 sm:gap-5">
                {profile && (
                  <CombatStatsCard
                    title={myName}
                    subtitle={`${t(`race.${profile.race}.name`)} · ${t('pvp.level')} ${profile.level} · ${myClan?.clan ? `[${myClan.clan.tag}]` : '-'}`}
                    stats={scout.myStats}
                    variant="player"
                    icon={{ assetId: `races.${profile.race.toLowerCase()}.icon`, alt: t(`race.${profile.race}.name`) }}
                    showItemBonuses={false}
                  />
                )}
                <BattleDivider />
                <CombatStatsCard
                  title={<PlayerLink playerId={scout.opponentId} username={scout.opponentUsername} className="hover:text-accent" />}
                  subtitle={`${t(`race.${scout.opponentRace}.name`)} · ${t('pvp.level')} ${scout.opponentLevel} · ${scout.opponentClanTag ? `[${scout.opponentClanTag}]` : '-'}`}
                  stats={scout.opponentStats}
                  variant="enemy"
                  icon={{ assetId: `races.${scout.opponentRace.toLowerCase()}.icon`, alt: t(`race.${scout.opponentRace}.name`) }}
                  showItemBonuses={false}
                />
              </div>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleReroll}
                  className="rounded-md border border-wellBorder bg-well px-5 py-2.5 text-xs uppercase text-textMuted hover:bg-accentBgHover"
                >
                  {t('pvp.reroll')}
                </button>
                <button
                  type="button"
                  onClick={handleAttack}
                  className="rounded-md border border-accent bg-accentBg px-6 py-2.5 text-xs uppercase hover:bg-accentBgHover"
                >
                  {t('pvp.attack')}
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-textFaint">{t('pvp.attackCost', { amount: status.attackCostEnergy })}</p>
            </div>
          ) : (
            <div className="text-center">
              <button
                type="button"
                onClick={handleReroll}
                className="rounded-md border border-accent bg-accentBg px-6 py-2.5 text-xs uppercase hover:bg-accentBgHover"
              >
                {t('pvp.findOpponent')}
              </button>
            </div>
          )}
        </div>
      )}

      {battle && (
        <>
          <section className="mb-6 grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 sm:gap-5">
            <FighterPanel name={myName} hp={battle.youHp} maxHp={battle.report.attackerMaxHp} variant="player" race={profile?.race} />

            <BattleDivider round={battle.round} />

            <FighterPanel
              name={<PlayerLink playerId={battle.report.opponentId} username={battle.report.opponentUsername} className="hover:text-accent" />}
              hp={battle.opponentHp}
              maxHp={battle.report.defenderMaxHp}
              variant="enemy"
              race={battle.report.opponentRace}
            />
          </section>

          <section className="mb-6 rounded-lg border border-panelBorder bg-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">{t('pve.combatLog')}</h2>
            <div className="h-[190px] overflow-y-auto rounded border border-wellBorder bg-ink p-2.5 font-mono text-[11px] leading-relaxed">
              {battle.log.map((line, index) => (
                <div key={index} className={line.kind === 'player' ? 'text-positive' : line.kind === 'enemy' ? 'text-danger' : 'text-textMuted'}>
                  {line.text}
                </div>
              ))}
            </div>
            {battle.finished && (
              <button
                type="button"
                onClick={() => {
                  setBattle(null);
                  loadScout();
                }}
                className="mt-4 w-full rounded-md border border-accent bg-accentBg py-2.5 text-[11px] uppercase hover:bg-accentBgHover"
              >
                {t('pvp.attackAgain')}
              </button>
            )}
          </section>
        </>
      )}

      {reports && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t('pvp.reportsTitle')}</h2>
          <ul className="flex flex-col gap-3">
            {reports.slice(0, 5).map((report) => (
              <li key={report.id} className="rounded-lg border border-panelBorder bg-panel p-4 text-sm">
                <p className="font-medium">{reportLine(report)}</p>
                <p className="text-textMuted">{new Date(report.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
          <Link href="/reports" className="mt-3 inline-block text-xs text-accent hover:underline">
            {t('nav.reports')} →
          </Link>
        </section>
      )}
    </GameLayout>
  );
}

function FighterPanel({
  name,
  hp,
  maxHp,
  variant,
  race,
}: {
  name: React.ReactNode;
  hp: number;
  maxHp: number;
  variant: 'player' | 'enemy';
  race?: Race;
}) {
  const t = useTranslations();
  const percent = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
  const fallbackLetter = <span className="text-base font-semibold text-textMuted sm:text-2xl">?</span>;
  return (
    <div className={`min-w-0 rounded-lg border p-2 sm:p-5 ${variant === 'enemy' ? 'border-panelBorderDanger' : 'border-panelBorder'} bg-panel`}>
      <div className="mb-2 truncate text-[11px] font-semibold sm:mb-4 sm:text-base">{name}</div>
      <div className="mb-2 flex h-14 items-center justify-center rounded-full bg-gradient-to-b from-wellBorder/50 to-transparent sm:mb-4 sm:h-[100px]">
        {race ? (
          <AssetIcon
            assetId={`races.${race.toLowerCase()}.icon`}
            alt={t(`race.${race}.name`)}
            className="h-full w-auto object-contain"
            fallback={<span className="text-base font-semibold text-textMuted sm:text-2xl">{t(`race.${race}.name`).charAt(0)}</span>}
          />
        ) : (
          fallbackLetter
        )}
      </div>
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
