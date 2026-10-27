'use client';

import type { BossFormationDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AssetIcon } from './AssetIcon';
import { BattleDivider } from './BattleDivider';
import { FormationSlots } from './FormationSlots';
import { LootEntry } from './LootEntry';
import { formatDateTime } from '@/lib/format-datetime';
import { formatNumber } from '@/lib/format-number';

const ROUND_INTERVAL_MS = 550;

type LogLine = { text: ReactNode; kind: 'player' | 'enemy' | 'system' };

/**
 * A finished boss fight (owner decision, 2026-10-23): a summary row — when,
 * win or loss, and how much of the boss's life the formation took — and a
 * round-by-round replay laid out like a Pentili battle, the formation on the
 * left with one shared life bar, the boss on the right.
 */
export function BossBattleReport({
  formation,
  boss,
  autoPlay = false,
}: {
  formation: BossFormationDto;
  boss: { nameKey: string; iconAssetId: string };
  autoPlay?: boolean;
}) {
  const t = useTranslations();
  const result = formation.result;
  const [playing, setPlaying] = useState(false);
  const [round, setRound] = useState(0);
  const [partyHp, setPartyHp] = useState(0);
  const [bossHp, setBossHp] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const [finished, setFinished] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const formationName = t('bosses.formationLabel');
  const bossName = t(boss.nameKey);
  const mine = formation.slots.find((s) => s.isCurrentPlayer);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  useEffect(() => {
    if (autoPlay && result) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, formation.id]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  if (!result || !result.outcome) return null;
  const won = result.outcome === 'WIN';
  const finalBossHp = result.rounds.length > 0 ? result.rounds[result.rounds.length - 1].pentiliHpAfter : result.bossMaxHp;
  const takenPercent = result.bossMaxHp > 0 ? Math.round(((result.bossMaxHp - Math.max(0, finalBossHp)) / result.bossMaxHp) * 100) : 0;

  function endLine(): LogLine {
    return {
      text: won ? t('pve.victoryLog') : t('pve.defeatLog'),
      kind: won ? 'player' : 'enemy',
    };
  }

  function roundLines(index: number): LogLine[] {
    const r = result!.rounds[index];
    const lines: LogLine[] = [];
    if (r.pentiliDodged) lines.push({ text: t('pve.roundDodge', { name: bossName }), kind: 'enemy' });
    else {
      lines.push({ text: t('pve.roundHit', { name: formationName, damage: formatNumber(r.playerDamage) }), kind: 'player' });
      if (r.playerCritical) lines.push({ text: t('pve.roundCritical', { name: formationName }), kind: 'player' });
    }
    if (r.playerDodged) lines.push({ text: t('pve.roundDodge', { name: formationName }), kind: 'player' });
    else if (r.pentiliDamage > 0) {
      lines.push({ text: t('pve.roundHit', { name: bossName, damage: formatNumber(r.pentiliDamage) }), kind: 'enemy' });
      if (r.pentiliCritical) lines.push({ text: t('pve.roundCritical', { name: bossName }), kind: 'enemy' });
    }
    return lines;
  }

  function start() {
    if (!result) return;
    if (timer.current) clearInterval(timer.current);
    setPlaying(true);
    setFinished(false);
    setRound(0);
    setPartyHp(result.partyMaxHp);
    setBossHp(result.bossMaxHp);
    setLog([{ text: t('pve.encounterStart', { name: bossName }), kind: 'system' }]);
    let index = 0;
    timer.current = setInterval(() => {
      if (index >= result.rounds.length) {
        if (timer.current) clearInterval(timer.current);
        setLog((l) => [...l, endLine()]);
        setFinished(true);
        return;
      }
      const r = result.rounds[index];
      const lines = roundLines(index);
      index += 1;
      setRound(r.round);
      setPartyHp(r.playerHpAfter);
      setBossHp(r.pentiliHpAfter);
      setLog((l) => [...l, ...lines]);
    }, ROUND_INTERVAL_MS);
  }

  function skip() {
    if (!result) return;
    if (timer.current) clearInterval(timer.current);
    const last = result.rounds[result.rounds.length - 1];
    setRound(last?.round ?? 0);
    setPartyHp(last?.playerHpAfter ?? result.partyMaxHp);
    setBossHp(last?.pentiliHpAfter ?? result.bossMaxHp);
    setLog([
      { text: t('pve.encounterStart', { name: bossName }), kind: 'system' },
      ...result.rounds.flatMap((_, i) => roundLines(i)),
      endLine(),
    ]);
    setFinished(true);
  }

  const bar = (hp: number, max: number, tone: string) => (
    <div className="h-[7px] overflow-hidden rounded-full bg-wellBorder sm:h-[9px]">
      <div className={`h-full transition-all duration-500 ${tone}`} style={{ width: `${max > 0 ? Math.max(0, (hp / max) * 100) : 0}%` }} />
    </div>
  );

  return (
    <div className="rounded-md border border-wellBorder bg-well p-3">
      {/* Summary: when, win or loss, how much of the boss's life went. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-textMuted">{formatDateTime(formation.resolvesAt)}</span>
        <span className={`font-semibold uppercase ${won ? 'text-positive' : 'text-danger'}`}>{won ? t('reports.win') : t('reports.loss')}</span>
      </div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span>{won ? t('bosses.bossDown') : t('bosses.lifeTaken', { percent: takenPercent })}</span>
        <span className="tabular-nums text-textMuted">
          {formatNumber(Math.max(0, finalBossHp))} / {formatNumber(result.bossMaxHp)}
        </span>
      </div>
      {bar(Math.max(0, finalBossHp), result.bossMaxHp, 'bg-danger')}

      {won && mine && (mine.xpGained !== null || (mine.lootSummary?.length ?? 0) > 0 || mine.lostLoot.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-textMuted">
          {mine.xpGained !== null && (
            <span>
              +{formatNumber(mine.xpGained)} {t('pve.xpGained')}
            </span>
          )}
          {mine.lootSummary?.map((loot, i) => <LootEntry key={i} loot={loot} />)}
          {mine.lostLoot.map((loot, i) => (
            <LootEntry key={`lost-${i}`} loot={loot} lost />
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {!playing || finished ? (
          <button type="button" onClick={start} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-[11px] uppercase hover:bg-accentBgHover">
            {playing ? t('bosses.watchAgain') : t('bosses.watchBattle')}
          </button>
        ) : (
          <button type="button" onClick={skip} className="rounded-md border border-panelBorder px-3 py-1.5 text-[11px] uppercase text-textMuted hover:bg-accentBgHover">
            {t('bosses.skip')}
          </button>
        )}
      </div>

      {playing && (
        <div className="mt-3">
          {/* Who fought: the same race-colored places as the formation card. */}
          <div className="mb-3">
            <FormationSlots slots={formation.slots} raceBadge />
          </div>
          <section className="mb-3 grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 sm:gap-5">
            {/* The formation: its own picture and one shared life bar (who fought is listed above). */}
            <div className="min-w-0 rounded-lg border border-panelBorder bg-panel p-2 sm:p-4">
              <div className="mb-2 truncate text-[11px] font-semibold sm:text-sm">{formationName}</div>
              <div className="mb-2 flex h-14 items-center justify-center sm:h-[88px]">
                <AssetIcon
                  assetId="bosses.formation.icon"
                  alt={formationName}
                  className="h-full w-auto object-contain"
                  fallback={<span className="text-base font-semibold text-textMuted">{formationName.charAt(0)}</span>}
                />
              </div>
              <div className="mb-1 flex justify-between text-[9px] text-textMuted sm:text-[11px]">
                <span>{t('robot.stat.hp')}</span>
                <span className="tabular-nums">
                  {formatNumber(Math.max(0, Math.round(partyHp)))} / {formatNumber(result.partyMaxHp)}
                </span>
              </div>
              {bar(partyHp, result.partyMaxHp, 'bg-positive')}
            </div>

            <BattleDivider round={round} />

            <div className="min-w-0 rounded-lg border border-panelBorderDanger bg-panel p-2 sm:p-4">
              <div className="mb-2 truncate text-[11px] font-semibold sm:text-sm">{bossName}</div>
              <div className="mb-2 flex h-14 items-center justify-center sm:h-[88px]">
                <AssetIcon
                  assetId={boss.iconAssetId}
                  alt={bossName}
                  className="h-full w-auto object-contain"
                  fallback={<span className="text-base font-semibold text-textMuted">{bossName.charAt(0)}</span>}
                />
              </div>
              <div className="mb-1 flex justify-between text-[9px] text-textMuted sm:text-[11px]">
                <span>{t('pve.hp')}</span>
                <span className="tabular-nums">
                  {formatNumber(Math.max(0, Math.round(bossHp)))} / {formatNumber(result.bossMaxHp)}
                </span>
              </div>
              {bar(bossHp, result.bossMaxHp, 'bg-danger')}
            </div>
          </section>

          <div ref={logRef} className="h-[170px] overflow-y-auto rounded border border-wellBorder bg-ink p-2.5 font-mono text-[11px] leading-relaxed">
            {log.map((line, i) => (
              <div key={i} className={line.kind === 'player' ? 'text-positive' : line.kind === 'enemy' ? 'text-danger' : 'text-textMuted'}>
                {line.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
