'use client';

import type { BossDto, BossEncounterResultDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { getBosses, joinBossEncounter, resolveBossEncounter } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { useRequireAuth } from '@/lib/use-require-auth';

interface LogLine {
  text: string;
  kind: 'player' | 'enemy' | 'system';
}

interface BattleState {
  bossKey: string;
  bossNameKey: string;
  result: BossEncounterResultDto;
  round: number;
  partyHp: number;
  bossHp: number;
  log: LogLine[];
  finished: boolean;
}

const ROUND_INTERVAL_MS = 550;

export default function BossesPage() {
  useRequireAuth();
  const t = useTranslations();
  const [data, setData] = useState<BossDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      setData(await getBosses());
    } catch {
      setError(t('bosses.loadError'));
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleJoin(key: string) {
    setError(null);
    try {
      await joinBossEncounter(key);
      await load();
    } catch {
      setError(t('bosses.joinError'));
    }
  }

  async function handleResolve(boss: BossDto) {
    setError(null);
    try {
      const result = await resolveBossEncounter(boss.key);
      await load();

      setBattle({
        bossKey: boss.key,
        bossNameKey: boss.nameKey,
        result,
        round: 0,
        partyHp: result.partyMaxHp,
        bossHp: result.bossMaxHp,
        log: [{ text: t('bosses.encounterStart', { name: t(boss.nameKey) }), kind: 'system' }],
        finished: result.rounds.length === 0,
      });

      let index = 0;
      timerRef.current = setInterval(() => {
        if (index >= result.rounds.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }
        const roundData = result.rounds[index];
        index += 1;

        setBattle((previous) => {
          if (!previous) return previous;
          const log: LogLine[] = [
            ...previous.log,
            { text: t('bosses.roundHit', { name: t('bosses.party'), damage: roundData.playerDamage }), kind: 'player' },
          ];
          if (roundData.pentiliDamage > 0) {
            log.push({ text: t('bosses.roundHit', { name: t(boss.nameKey), damage: roundData.pentiliDamage }), kind: 'enemy' });
          }
          const finished = index >= result.rounds.length;
          if (finished) {
            log.push({
              text: result.outcome === 'WIN' ? t('bosses.victoryLog') : t('bosses.defeatLog'),
              kind: result.outcome === 'WIN' ? 'player' : 'enemy',
            });
          }
          return {
            ...previous,
            round: roundData.round,
            partyHp: roundData.playerHpAfter,
            bossHp: roundData.pentiliHpAfter,
            log,
            finished,
          };
        });
      }, ROUND_INTERVAL_MS);
    } catch {
      setError(t('bosses.resolveError'));
    }
  }

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('bosses.title')}</h1>
        <p className="text-xs text-textMuted">{t('bosses.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {battle && (
        <>
          {battle.finished && (
            <div className="mb-6 rounded-lg border border-panelBorder bg-panel p-5 text-center">
              <div className="mb-1 text-xl font-semibold">
                {battle.result.outcome === 'WIN' ? t('bosses.victory') : battle.result.outcome === 'LOSS' ? t('bosses.defeat') : t('bosses.noOne')}
              </div>
              {battle.result.outcome === 'WIN' && (
                <p className="text-xs text-textMuted">
                  {t('bosses.synergyBonus', { percent: Math.round(battle.result.synergyBonusPercent * 100) })}
                </p>
              )}
            </div>
          )}

          <section className="mb-6 grid grid-cols-1 items-center gap-5 md:grid-cols-[1fr_120px_1fr]">
            <FighterPanel name={t('bosses.party')} hp={battle.partyHp} maxHp={battle.result.partyMaxHp} variant="player" />

            <div className="text-center">
              <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border border-accent bg-panelHeader text-lg font-bold text-textMuted">
                {t('pve.vs')}
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-widest text-textFaint">
                {t('pve.round')} {battle.round}
              </div>
            </div>

            <FighterPanel name={t(battle.bossNameKey)} hp={battle.bossHp} maxHp={battle.result.bossMaxHp} variant="enemy" />
          </section>

          <section className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-[1.5fr_1fr]">
            <div className="rounded-lg border border-panelBorder bg-panel p-4">
              <h2 className="mb-3 text-sm font-semibold">{t('pve.combatLog')}</h2>
              <div className="h-[190px] overflow-y-auto rounded border border-wellBorder bg-ink p-2.5 font-mono text-[11px] leading-relaxed">
                {battle.log.map((line, index) => (
                  <div key={index} className={line.kind === 'player' ? 'text-positive' : line.kind === 'enemy' ? 'text-danger' : 'text-textMuted'}>
                    {line.text}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-panelBorder bg-panel p-4">
              <h2 className="mb-3 text-sm font-semibold">{t('bosses.contribution')}</h2>
              {battle.finished && battle.result.participants.length > 0 ? (
                <ul className="flex flex-col gap-2 text-xs text-textMuted">
                  {battle.result.participants.map((p) => (
                    <li key={p.playerId} className="flex items-center justify-between">
                      <span>{Math.round(p.contributionShare * 100)}%</span>
                      <span>+{p.xpGained} {t('pve.xpGained')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-textFaint">{t('pve.noRewardsYet')}</p>
              )}
            </div>
          </section>
        </>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {data.map((boss) => {
            const isParticipant = boss.encounter.participants.some((p) => p.isCurrentPlayer);
            const isOpen = boss.encounter.status === 'OPEN';
            const remainingMs = isOpen ? new Date(boss.encounter.resolvesAt).getTime() - Date.now() : 0;

            return (
              <section key={boss.id} className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
                <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
                  <span className="text-sm font-semibold">{t(boss.nameKey)}</span>
                  <span className="text-[10px] uppercase text-textFaint">{t(boss.zoneNameKey)}</span>
                </div>

                <div className="p-5">
                  {!boss.unlocked ? (
                    <p className="mb-4 text-xs text-textMuted">{t('bosses.locked')}</p>
                  ) : (
                    <>
                      <p className="mb-3 text-xs text-textMuted">
                        HP {boss.maxHp} · {t('bosses.attack')} {boss.attack} · {t('bosses.defense')} {boss.defense}
                      </p>

                      {isOpen ? (
                        <>
                          <div className="mb-1 flex justify-between text-[10px] text-textMuted">
                            <span>{t('bosses.joinWindow')}</span>
                            <span className="tabular-nums">{formatDuration(remainingMs / 1000)}</span>
                          </div>
                          <p className="mb-4 text-xs text-textMuted">
                            {t('bosses.participants', { count: boss.encounter.participants.length })}
                          </p>
                        </>
                      ) : (
                        <p className="mb-4 text-xs text-positive">{t('bosses.previousResolved')}</p>
                      )}

                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!isOpen || isParticipant}
                          onClick={() => handleJoin(boss.key)}
                          className="flex-1 rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase text-text hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {isParticipant ? t('bosses.joined') : t('bosses.join')}
                        </button>
                        <button
                          type="button"
                          disabled={!isOpen || !isParticipant}
                          onClick={() => handleResolve(boss)}
                          className="flex-1 rounded-md border border-panelBorderDanger bg-well py-2.5 text-xs uppercase text-danger hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {t('bosses.resolve')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>
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
