'use client';

import type { BattleReportDto, PentiliDto, PentiliLootDropDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BattleDivider } from '@/components/BattleDivider';
import { GameLayout } from '@/components/GameLayout';
import { LootEntry } from '@/components/LootEntry';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { ResourceIcon } from '@/components/ResourceIcon';
import { ApiError, attackPentili, getPentiliInZone } from '@/lib/api-client';
import { notifyProfileChanged } from '@/lib/profile-events';
import { usePlayerEnergy } from '@/lib/use-player-energy';
import { useRequireAuth } from '@/lib/use-require-auth';

interface LogLine {
  text: React.ReactNode;
  kind: 'player' | 'enemy' | 'system';
}

/** The reward summary appended in bold to the final combat-log line on a win — XP, level-up, and any loot (icons for resources, icon+name for items). */
function RewardSummary({ report }: { report: BattleReportDto }) {
  const t = useTranslations();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        {t('pve.xpGained')}: {report.xpGained}
      </span>
      {report.leveledUp && <span>{t('pve.leveledUp', { level: report.playerLevel })}</span>}
      {report.lootSummary.map((loot, index) => (
        <LootEntry key={index} loot={loot} />
      ))}
    </span>
  );
}

/** One Pentili loot-table entry — resource icon + drop chance, or item icon + name + drop chance. */
function DropEntry({ drop }: { drop: PentiliLootDropDto }) {
  const t = useTranslations();
  const quantity = drop.minQuantity === drop.maxQuantity ? `${drop.minQuantity}` : `${drop.minQuantity}-${drop.maxQuantity}`;
  const percent = Math.round(drop.dropChance * 100);

  if (drop.type === 'resource') {
    return (
      <span className="inline-flex items-center gap-1">
        <ResourceIcon type={drop.resourceType!} className="h-3.5 w-3.5" /> ×{quantity} ({percent}%)
      </span>
    );
  }

  const name = t(drop.itemNameKey!);
  return (
    <span className="inline-flex items-center gap-1">
      <AssetIcon
        assetId={drop.itemIconAssetId ?? ''}
        alt={name}
        className="h-3.5 w-3.5 object-contain"
        fallback={<span className="text-[8px] font-semibold text-textMuted">{name.charAt(0)}</span>}
      />
      {name} ×{quantity} ({percent}%)
    </span>
  );
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
  const { profile, refreshProfile } = usePlayerEnergy();
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [attacking, setAttacking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const myName = profile?.username ?? t('pve.you');

  // Keep the combat log scrolled to the newest line as rounds animate in.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [battle?.log]);

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
    if (attacking) return;
    setError(null);
    setAttacking(true);
    try {
      const report = await attackPentili(target.id);
      notifyProfileChanged();
      await refreshProfile();

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
          const log: LogLine[] = [...previous.log];
          if (roundData.pentiliDodged) {
            log.push({ text: t('pve.roundDodge', { name: t(target.nameKey) }), kind: 'enemy' });
          } else {
            log.push({ text: t('pve.roundHit', { name: myName, damage: roundData.playerDamage }), kind: 'player' });
            if (roundData.playerCritical) log.push({ text: t('pve.roundCritical', { name: myName }), kind: 'player' });
            if (roundData.pentiliReflectedDamage > 0) {
              log.push({ text: t('pve.roundReflect', { name: t(target.nameKey), damage: roundData.pentiliReflectedDamage }), kind: 'enemy' });
            }
          }
          if (roundData.playerDodged) {
            log.push({ text: t('pve.roundDodge', { name: myName }), kind: 'player' });
          } else if (roundData.pentiliDamage > 0) {
            log.push({ text: t('pve.roundHit', { name: t(target.nameKey), damage: roundData.pentiliDamage }), kind: 'enemy' });
            if (roundData.pentiliCritical) log.push({ text: t('pve.roundCritical', { name: t(target.nameKey) }), kind: 'enemy' });
            if (roundData.playerReflectedDamage > 0) {
              log.push({ text: t('pve.roundReflect', { name: myName, damage: roundData.playerReflectedDamage }), kind: 'player' });
            }
          }
          const finished = index >= report.rounds.length;
          if (finished) {
            const outcomeText = report.outcome === 'WIN' ? t('pve.victoryLog') : t('pve.defeatLog');
            log.push({
              text:
                report.outcome === 'WIN' ? (
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
            playerHp: roundData.playerHpAfter,
            pentiliHp: roundData.pentiliHpAfter,
            log,
            finished,
          };
        });
      }, ROUND_INTERVAL_MS);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(t('pve.notEnoughEnergy'));
      } else {
        setError(t('pve.attackError'));
      }
      await refreshProfile();
    } finally {
      setAttacking(false);
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
          <section className="mb-6 grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 sm:gap-5">
            <FighterPanel
              name={myName}
              hp={battle.playerHp}
              maxHp={battle.report.playerMaxHp}
              variant="player"
              avatarKey={profile?.selectedAvatarKey}
              frameKey={profile?.selectedFrameKey}
            />

            <BattleDivider round={battle.round} />

            <FighterPanel
              name={t(battle.target.nameKey)}
              hp={battle.pentiliHp}
              maxHp={battle.report.pentiliMaxHp}
              variant="enemy"
              iconAssetId={battle.target.iconAssetId}
            />
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
          </section>
        </>
      )}

      {pentili && (
        <ul className="flex flex-col gap-3">
          {pentili.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-panelBorder bg-panel p-4">
              <div className="flex items-center gap-4">
                <AssetIcon
                  assetId={entry.iconAssetId}
                  alt={t(entry.nameKey)}
                  className="h-16 w-auto shrink-0 object-contain"
                  fallback={
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center text-sm font-semibold text-textMuted">
                      {t(entry.nameKey).charAt(0)}
                    </span>
                  }
                />
                <div>
                  <p className="font-medium">
                    {t(entry.nameKey)} (Lv. {entry.level})
                  </p>
                  <p className="text-xs text-textMuted">HP {entry.maxHp} · ATK {entry.attack} · DEF {entry.defense}</p>
                  {entry.lootDrops.length > 0 && (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-textFaint">
                      <span>{t('pve.drops')}:</span>
                      {entry.lootDrops.map((drop, index) => (
                        <DropEntry key={index} drop={drop} />
                      ))}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAttack(entry)}
                disabled={attacking || (profile?.energy.current ?? 0) < 1}
                title={(profile?.energy.current ?? 0) < 1 ? t('pve.notEnoughEnergy') : undefined}
                className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-accentBg"
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

function FighterPanel({
  name,
  hp,
  maxHp,
  variant,
  iconAssetId,
  avatarKey,
  frameKey,
}: {
  name: string;
  hp: number;
  maxHp: number;
  variant: 'player' | 'enemy';
  // Pentili side: a plain icon. Player side: their chosen avatar/frame (owner
  // decision, 2026-09-09) — takes precedence when given.
  iconAssetId?: string;
  avatarKey?: string;
  frameKey?: string;
}) {
  const t = useTranslations();
  const percent = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
  return (
    <div className={`min-w-0 rounded-lg border p-2 sm:p-5 ${variant === 'enemy' ? 'border-panelBorderDanger' : 'border-panelBorder'} bg-panel`}>
      <div className="mb-2 truncate text-[11px] font-semibold sm:mb-4 sm:text-base">{name}</div>
      <div className="mb-2 flex h-14 items-center justify-center sm:mb-4 sm:h-[100px]">
        {avatarKey || frameKey ? (
          <PlayerAvatarFrame avatarKey={avatarKey ?? null} frameKey={frameKey ?? null} className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-b from-wellBorder/50 to-transparent">
            {iconAssetId ? (
              <AssetIcon
                assetId={iconAssetId}
                alt={name}
                className="h-full w-auto object-contain"
                fallback={<span className="text-base font-semibold text-textMuted sm:text-2xl">{name.charAt(0)}</span>}
              />
            ) : (
              <span className="text-base font-semibold text-textMuted sm:text-2xl">{name.charAt(0)}</span>
            )}
          </div>
        )}
      </div>
      <div className="mb-1 flex justify-between text-[9px] text-textMuted sm:mb-1.5 sm:text-[11px]">
        {/* The enemy here is always a Pentili (creature) — "HP" — while the player side is the robot's "Здравина"/Durability. */}
        <span>{t(variant === 'enemy' ? 'pve.hp' : 'robot.stat.hp')}</span>
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
