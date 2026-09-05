'use client';

import type { PvpBattleReportDto, PvpStatusDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { ApiError, attackRandomOpponent, getPvpReports, getPvpStatus } from '@/lib/api-client';
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
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const [statusRes, reportsRes] = await Promise.all([getPvpStatus(), getPvpReports()]);
      setStatus(statusRes);
      setReports(reportsRes);
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
    setError(null);
    try {
      const report = await attackRandomOpponent();

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
          const log: LogLine[] = [
            ...previous.log,
            { text: t('pvp.roundHit', { name: t('pvp.you'), damage: roundData.playerDamage }), kind: 'player' },
          ];
          if (roundData.pentiliDamage > 0) {
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
        setError(t('pvp.noOpponents'));
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t('pvp.notEnoughEnergy'));
      } else {
        setError(t('pvp.attackError'));
      }
    }
  }

  function reportLine(report: PvpBattleReportDto): string {
    if (report.role === 'attacker') {
      return report.outcome === 'WIN'
        ? t('pvp.outcomeYouWon', { name: report.opponentUsername })
        : t('pvp.outcomeYouLost', { name: report.opponentUsername });
    }
    return report.outcome === 'WIN'
      ? t('pvp.outcomeDefeatedBy', { name: report.opponentUsername })
      : t('pvp.outcomeYouDefended', { name: report.opponentUsername });
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
        <div className="mb-6 text-center">
          <button
            type="button"
            onClick={handleAttack}
            className="rounded-md border border-accent bg-accentBg px-6 py-2.5 text-xs uppercase hover:bg-accentBgHover"
          >
            {t('pvp.attack')}
          </button>
          <p className="mt-2 text-[10px] text-textFaint">{t('pvp.attackCost', { amount: status.attackCostEnergy })}</p>
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
                onClick={() => setBattle(null)}
                className="mt-4 rounded-md border border-accent bg-accentBg px-5 py-2 text-[11px] uppercase hover:bg-accentBgHover"
              >
                {t('pvp.attackAgain')}
              </button>
            </div>
          )}

          <section className="mb-6 grid grid-cols-1 items-center gap-5 md:grid-cols-[1fr_120px_1fr]">
            <FighterPanel name={t('pvp.you')} hp={battle.youHp} maxHp={battle.report.attackerMaxHp} variant="player" />

            <div className="text-center">
              <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border border-accent bg-panelHeader text-lg font-bold text-textMuted">
                {t('pve.vs')}
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-widest text-textFaint">
                {t('pve.round')} {battle.round}
              </div>
            </div>

            <FighterPanel name={battle.report.opponentUsername} hp={battle.opponentHp} maxHp={battle.report.defenderMaxHp} variant="enemy" />
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

function FighterPanel({ name, hp, maxHp, variant }: { name: string; hp: number; maxHp: number; variant: 'player' | 'enemy' }) {
  const percent = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
  return (
    <div className={`rounded-lg border p-5 ${variant === 'enemy' ? 'border-panelBorderDanger' : 'border-panelBorder'} bg-panel`}>
      <div className="mb-4 text-base font-semibold">{name}</div>
      <div className="mb-4 flex h-[100px] items-center justify-center rounded-md border border-panelBorder bg-well">
        <div className={`h-10 w-32 ${variant === 'enemy' ? 'bg-danger' : 'bg-accent'} opacity-70`} style={{ clipPath: 'polygon(0 50%, 20% 15%, 80% 15%, 100% 50%, 80% 85%, 20% 85%)' }} />
      </div>
      <div className="mb-1.5 flex justify-between text-[11px] text-textMuted">
        <span>HP</span>
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
