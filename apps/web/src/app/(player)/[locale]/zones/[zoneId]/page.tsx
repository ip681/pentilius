'use client';

import type { BattleReportDto, BossDto, PentiliDto, PentiliLootDropDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BattleDivider } from '@/components/BattleDivider';
import { BossFormationCard } from '@/components/BossFormationCard';
import { ConfirmButton } from '@/components/ConfirmButton';
import { GameLayout } from '@/components/GameLayout';
import { LootEntry } from '@/components/LootEntry';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { ResourceIcon } from '@/components/ResourceIcon';
import {
  ApiError,
  attackPentili,
  attackPentiliMulti,
  createBossFormation,
  getBossFormations,
  getMyClan,
  getPentiliInZone,
  joinBossFormation,
  updateBossFormationVisibility,
} from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { notifyProfileChanged } from '@/lib/profile-events';
import { getCachedProfile } from '@/lib/profile-cache';
import { takePendingBattle } from '@/lib/pending-battle';
import { isVipActive, multiAttackCount } from '@/lib/vip';
import { usePlayerEnergy } from '@/lib/use-player-energy';
import { useRefresh } from '@/lib/use-refresh';
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
  // Deep-link from the planet page's boss teaser (owner decision, 2026-10-11) —
  // mirrors the Pentili focus above: show only the boss panel, not the
  // Pentili list too.
  const focusBoss = searchParams.get('boss') === '1';

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

      {battle && !focusBoss && (
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

      {pentili && !focusBoss && targetPentiliId && (
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
                    <p className="text-xs text-textMuted">HP {formatNumber(entry.maxHp)} · ATK {formatNumber(entry.attack)} · DEF {formatNumber(entry.defense)}</p>
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
      {pentili && !focusBoss && !targetPentiliId && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {pentili.map((entry) => (
            <li key={entry.id} className="flex flex-col items-center gap-2 rounded-lg border border-panelBorder bg-panel p-3 text-center">
              <AssetIcon
                assetId={entry.iconAssetId}
                alt={t(entry.nameKey)}
                className="h-14 w-auto object-contain"
                fallback={<span className="flex h-14 w-14 items-center justify-center text-sm font-semibold text-textMuted">{t(entry.nameKey).charAt(0)}</span>}
              />
              <p className="text-xs font-medium">
                {t(entry.nameKey)} (Lv. {entry.level})
              </p>
              <p className="text-[10px] tabular-nums text-textMuted">
                HP {formatNumber(entry.maxHp)} · ATK {formatNumber(entry.attack)} · DEF {formatNumber(entry.defense)}
              </p>
              {entry.lootDrops.length > 0 && (
                <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[9px] text-textFaint">
                  {entry.lootDrops.map((drop, index) => (
                    <DropEntry key={index} drop={drop} />
                  ))}
                </p>
              )}
              <button
                type="button"
                onClick={() => handleAttack(entry)}
                aria-disabled={attacking || (battle !== null && !battle.finished) || (profile?.energy.current ?? 0) < 1}
                className="mt-1 w-full rounded-md border border-accent bg-accentBg py-1.5 text-[10px] uppercase hover:bg-accentBgHover aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-accentBg"
              >
                {t('pve.attack')}
              </button>
              {isVipActive(profile) && (
                <button
                  type="button"
                  onClick={() => multiCount >= 2 && handleAttack(entry, true)}
                  aria-disabled={attacking || (battle !== null && !battle.finished) || multiCount < 2}
                  className="w-full rounded-md border border-vipGold bg-accentBg py-1.5 text-[10px] uppercase text-vipGold hover:bg-accentBgHover aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-accentBg"
                >
                  {t('pve.attackMulti', { count: multiCount >= 2 ? multiCount : (profile?.vipMultiAttackCount ?? 3) })}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pentili && !focusBoss && !targetPentiliId && <EnergyRefill profile={profile} onRefilled={refreshProfile} />}

      {!targetPentiliId && <ZoneBossPanel zoneId={zoneId} />}
    </GameLayout>
  );
}

/**
 * This zone's own boss, embedded under its Pentili list (owner decision,
 * 2026-10-11) — an additive alternative entry point, not a replacement for
 * the standalone /bosses page (which still shows all 4 at once). Deliberately
 * self-contained (own fetch/poll/countdown) so it doesn't tangle with the
 * PvE combat state above it.
 *
 * Only OPEN formations are shown here (not resolved ones) — the owner was
 * explicit that this compact panel must never accumulate old/resolved
 * formations as a growing "history" list; the full /bosses page is still the
 * place to review a finished fight's result. Visually set apart from the
 * plain Pentili rows via a gold-bordered section + boss art, so it doesn't
 * read as just another monster in the list.
 */
function ZoneBossPanel({ zoneId }: { zoneId: string }) {
  const t = useTranslations();
  const [data, setData] = useState<{ bosses: BossDto[]; nextActionAvailableAt: string | null } | null>(null);
  const [inClan, setInClan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [visibility, setVisibility] = useState({ visibleToClanOnly: false, visibleToFriendsOnly: false });

  const myRace = getCachedProfile()?.race ?? null;

  async function load() {
    try {
      const [formations, myClan] = await Promise.all([getBossFormations(), getMyClan()]);
      setData(formations);
      setInClan(myClan.clan !== null);
    } catch {
      setError(t('bosses.loadError'));
    }
  }

  // Other players fill formations — live, but only while the tab is visible.
  useRefresh(load, { intervalMs: 10_000 });

  const boss = data?.bosses.find((b) => b.zoneId === zoneId) ?? null;
  const openFormations = boss?.formations.filter((f) => f.status === 'OPEN') ?? [];

  const hasCountdown = Boolean(data?.nextActionAvailableAt) || openFormations.length > 0;
  useEffect(() => {
    if (!hasCountdown) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasCountdown]);

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError && err.code) {
      const map: Record<string, string> = {
        LEVEL_TOO_LOW: t('bosses.errorLevelTooLow', { level: boss?.minLevel ?? 0 }),
        NOT_IN_CLAN: t('bosses.errorNotInClan'),
        BOSS_FORMATION_COOLDOWN_ACTIVE: t('bosses.errorCooldownActive'),
        EXPEDITION_IN_PROGRESS: t('bosses.expeditionInProgress'),
        SLOT_ALREADY_FILLED: t('bosses.errorSlotFilled'),
        FORMATION_ALREADY_RESOLVED: t('bosses.errorAlreadyResolved'),
        VISIBILITY_EDIT_WINDOW_CLOSED: t('bosses.errorVisibilityLocked'),
      };
      if (map[err.code]) return map[err.code];
    }
    return t('bosses.actionError');
  }

  async function handleCreate() {
    if (!boss) return;
    setError(null);
    try {
      await createBossFormation(boss.key, visibility);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleJoin(formationId: string) {
    setError(null);
    try {
      await joinBossFormation(formationId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleVisibilityToggle(formationId: string, next: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean }) {
    setError(null);
    try {
      await updateBossFormationVisibility(formationId, next);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!boss) return null;

  const cooldownRemainingMs = data?.nextActionAvailableAt ? new Date(data.nextActionAvailableAt).getTime() - now : 0;
  const onCooldown = cooldownRemainingMs > 0;

  return (
    <section className="mt-8 overflow-hidden rounded-lg border border-gold/50 bg-panel">
      <div className="flex items-center justify-between border-b border-gold/50 bg-panelHeader px-4 py-3">
        <span className="text-sm font-semibold uppercase text-gold">
          {t('bosses.title')}: {t(boss.nameKey)}
        </span>
        {onCooldown && (
          <span className="text-[10px] tabular-nums text-gold">
            {t('bosses.cooldownActive')} {formatDuration(cooldownRemainingMs / 1000)}
          </span>
        )}
      </div>

      <div className="p-5">
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        {!boss.unlocked && <p className="mb-3 text-xs text-textMuted">{t('bosses.locked', { level: boss.minLevel })}</p>}

        {/* Visible but inactive below the required level — shown greyed out/desaturated
            and non-interactive rather than hidden, same treatment as a locked zone wedge. */}
        <div className={boss.unlocked ? undefined : 'pointer-events-none opacity-40 grayscale'}>
          <div className="mb-4 flex items-center gap-5">
            <AssetIcon
              assetId={boss.iconAssetId}
              alt={t(boss.nameKey)}
              className="h-28 w-28 shrink-0 object-contain"
              fallback={<span className="flex h-28 w-28 shrink-0 items-center justify-center text-lg font-semibold text-textMuted">{t(boss.nameKey).charAt(0)}</span>}
            />
            <div className="flex flex-col gap-1">
              <div className="flex flex-col gap-1 text-xs text-textMuted">
                <span>HP {formatNumber(boss.maxHp)}</span>
                <span>
                  {t('bosses.attack')} {formatNumber(boss.attack)}
                </span>
                <span>
                  {t('bosses.defense')} {formatNumber(boss.defense)}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-textFaint">
                <span>{t('pve.drops')}:</span>
                <span className="inline-flex items-center gap-1">
                  {t('pve.xpGained')} +{formatNumber(boss.xpReward)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <AssetIcon
                    assetId={boss.guaranteedBoxIconAssetId}
                    alt={t(boss.guaranteedBoxNameKey)}
                    className="h-3.5 w-3.5 object-contain"
                    fallback={<span className="text-[8px] font-semibold text-textMuted">{t(boss.guaranteedBoxNameKey).charAt(0)}</span>}
                  />
                  {t(boss.guaranteedBoxNameKey)} ({t('bosses.guaranteed')})
                </span>
                {boss.lootDrops.map((drop, index) => (
                  <DropEntry key={index} drop={drop} />
                ))}
              </p>
            </div>
          </div>

          <div className="mb-5 rounded border border-wellBorder bg-well p-3">
            <p className="mb-2 text-xs font-semibold">{t('bosses.createFormation')}</p>
            <div className="mb-3 flex flex-col gap-1.5">
              <label className={`flex items-center gap-2 text-xs ${inClan ? 'text-textMuted' : 'cursor-not-allowed text-textFaint opacity-50'}`}>
                <input
                  type="checkbox"
                  checked={visibility.visibleToClanOnly}
                  disabled={!inClan}
                  onChange={(e) => setVisibility({ ...visibility, visibleToClanOnly: e.target.checked })}
                  className="accent-accent"
                />
                {t('market.clanOnly')}
              </label>
              <label className="flex items-center gap-2 text-xs text-textMuted">
                <input
                  type="checkbox"
                  checked={visibility.visibleToFriendsOnly}
                  onChange={(e) => setVisibility({ ...visibility, visibleToFriendsOnly: e.target.checked })}
                  className="accent-accent"
                />
                {t('market.friendsOnly')}
              </label>
            </div>
            <ConfirmButton
              label={t('bosses.createFormation')}
              confirmLabel={t('common.confirm')}
              cancelLabel={t('common.cancel')}
              message={t('bosses.createConfirm')}
              onConfirm={handleCreate}
              disabled={onCooldown || !boss.unlocked}
              className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase text-text hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
              confirmClassName="flex-1 rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase text-text hover:bg-accentBgHover"
              cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel px-4 py-2 text-xs uppercase text-textMuted hover:bg-accentBgHover"
            />
          </div>

          {openFormations.length === 0 ? (
            <p className="text-xs text-textFaint">{t('bosses.noFormations')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {openFormations.map((formation) => (
                <BossFormationCard
                  key={formation.id}
                  formation={formation}
                  now={now}
                  myRace={myRace}
                  onCooldown={onCooldown}
                  onJoin={() => handleJoin(formation.id)}
                  onVisibilityToggle={(next) => handleVisibilityToggle(formation.id, next)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
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
