'use client';

import type { PlayerProfileDto, PvpBattleReportDto, PvpScoutDto, PvpStatusDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { CombatStatsCard } from '@/components/CombatStatsCard';
import { GameLayout } from '@/components/GameLayout';
import { PlayerLink } from '@/components/PlayerLink';
import { ApiError, attackPvpOpponent, getProfile, getPvpReports, getPvpStatus, scoutPvpOpponent } from '@/lib/api-client';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';

interface LogLine {
  text: string;
  kind: 'player' | 'enemy' | 'system';
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
      const [statusRes, reportsRes, profileRes] = await Promise.all([getPvpStatus(), getPvpReports(), getProfile()]);
      setStatus(statusRes);
      setReports(reportsRes);
      setProfile(profileRes);
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
          }
          if (roundData.playerDodged) {
            log.push({ text: t('pvp.roundDodge', { name: myName }), kind: 'player' });
          } else if (roundData.pentiliDamage > 0) {
            log.push({ text: t('pvp.roundHit', { name: report.opponentUsername, damage: roundData.pentiliDamage }), kind: 'enemy' });
          }
          const finished = index >= report.rounds.length;
          if (finished) {
            log.push({
              text: report.outcome === 'WIN' ? t('pvp.victoryLog') : t('pvp.defeatLog'),
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
              <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-2">
                <CombatStatsCard title={myName} stats={scout.myStats} variant="player" />
                <CombatStatsCard
                  title={<PlayerLink playerId={scout.opponentId} username={scout.opponentUsername} className="hover:text-accent" />}
                  subtitle={`${t(`race.${scout.opponentRace}.name`)} · ${t('pvp.level')} ${scout.opponentLevel}`}
                  stats={scout.opponentStats}
                  variant="enemy"
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
          {battle.finished && (
            <div className="mb-6 rounded-lg border border-panelBorder bg-panel p-5 text-center">
              <div className="mb-1 text-xl font-semibold">{battle.report.outcome === 'WIN' ? t('pvp.victory') : t('pvp.defeat')}</div>
              {battle.report.lootSummary.length > 0 && (
                <p className="text-xs text-textMuted">
                  {battle.report.lootSummary.map((loot, index) => (
                    <span key={index}>
                      {index > 0 && ' · '}+{loot.quantity} {t(`resource.${loot.resourceType}`)}
                    </span>
                  ))}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setBattle(null);
                  loadScout();
                }}
                className="mt-4 rounded-md border border-accent bg-accentBg px-5 py-2 text-[11px] uppercase hover:bg-accentBgHover"
              >
                {t('pvp.attackAgain')}
              </button>
            </div>
          )}

          <section className="mb-6 grid grid-cols-1 items-center gap-5 md:grid-cols-[1fr_120px_1fr]">
            <FighterPanel name={myName} hp={battle.youHp} maxHp={battle.report.attackerMaxHp} variant="player" />

            <div className="text-center">
              <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border border-accent bg-panelHeader text-lg font-bold text-textMuted">
                {t('pve.vs')}
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-widest text-textFaint">
                {t('pve.round')} {battle.round}
              </div>
            </div>

            <FighterPanel
              name={<PlayerLink playerId={battle.report.opponentId} username={battle.report.opponentUsername} className="hover:text-accent" />}
              hp={battle.opponentHp}
              maxHp={battle.report.defenderMaxHp}
              variant="enemy"
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
          </section>
        </>
      )}

      {reports && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t('pvp.reportsTitle')}</h2>
          <ul className="flex flex-col gap-3">
            {reports.map((report) => (
              <li key={report.id} className="rounded-lg border border-panelBorder bg-panel p-4 text-sm">
                <p className="font-medium">{reportLine(report)}</p>
                <p className="text-textMuted">{new Date(report.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </GameLayout>
  );
}

function FighterPanel({ name, hp, maxHp, variant }: { name: React.ReactNode; hp: number; maxHp: number; variant: 'player' | 'enemy' }) {
  const t = useTranslations();
  const percent = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
  return (
    <div className={`rounded-lg border p-5 ${variant === 'enemy' ? 'border-panelBorderDanger' : 'border-panelBorder'} bg-panel`}>
      <div className="mb-4 text-base font-semibold">{name}</div>
      <div className="mb-4 flex h-[100px] items-center justify-center rounded-md border border-panelBorder bg-well">
        <div className={`h-10 w-32 ${variant === 'enemy' ? 'bg-danger' : 'bg-accent'} opacity-70`} style={{ clipPath: 'polygon(0 50%, 20% 15%, 80% 15%, 100% 50%, 80% 85%, 20% 85%)' }} />
      </div>
      <div className="mb-1.5 flex justify-between text-[11px] text-textMuted">
        <span>{t('robot.stat.hp')}</span>
        <span>
          {Math.round(hp)} / {maxHp}
        </span>
      </div>
      <div className="h-[9px] overflow-hidden rounded-full bg-wellBorder">
        <div className={`h-full transition-all duration-500 ${variant === 'enemy' ? 'bg-danger' : 'bg-positive'}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
