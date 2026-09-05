'use client';

import type { BattleReportDto, PentiliDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { attackPentili, getPentiliInZone } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

interface LogLine {
  text: string;
  kind: 'player' | 'enemy' | 'system';
}

interface BattleState {
  target: PentiliDto;
  report: BattleReportDto;
  round: number;
  playerHp: number;
  pentiliHp: number;
  log: LogLine[];
  finished: boolean;
}

const ROUND_INTERVAL_MS = 550;

export default function ZonePentiliPage() {
  useRequireAuth();
  const t = useTranslations();
  const params = useParams<{ zoneId: string }>();
  const zoneId = params.zoneId;

  const [pentili, setPentili] = useState<PentiliDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getPentiliInZone(zoneId)
      .then(setPentili)
      .catch(() => setError(t('pve.loadError')));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId]);

  async function handleAttack(target: PentiliDto) {
    setError(null);
    try {
      const report = await attackPentili(target.id);

      setBattle({
        target,
        report,
        round: 0,
        playerHp: report.playerMaxHp,
        pentiliHp: report.pentiliMaxHp,
        log: [{ text: t('pve.encounterStart', { name: t(target.nameKey) }), kind: 'system' }],
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
            { text: t('pve.roundHit', { name: t('pve.you'), damage: roundData.playerDamage }), kind: 'player' },
          ];
          if (roundData.pentiliDamage > 0) {
            log.push({ text: t('pve.roundHit', { name: t(target.nameKey), damage: roundData.pentiliDamage }), kind: 'enemy' });
          }
          const finished = index >= report.rounds.length;
          if (finished) {
            log.push({
              text: report.outcome === 'WIN' ? t('pve.victoryLog') : t('pve.defeatLog'),
              kind: report.outcome === 'WIN' ? 'player' : 'enemy',
            });
          }
          return {
            ...previous,
            round: roundData.round,
            playerHp: roundData.playerHpAfter,
            pentiliHp: roundData.pentiliHpAfter,
            log,
            finished,
          };
        });
      }, ROUND_INTERVAL_MS);
    } catch {
      setError(t('pve.attackError'));
    }
  }

  return (
    <GameLayout>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">{t('pve.title')}</h1>
        <p className="text-xs text-textMuted">{t('pve.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-center text-red-400">{error}</p>}

      {battle && (
        <>
          {battle.finished && (
            <div className="mb-6 rounded-lg border border-panelBorder bg-panel p-5 text-center">
              <div className="mb-1 text-xl font-semibold">
                {battle.report.outcome === 'WIN' ? t('pve.victory') : t('pve.defeat')}
              </div>
              {battle.report.outcome === 'WIN' && (
                <p className="text-xs text-textMuted">
                  {t('pve.xpGained')}: {battle.report.xpGained}
                  {battle.report.leveledUp && ` · ${t('pve.leveledUp', { level: battle.report.playerLevel })}`}
                </p>
              )}
            </div>
          )}

          <section className="mb-6 grid grid-cols-1 items-center gap-5 md:grid-cols-[1fr_120px_1fr]">
            <FighterPanel name={t('pve.you')} hp={battle.playerHp} maxHp={battle.report.playerMaxHp} variant="player" />

            <div className="text-center">
              <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border border-accent bg-panelHeader text-lg font-bold text-textMuted">
                {t('pve.vs')}
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-widest text-textFaint">
                {t('pve.round')} {battle.round}
              </div>
            </div>

            <FighterPanel
              name={t(battle.target.nameKey)}
              hp={battle.pentiliHp}
              maxHp={battle.report.pentiliMaxHp}
              variant="enemy"
            />
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
              <h2 className="mb-3 text-sm font-semibold">{t('pve.rewards')}</h2>
              {battle.finished && battle.report.outcome === 'WIN' && battle.report.lootSummary.length > 0 ? (
                <ul className="text-xs text-textMuted">
                  {battle.report.lootSummary.map((loot, index) => (
                    <li key={index}>
                      {loot.type === 'resource' ? t(`resource.${loot.resourceType}`) : t(loot.itemNameKey!)} x{loot.quantity}
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

      {pentili && (
        <ul className="flex flex-col gap-3">
          {pentili.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between rounded-lg border border-panelBorder bg-panel p-4">
              <div>
                <p className="font-medium">
                  {t(entry.nameKey)} (Lv. {entry.level})
                </p>
                <p className="text-xs text-textMuted">HP {entry.maxHp} · ATK {entry.attack} · DEF {entry.defense}</p>
              </div>
              <button
                type="button"
                onClick={() => handleAttack(entry)}
                className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase hover:bg-accentBgHover"
              >
                {t('pve.attack')}
              </button>
            </li>
          ))}
        </ul>
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
