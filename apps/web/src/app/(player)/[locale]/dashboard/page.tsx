'use client';

import type { BaseResponseDto, BossFormationsResponseDto, ClanWarStateDto, ExpeditionsResponseDto, MyClanResponseDto, PvpStatusDto, ResearchResponseDto, RobotSlotDto, ZoneDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { GameLayout } from '@/components/GameLayout';
import { Link } from '@/i18n/navigation';
import { getBase, getBossFormations, getClanWarStatus, getExpeditions, getMyClan, getPvpStatus, getResearches, getRobot, getZones } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { useRequireAuth } from '@/lib/use-require-auth';

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
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    getBase().then(setBase).catch(() => undefined);
    getRobot().then(setRobot).catch(() => undefined);
    getZones().then(setZones).catch(() => undefined);
    getResearches().then(setResearch).catch(() => undefined);
    getExpeditions().then(setExpeditions).catch(() => undefined);
    getBossFormations().then(setBossFormations).catch(() => undefined);
    getMyClan().then(setMyClan).catch(() => undefined);
    getPvpStatus().then(setPvpStatus).catch(() => undefined);
    getClanWarStatus()
      .then((res) => setClanWar(res.war))
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    const dataInterval = setInterval(load, 5000);
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(clockInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const equippedCount = robot?.filter((slot) => slot.item !== null).length ?? 0;
  const unlockedZoneCount = zones?.filter((zone) => zone.unlocked).length ?? 0;
  const researchedCount = research?.researches.filter((r) => r.level > 0).length ?? 0;
  const unlockedBossCount = bossFormations?.bosses.filter((boss) => boss.unlocked).length ?? 0;

  // Ordered by engagement type rather than onboarding order — same as
  // NAV_ITEMS (Sidebar/BottomNav), minus Command Center itself.
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
      key: 'bosses',
      navKey: 'nav.bosses',
      href: '/bosses',
      subtitle: bossFormations ? `${unlockedBossCount} ${t('dashboard.bossesAvailable')}` : '…',
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

  if (clanWar) {
    const secondsLeft = Math.ceil((new Date(clanWar.endsAt).getTime() - now) / 1000);
    operations.push({
      key: 'clan-war',
      label: t('dashboard.atWarWith', { clan: `[${clanWar.enemyClanTag}] ${clanWar.enemyClanName}` }),
      secondsLeft: Math.max(0, secondsLeft),
      href: '/clan-war',
    });
  }

  for (const building of base?.buildings ?? []) {
    if (!building.constructionEndsAt) continue;
    const secondsLeft = Math.ceil((new Date(building.constructionEndsAt).getTime() - now) / 1000);
    operations.push({ key: `building-${building.key}`, label: t(building.nameKey), secondsLeft: Math.max(0, secondsLeft), href: '/base' });
  }

  for (const item of research?.researches ?? []) {
    if (!item.researchEndsAt) continue;
    const secondsLeft = Math.ceil((new Date(item.researchEndsAt).getTime() - now) / 1000);
    operations.push({ key: `research-${item.key}`, label: t(item.nameKey), secondsLeft: Math.max(0, secondsLeft), href: '/research' });
  }

  if (expeditions?.active) {
    const secondsLeft = Math.ceil((new Date(expeditions.active.endsAt).getTime() - now) / 1000);
    operations.push({
      key: 'expedition',
      label: t(expeditions.active.expeditionNameKey),
      secondsLeft: secondsLeft > 0 ? secondsLeft : null,
      href: '/expeditions',
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
        operations.push({ key: `boss-formation-${formation.id}`, label: t(boss.nameKey), secondsLeft: Math.max(0, secondsLeft), href: '/bosses' });
      } else if (now - new Date(formation.resolvesAt).getTime() < READY_RESULT_WINDOW_MS) {
        operations.push({
          key: `boss-formation-${formation.id}`,
          label: t(boss.nameKey),
          secondsLeft: null,
          href: '/bosses',
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
                className="flex items-center justify-between rounded-lg border border-panelBorder bg-panel p-4 hover:border-accent"
              >
                <span className="text-xs text-text">{op.label}</span>
                {op.secondsLeft === null ? (
                  <span className="text-xs font-semibold uppercase text-positive">{op.readyLabel}</span>
                ) : (
                  <span className="text-xs tabular-nums text-textMuted">{formatDuration(op.secondsLeft)}</span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-panelBorder bg-panel p-4 text-xs text-textMuted">{t('dashboard.noActiveOperations')}</p>
        )}
      </div>

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
