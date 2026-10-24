'use client';

import type { BaseResponseDto, BossFormationSlotDto, BossFormationsResponseDto, ClanWarStateDto, CoreStateDto, ExpeditionsResponseDto, MyClanResponseDto, PvpStatusDto, ResearchResponseDto, RobotSlotDto, ZoneDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { EnableNotificationsCard } from '@/components/EnableNotificationsCard';
import { VerifyEmailCard } from '@/components/VerifyEmailCard';
import { ProgressTiles } from '@/components/ProgressTiles';
import { GameLayout } from '@/components/GameLayout';
import { Link } from '@/i18n/navigation';
import { getBase, getBossFormations, getClanWarStatus, getCoreState, getExpeditions, getMyClan, getPvpStatus, getResearches, getRobot, getZones } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { timerPercent } from '@/lib/timer-progress';
import { useRefresh } from '@/lib/use-refresh';
import { useRequireAuth } from '@/lib/use-require-auth';
import { FormationSlots } from '@/components/FormationSlots';

interface NavCard {
  key: string;
  navKey: string;
  subtitle: string;
  href: string;
}

interface OperationRow {
  key: string;
  label: string;
  secondsLeft: number | null; // null = ready/complete, show a claim/complete state instead of a countdown
  href: string;
  readyLabel?: string;
  // 0-100 for a progress bar (2026-10-14); absent for countdowns without a start.
  percent?: number | null;
  // Research is green, like on the Base; everything else uses the accent colour.
  barClass?: string;
  // An open boss formation's slots, shown under the bar (owner decision, 2026-10-21).
  formationSlots?: BossFormationSlotDto[];
}

export default function DashboardPage() {
  useRequireAuth();
  const t = useTranslations();
  const [base, setBase] = useState<BaseResponseDto | null>(null);
  const [robot, setRobot] = useState<RobotSlotDto[] | null>(null);
  const [zones, setZones] = useState<ZoneDto[] | null>(null);
  const [research, setResearch] = useState<ResearchResponseDto | null>(null);
  const [expeditions, setExpeditions] = useState<ExpeditionsResponseDto | null>(null);
  const [bossFormations, setBossFormations] = useState<BossFormationsResponseDto | null>(null);
  const [myClan, setMyClan] = useState<MyClanResponseDto | null>(null);
  const [pvpStatus, setPvpStatus] = useState<PvpStatusDto | null>(null);
  const [clanWar, setClanWar] = useState<ClanWarStateDto | null>(null);
  const [core, setCore] = useState<CoreStateDto | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The player's own state — changes only by their actions or known timers.
  function loadOwn() {
    getBase().then(setBase).catch(() => undefined);
    getRobot().then(setRobot).catch(() => undefined);
    getZones().then(setZones).catch(() => undefined);
    getResearches().then(setResearch).catch(() => undefined);
    getExpeditions().then(setExpeditions).catch(() => undefined);
    getMyClan().then(setMyClan).catch(() => undefined);
  }

  // What other players can change: PvP status, clan war, the Core, boss formations.
  function loadLive() {
    getBossFormations().then(setBossFormations).catch(() => undefined);
    getPvpStatus().then(setPvpStatus).catch(() => undefined);
    getCoreState().then(setCore).catch(() => undefined);
    getClanWarStatus()
      .then((res) => setClanWar(res.war))
      .catch(() => undefined);
  }

  // Owner decision (2026-10-13): no 5 s polling — own data refreshes when a
  // timer ends, live data every 60 s, and nothing while the tab is hidden.
  useRefresh(loadOwn, {
    refreshAt: [
      ...(base?.buildings.map((b) => b.constructionEndsAt) ?? []),
      ...(research?.researches.map((r) => r.researchEndsAt) ?? []),
      expeditions?.active?.endsAt,
    ],
  });
  useRefresh(loadLive, { intervalMs: 60_000, refreshAt: [core?.opensAt, core?.endsAt, core?.tavern?.activeUntil, clanWar?.endsAt] });

  useEffect(() => {
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  const equippedCount = robot?.filter((slot) => slot.item !== null).length ?? 0;
  const unlockedZoneCount = zones?.filter((zone) => zone.unlocked).length ?? 0;
  const researchedCount = research?.researches.filter((r) => r.level > 0).length ?? 0;

  // Ordered by engagement type rather than onboarding order — same as
  // NAV_ITEMS (Sidebar/BottomNav), minus Command Center itself. Research stays
  // here although it left the menu (owner decision, 2026-10-14).
  const cards: NavCard[] = [
    {
      key: 'robot',
      navKey: 'nav.robot',
      href: '/robot',
      subtitle: `${equippedCount}/7 ${t('dashboard.slotsEquipped')}`,
    },
    {
      key: 'clans',
      navKey: 'nav.clans',
      href: '/clans',
      subtitle: myClan ? (myClan.clan ? `${myClan.clan.name} [${myClan.clan.tag}]` : t('dashboard.noClan')) : '…',
    },
    {
      key: 'friends',
      navKey: 'nav.friends',
      href: '/friends',
      subtitle: t('dashboard.friendsSubtitle'),
    },
    {
      key: 'zones',
      navKey: 'nav.zones',
      href: '/zones',
      subtitle: zones ? `${unlockedZoneCount}/${zones.length} ${t('dashboard.zonesUnlocked')}` : '…',
    },
    {
      key: 'pvp',
      navKey: 'nav.pvp',
      href: '/pvp',
      subtitle: pvpStatus ? (pvpStatus.unlocked ? t('dashboard.pvpUnlocked') : t('dashboard.pvpLocked', { level: pvpStatus.minLevel })) : '…',
    },
    {
      key: 'expeditions',
      navKey: 'nav.expeditions',
      href: '/expeditions',
      subtitle: expeditions?.active ? t('dashboard.expeditionsActive') : t('dashboard.expeditionsIdle'),
    },
    {
      key: 'base',
      navKey: 'nav.base',
      href: '/base',
      subtitle: base ? `${base.buildings.filter((b) => b.level > 0).length}/${base.buildings.length} ${t('dashboard.buildingsBuilt')}` : '…',
    },
    {
      key: 'research',
      navKey: 'nav.research',
      href: '/research',
      subtitle: research ? `${researchedCount}/${research.researches.length} ${t('dashboard.researchLeveled')}` : '…',
    },
    {
      key: 'players',
      navKey: 'nav.leaderboard',
      href: '/players',
      subtitle: t('dashboard.playersSubtitle'),
    },
    {
      key: 'reports',
      navKey: 'nav.reports',
      href: '/reports',
      subtitle: t('dashboard.reportsSubtitle'),
    },
    {
      key: 'market',
      navKey: 'nav.market',
      href: '/market',
      subtitle: t('dashboard.marketSubtitle'),
    },
  ];

  const operations: OperationRow[] = [];

  // Seasons and the Core (owner decision, 2026-10-12): the Core's countdown
  // and the clan Tavern's state are shown to every player here.
  if (core?.status === 'SCHEDULED' && core.opensAt) {
    operations.push({
      key: 'core',
      label: t('dashboard.coreOpensIn'),
      secondsLeft: Math.max(0, Math.ceil((new Date(core.opensAt).getTime() - now) / 1000)),
      href: '/core',
    });
  } else if (core?.status === 'ENDED' && core.resetAt) {
    operations.push({
      key: 'season-reset',
      label: t('dashboard.seasonResetIn'),
      secondsLeft: Math.max(0, Math.ceil((new Date(core.resetAt).getTime() - now) / 1000)),
      href: '/core',
    });
  } else if (core?.status === 'OPEN' && core.endsAt) {
    operations.push({
      key: 'core',
      label: t('dashboard.coreOpenEndsIn'),
      secondsLeft: Math.max(0, Math.ceil((new Date(core.endsAt).getTime() - now) / 1000)),
      href: '/core',
      percent: timerPercent(core.opensAt, core.endsAt, now),
    });
  }
  // Only an ACTIVE Tavern is shown (with its countdown) — an inactive one is
  // deliberately silent here, to keep the Command Center free of noise (owner decision).
  if (core?.tavern?.active && core.tavern.activeUntil) {
    operations.push({
      key: 'tavern',
      label: t('dashboard.tavernActive', { percent: core.tavern.bonusPercent }),
      secondsLeft: Math.max(0, Math.ceil((new Date(core.tavern.activeUntil).getTime() - now) / 1000)),
      href: '/clans',
      percent: timerPercent(core.tavern.activeSince, core.tavern.activeUntil, now),
    });
  }

  if (clanWar) {
    const secondsLeft = Math.ceil((new Date(clanWar.endsAt).getTime() - now) / 1000);
    operations.push({
      key: 'clan-war',
      label: t('dashboard.atWarWith', { clan: `[${clanWar.enemyClanTag}] ${clanWar.enemyClanName}` }),
      secondsLeft: Math.max(0, secondsLeft),
      href: '/clan-war',
      percent: timerPercent(clanWar.startedAt, clanWar.endsAt, now),
    });
  }

  for (const building of base?.buildings ?? []) {
    if (!building.constructionEndsAt) continue;
    const secondsLeft = Math.ceil((new Date(building.constructionEndsAt).getTime() - now) / 1000);
    operations.push({
      key: `building-${building.key}`,
      label: t(building.nameKey),
      secondsLeft: Math.max(0, secondsLeft),
      href: '/base',
      percent: timerPercent(building.constructionStartedAt, building.constructionEndsAt, now, building.nextLevelCost?.constructionSeconds),
    });
  }

  for (const item of research?.researches ?? []) {
    if (!item.researchEndsAt) continue;
    const secondsLeft = Math.ceil((new Date(item.researchEndsAt).getTime() - now) / 1000);
    operations.push({
      key: `research-${item.key}`,
      label: t(item.nameKey),
      secondsLeft: Math.max(0, secondsLeft),
      href: '/research',
      percent: timerPercent(item.researchStartedAt, item.researchEndsAt, now, item.nextLevelCost?.researchSeconds),
      barClass: 'bg-positive',
    });
  }

  if (expeditions?.active) {
    const secondsLeft = Math.ceil((new Date(expeditions.active.endsAt).getTime() - now) / 1000);
    operations.push({
      key: 'expedition',
      label: t(expeditions.active.expeditionNameKey),
      secondsLeft: secondsLeft > 0 ? secondsLeft : null,
      href: '/expeditions',
      percent: timerPercent(expeditions.active.startedAt, expeditions.active.endsAt, now),
      readyLabel: t('expeditions.readyToClaim'),
    });
  }

  const READY_RESULT_WINDOW_MS = 24 * 60 * 60 * 1000;
  for (const boss of bossFormations?.bosses ?? []) {
    for (const formation of boss.formations) {
      const mine = formation.slots.some((s) => s.isCurrentPlayer);
      if (!mine) continue;
      if (formation.status === 'OPEN') {
        const secondsLeft = Math.ceil((new Date(formation.resolvesAt).getTime() - now) / 1000);
        operations.push({
          key: `boss-formation-${formation.id}`,
          label: t(boss.nameKey),
          secondsLeft: Math.max(0, secondsLeft),
          href: `/zones/${boss.zoneId}/boss`,
          percent: timerPercent(formation.createdAt, formation.resolvesAt, now),
          formationSlots: formation.slots,
        });
      } else if (now - new Date(formation.resolvesAt).getTime() < READY_RESULT_WINDOW_MS) {
        operations.push({
          key: `boss-formation-${formation.id}`,
          label: t(boss.nameKey),
          secondsLeft: null,
          // The finished fight's result and loot are in the battle reports.
          href: '/reports',
          readyLabel: t('bosses.resultReady'),
        });
      }
    }
  }

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
        <p className="text-xs text-textMuted">{t('dashboard.subtitle')}</p>
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-[11px] uppercase tracking-wide text-textFaint">{t('dashboard.activeOperations')}</h2>
        {operations.length > 0 ? (
          <div className="flex flex-col gap-2">
            {operations.map((op) => (
              <Link
                key={op.key}
                href={op.href}
                className="block rounded-lg border border-panelBorder bg-panel p-4 hover:border-accent"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-text">
                    {op.label}
                    {op.formationSlots && (
                      <span className="ml-2 tabular-nums text-textMuted">
                        {op.formationSlots.filter((s) => s.playerId).length}/{op.formationSlots.length}
                      </span>
                    )}
                  </span>
                  {op.secondsLeft === null ? (
                    <span className="text-xs font-semibold uppercase text-positive">{op.readyLabel}</span>
                  ) : (
                    <span className="text-xs tabular-nums text-textMuted">{formatDuration(op.secondsLeft)}</span>
                  )}
                </div>
                {/* Progress bar for timers with a known start (owner decision, 2026-10-14). */}
                {op.secondsLeft !== null && op.percent != null && (
                  <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-wellBorder">
                    <div className={`h-full transition-all ${op.barClass ?? 'bg-accent'}`} style={{ width: `${op.percent}%` }} />
                  </div>
                )}
                {op.formationSlots && (
                  <div className="mt-3">
                    <FormationSlots slots={op.formationSlots} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-panelBorder bg-panel p-4 text-xs text-textMuted">{t('dashboard.noActiveOperations')}</p>
        )}
      </div>

      <VerifyEmailCard />

      <EnableNotificationsCard />

      <ProgressTiles />

      <h2 className="mb-3 text-[11px] uppercase tracking-wide text-textFaint">{t('dashboard.quickAccess')}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="group flex flex-col items-center rounded-lg border border-panelBorder bg-panel p-4 text-center transition-all hover:-translate-y-0.5 hover:border-accent sm:p-5"
          >
            <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-wellBorder/50 to-transparent sm:h-24 sm:w-24">
              <AssetIcon
                assetId={`dashboard.${card.key}.icon`}
                alt={t(card.navKey)}
                className="h-16 w-16 object-contain sm:h-20 sm:w-20"
                fallback={<span className="text-2xl font-semibold text-textMuted">{t(card.navKey).charAt(0)}</span>}
              />
            </div>
            <h3 className="text-sm font-semibold">{t(card.navKey)}</h3>
            <p className="mt-1 min-h-[2.5em] text-xs text-textMuted">{card.subtitle}</p>
          </Link>
        ))}
      </div>
    </GameLayout>
  );
}
