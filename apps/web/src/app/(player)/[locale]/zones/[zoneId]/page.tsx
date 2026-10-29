'use client';

import type { BattleReportDto, PentiliDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BattleDivider } from '@/components/BattleDivider';
import { GameLayout } from '@/components/GameLayout';
import { LootEntry } from '@/components/LootEntry';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import {
  ApiError,
  attackPentili,
  attackPentiliMulti,
  getPentiliInZone,
} from '@/lib/api-client';
import { DropEntry } from '@/components/DropEntry';
import { useRouter } from '@/i18n/navigation';
import { notifyProfileChanged } from '@/lib/profile-events';
import { takePendingBattle } from '@/lib/pending-battle';
import { isVipActive, multiAttackCount } from '@/lib/vip';
import { usePlayerEnergy } from '@/lib/use-player-energy';
import { useRequireAuth } from '@/lib/use-require-auth';
import { EnergyRefill } from '@/components/EnergyRefill';
import { formatNumber } from '@/lib/format-number';

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
      {report.lostLoot.map((loot, index) => (
        <LootEntry key={`lost-${index}`} loot={loot} lost />
      ))}
    </span>
  );
}

/** VIP "Attack xN" result: one row per battle (outcome, XP, loot); a row replays that fight. */
function SeriesSummary({ reports, shown, onShow }: { reports: BattleReportDto[]; shown: string; onShow: (report: BattleReportDto) => void }) {
  const t = useTranslations();
  const wins = reports.filter((r) => r.outcome === 'WIN').length;
  const stoppedEarly = reports[reports.length - 1].outcome !== 'WIN';
  return (
    <section className="mb-4 rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-2 text-sm font-semibold">{t('pve.seriesTitle', { count: reports.length, wins })}</h2>
      <ul className="flex flex-col gap-1.5">
        {reports.map((report, index) => (
          <li key={report.id}>
            <button
              type="button"
              onClick={() => onShow(report)}
              className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 text-left text-[11px] ${report.id === shown ? 'border-accent bg-accentBg' : 'border-wellBorder bg-well hover:bg-accentBgHover'}`}
            >
              <span className="text-textMuted">{t('pve.seriesBattle', { number: index + 1 })}</span>
              <span className={report.outcome === 'WIN' ? 'text-positive' : 'text-danger'}>{report.outcome === 'WIN' ? t('pve.seriesWin') : t('pve.seriesLoss')}</span>
              {report.outcome === 'WIN' && <RewardSummary report={report} />}
            </button>
          </li>
        ))}
      </ul>
      {stoppedEarly && <p className="mt-2 text-[11px] text-textFaint">{t('pve.seriesStopped')}</p>}
    </section>
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

// useSearchParams() requires a Suspense boundary (Next.js App Router) — this
// wrapper is just that; all the real logic stays in ZonePentiliPageInner.
export default function ZonePentiliPage() {
  return (
    <Suspense fallback={null}>
      <ZonePentiliPageInner />
    </Suspense>
  );
}

function ZonePentiliPageInner() {
  useRequireAuth();
  const t = useTranslations();
  const params = useParams<{ zoneId: string }>();
  const zoneId = params.zoneId;
  const searchParams = useSearchParams();
  const targetPentiliId = searchParams.get('pentili');
  // The old boss-only view (?boss=1) moved to its own page (owner decision,
  // 2026-10-21): an old link forwards there and shows nothing meanwhile.
  const legacyBossLink = searchParams.get('boss') === '1';
  const router = useRouter();
  useEffect(() => {
    if (legacyBossLink) router.replace(`/zones/${zoneId}/boss`);
    // The land's full Pentili list was removed (owner decision, 2026-10-27) —
    // the map's panel has it; this page only shows a fight.
    else if (!targetPentiliId) router.replace(`/zones?zone=${zoneId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyBossLink, targetPentiliId, zoneId]);

  const [pentili, setPentili] = useState<PentiliDto[] | null>(null);
  const { profile, refreshProfile } = usePlayerEnergy();
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [attacking, setAttacking] = useState(false);
  // VIP "Attack xN" series (owner decision, 2026-10-13) — null for a single attack.
  const [series, setSeries] = useState<BattleReportDto[] | null>(null);
  const multiCount = multiAttackCount(profile);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const myName = profile?.username ?? t('pve.you');
  // Guards the deep-link auto-attack so it fires exactly once per page load,
  // never again on a later re-render once `pentili`/`profile` settle.
  const autoAttackedRef = useRef(false);

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

  // Deep-link from the planet page's "Атакувай" button (owner decision,
  // 2026-10-11): that button already fires the attack itself, before
  // navigating here, and hands the result over via sessionStorage — so this
  // just displays it immediately instead of re-requesting it (the earlier
  // version called the API again here, which meant the player sat through
  // "page loads, then the attack loads" as two separate waits). If there's
  // no pending result (direct URL visit, refresh, back-navigation), this is
  // a no-op — the player just sees the normal Attack button below.
  useEffect(() => {
    if (!targetPentiliId || autoAttackedRef.current || !pentili) return;
    const target = pentili.find((entry) => entry.id === targetPentiliId);
    if (!target) return;
    const pendingReports = takePendingBattle(targetPentiliId);
    if (!pendingReports) return;
    autoAttackedRef.current = true;
    showReports(target, pendingReports);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pentili, targetPentiliId]);

  /** Builds battle state from an already-fetched report and starts the round-reveal interval — shared by a fresh handleAttack() call and the pre-fetched deep-link result below, so neither path duplicates the reveal logic. */
  function startBattleFromReport(target: PentiliDto, report: BattleReportDto) {
    if (timerRef.current) clearInterval(timerRef.current);

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
  }

  /** A single attack replays its fight; a series also lists every battle, replaying the last one. */
  function showReports(target: PentiliDto, reports: BattleReportDto[]) {
    setSeries(reports.length > 1 ? reports : null);
    startBattleFromReport(target, reports[reports.length - 1]);
  }

  async function handleAttack(target: PentiliDto, multi = false) {
    if (attacking || (battle && !battle.finished)) return;
    if ((profile?.energy.current ?? 0) < (multi ? 2 : 1)) {
      setError(t('pve.notEnoughEnergy'));
      return;
    }
    setError(null);
    setAttacking(true);
    try {
      const reports = multi ? (await attackPentiliMulti(target.id)).reports : [await attackPentili(target.id)];
      notifyProfileChanged();
      await refreshProfile();
      showReports(target, reports);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EXPEDITION_IN_PROGRESS') {
        setError(t('pve.expeditionInProgress'));
      } else if (err instanceof ApiError && err.status === 400) {
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
      </div>

      {error && <p className="mb-4 text-center text-red-400">{error}</p>}

      {battle && !legacyBossLink && (
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

          {series && <SeriesSummary reports={series} shown={battle.report.id} onShow={(report) => startBattleFromReport(battle.target, report)} />}

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

      {pentili && !legacyBossLink && targetPentiliId && (
        <ul className="flex flex-col gap-3">
          {pentili
            .filter((entry) => entry.id === targetPentiliId)
            .map((entry) => (
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
                    <p className="text-xs text-textMuted">
                      {t('pve.statsLine', { hp: formatNumber(entry.maxHp), attack: formatNumber(entry.attack), defense: formatNumber(entry.defense) })}
                    </p>
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
                <div className="flex flex-col items-end">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAttack(entry)}
                    aria-disabled={attacking || (battle !== null && !battle.finished) || (profile?.energy.current ?? 0) < 1}
                    className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase hover:bg-accentBgHover aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-accentBg"
                  >
                    {t('pve.attack')}
                  </button>
                  {isVipActive(profile) && (
                    <button
                      type="button"
                      onClick={() => multiCount >= 2 && handleAttack(entry, true)}
                      aria-disabled={attacking || (battle !== null && !battle.finished) || multiCount < 2}
                      className="rounded-md border border-vipGold bg-accentBg px-4 py-2 text-xs uppercase text-vipGold hover:bg-accentBgHover aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-accentBg"
                    >
                      {t('pve.attackMulti', { count: multiCount >= 2 ? multiCount : (profile?.vipMultiAttackCount ?? 3) })}
                    </button>
                  )}
                </div>
                {/* Out of energy: use a pack right under the attack buttons (owner decision, 2026-10-14). */}
                <EnergyRefill profile={profile} onRefilled={refreshProfile} />
                </div>
              </li>
            ))}
        </ul>
      )}

      {/* Full roster — 5 per row (2 rows for the current 10-per-zone roster), compact
          vertical cards instead of the wide single-focus row above. */}
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
        {/* The enemy here is always a Pentili (creature) — "Живот"/Health — while the player side is the robot's "Здравина"/Durability. */}
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
