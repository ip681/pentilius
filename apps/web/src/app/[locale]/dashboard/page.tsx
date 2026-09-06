'use client';

import type { BaseResponseDto, BossDto, ExpeditionsResponseDto, MyClanResponseDto, PvpStatusDto, ResearchResponseDto, RobotSlotDto, ZoneDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { GameLayout } from '@/components/GameLayout';
import { Link } from '@/i18n/navigation';
import { getBase, getBosses, getExpeditions, getMyClan, getPvpStatus, getResearches, getRobot, getZones } from '@/lib/api-client';
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
  const [bosses, setBosses] = useState<BossDto[] | null>(null);
  const [myClan, setMyClan] = useState<MyClanResponseDto | null>(null);
  const [pvpStatus, setPvpStatus] = useState<PvpStatusDto | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    getBase().then(setBase).catch(() => undefined);
    getRobot().then(setRobot).catch(() => undefined);
    getZones().then(setZones).catch(() => undefined);
    getResearches().then(setResearch).catch(() => undefined);
    getExpeditions().then(setExpeditions).catch(() => undefined);
    getBosses().then(setBosses).catch(() => undefined);
    getMyClan().then(setMyClan).catch(() => undefined);
    getPvpStatus().then(setPvpStatus).catch(() => undefined);
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
  const unlockedBossCount = bosses?.filter((boss) => boss.unlocked).length ?? 0;

  const cards: NavCard[] = [
    {
      key: 'base',
      navKey: 'nav.base',
      href: '/base',
      subtitle: base ? `${base.buildings.filter((b) => b.level > 0).length}/${base.buildings.length} ${t('dashboard.buildingsBuilt')}` : '…',
    },
    {
      key: 'robot',
      navKey: 'nav.robot',
      href: '/robot',
      subtitle: `${equippedCount}/7 ${t('dashboard.slotsEquipped')}`,
    },
    {
      key: 'zones',
      navKey: 'nav.zones',
      href: '/zones',
      subtitle: zones ? `${unlockedZoneCount}/${zones.length} ${t('dashboard.zonesUnlocked')}` : '…',
    },
    {
      key: 'research',
      navKey: 'nav.research',
      href: '/research',
      subtitle: research ? `${researchedCount}/${research.researches.length} ${t('dashboard.researchLeveled')}` : '…',
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
      subtitle: bosses ? `${unlockedBossCount} ${t('dashboard.bossesAvailable')}` : '…',
    },
    {
      key: 'pvp',
      navKey: 'nav.pvp',
      href: '/pvp',
      subtitle: pvpStatus ? (pvpStatus.unlocked ? t('dashboard.pvpUnlocked') : t('dashboard.pvpLocked', { level: pvpStatus.minLevel })) : '…',
    },
    {
      key: 'clans',
      navKey: 'nav.clans',
      href: '/clans',
      subtitle: myClan ? (myClan.clan ? `${myClan.clan.name} [${myClan.clan.tag}]` : t('dashboard.noClan')) : '…',
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
  ];

  const operations: OperationRow[] = [];

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

  for (const boss of bosses ?? []) {
    if (boss.encounter.status !== 'OPEN' || !boss.encounter.participants.some((p) => p.isCurrentPlayer)) continue;
    const secondsLeft = Math.ceil((new Date(boss.encounter.resolvesAt).getTime() - now) / 1000);
    operations.push({ key: `boss-${boss.key}`, label: t(boss.nameKey), secondsLeft: Math.max(0, secondsLeft), href: '/bosses' });
  }

  return (
    <GameLayout>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
          <p className="text-xs text-textMuted">{t('dashboard.subtitle')}</p>
        </div>
        <div className="text-xs uppercase tracking-wide text-positive">● {t('dashboard.status')}</div>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="group flex flex-col gap-3 rounded-lg border border-panelBorder bg-panel p-5 transition-colors hover:border-accent"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-wellBorder bg-well">
                <AssetIcon
                  assetId={`dashboard.${card.key}.icon`}
                  alt={t(card.navKey)}
                  className="h-6 w-6 object-contain"
                  fallback={<span className="text-sm font-semibold text-textMuted">{t(card.navKey).charAt(0)}</span>}
                />
              </div>
              <h3 className="text-sm font-semibold">{t(card.navKey)}</h3>
            </div>
            <p className="min-h-[1.5em] text-xs text-textMuted">{card.subtitle}</p>
            <span className="mt-auto text-xs font-semibold text-accent group-hover:underline">{t('dashboard.open')} →</span>
          </Link>
        ))}
      </div>
    </GameLayout>
  );
}
