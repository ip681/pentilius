import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import type {
  AchievementsDto,
  BaseResponseDto,
  BossFormationsResponseDto,
  ClanWarStateDto,
  CoreStateDto,
  DailyTasksDto,
  ExpeditionsResponseDto,
  MyClanResponseDto,
  PvpStatusDto,
  ResearchResponseDto,
  RobotSlotDto,
  ZoneDto,
} from '@pentilius/shared';
import { AchievementsPanel } from '@/components/AchievementsPanel';
import { AssetImage } from '@/components/AssetImage';
import { DailyTasksPanel } from '@/components/DailyTasksPanel';
import { Sheet } from '@/components/ui';
import { ScreenTitle, SectionHeading } from '@/components/ScreenTitle';
import { UpdateBanner } from '@/components/UpdateBanner';
import {
  getAchievements,
  getBase,
  getBossFormations,
  getClanWarStatus,
  getCoreState,
  getDailyTasks,
  getExpeditions,
  getMyClan,
  getPvpStatus,
  getResearches,
  getRobot,
  getZones,
} from '@/lib/api';
import { formatDuration } from '@/lib/duration';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { timerShare } from '@/lib/timer';
import { openWebsite } from '@/lib/web';
import { colors } from '@/theme';

interface OperationRow {
  key: string;
  label: string;
  // null = ready: show readyLabel instead of a countdown.
  secondsLeft: number | null;
  route: string;
  readyLabel?: string;
  share?: number | null;
  barColor?: string;
}

const READY_RESULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The web's Command Center (apps/web/src/app/(player)/[locale]/dashboard/page.tsx), as on a phone. */
export default function CommandCenter() {
  const { refresh: refreshProfile } = useSession();
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
  const [daily, setDaily] = useState<DailyTasksDto | null>(null);
  const [achievements, setAchievements] = useState<AchievementsDto | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [openPanel, setOpenPanel] = useState<'daily' | 'achievements' | null>(null);

  const load = useCallback(async () => {
    await Promise.all([
      getBase().then(setBase),
      getRobot().then(setRobot),
      getZones().then(setZones),
      getResearches().then(setResearch),
      getExpeditions().then(setExpeditions),
      getMyClan().then(setMyClan),
      getBossFormations().then(setBossFormations),
      getPvpStatus().then(setPvpStatus),
      getCoreState().then(setCore),
      getClanWarStatus().then((res) => setClanWar(res.war)),
      getDailyTasks().then(setDaily),
      getAchievements().then(setAchievements),
    ].map((p) => p.catch(() => undefined)));
  }, []);

  useEffect(() => {
    load();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([load(), refreshProfile()]);
    setRefreshing(false);
  }

  const secondsUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
  const operations: OperationRow[] = [];

  if (core?.status === 'SCHEDULED' && core.opensAt) {
    operations.push({ key: 'core', label: t('dashboard.coreOpensIn'), secondsLeft: secondsUntil(core.opensAt), route: 'core' });
  } else if (core?.status === 'ENDED' && core.resetAt) {
    operations.push({ key: 'season-reset', label: t('dashboard.seasonResetIn'), secondsLeft: secondsUntil(core.resetAt), route: 'core' });
  } else if (core?.status === 'OPEN' && core.endsAt) {
    operations.push({ key: 'core', label: t('dashboard.coreOpenEndsIn'), secondsLeft: secondsUntil(core.endsAt), route: 'core', share: core.opensAt ? timerShare(core.opensAt, core.endsAt, now) : null });
  }
  if (core?.tavern?.active && core.tavern.activeUntil) {
    operations.push({
      key: 'tavern',
      label: t('dashboard.tavernActive', { percent: core.tavern.bonusPercent }),
      secondsLeft: secondsUntil(core.tavern.activeUntil),
      route: 'clans',
      share: timerShare(core.tavern.activeSince, core.tavern.activeUntil, now),
    });
  }
  if (clanWar) {
    operations.push({
      key: 'clan-war',
      label: t('dashboard.atWarWith', { clan: `[${clanWar.enemyClanTag}] ${clanWar.enemyClanName}` }),
      secondsLeft: secondsUntil(clanWar.endsAt),
      route: 'clan-war',
      share: timerShare(clanWar.startedAt, clanWar.endsAt, now),
    });
  }
  for (const building of base?.buildings ?? []) {
    if (!building.constructionEndsAt) continue;
    operations.push({
      key: `building-${building.key}`,
      label: t(building.nameKey),
      secondsLeft: secondsUntil(building.constructionEndsAt),
      route: 'base',
      share: timerShare(building.constructionStartedAt, building.constructionEndsAt, now, building.nextLevelCost?.constructionSeconds),
    });
  }
  for (const item of research?.researches ?? []) {
    if (!item.researchEndsAt) continue;
    operations.push({
      key: `research-${item.key}`,
      label: t(item.nameKey),
      secondsLeft: secondsUntil(item.researchEndsAt),
      route: 'research',
      share: timerShare(item.researchStartedAt, item.researchEndsAt, now, item.nextLevelCost?.researchSeconds),
      barColor: colors.positive,
    });
  }
  if (expeditions?.active) {
    const left = secondsUntil(expeditions.active.endsAt);
    operations.push({
      key: 'expedition',
      label: t(expeditions.active.expeditionNameKey),
      secondsLeft: left > 0 ? left : null,
      route: 'expeditions',
      share: timerShare(expeditions.active.startedAt, expeditions.active.endsAt, now),
      readyLabel: t('expeditions.readyToClaim'),
    });
  }
  for (const boss of bossFormations?.bosses ?? []) {
    for (const formation of boss.formations) {
      if (!formation.slots.some((s) => s.isCurrentPlayer)) continue;
      if (formation.status === 'OPEN') {
        operations.push({
          key: `boss-formation-${formation.id}`,
          label: t(boss.nameKey),
          secondsLeft: secondsUntil(formation.resolvesAt),
          route: 'bosses',
          share: timerShare(formation.createdAt, formation.resolvesAt, now),
        });
      } else if (now - new Date(formation.resolvesAt).getTime() < READY_RESULT_WINDOW_MS) {
        operations.push({ key: `boss-formation-${formation.id}`, label: t(boss.nameKey), secondsLeft: null, route: 'bosses', readyLabel: t('bosses.resultReady') });
      }
    }
  }

  const go = (route: string) => (route.startsWith('web:') ? openWebsite(route.slice(4)) : router.navigate(`/${route}` as never));

  const equippedCount = robot?.filter((slot) => slot.item !== null).length ?? 0;
  const unlockedZoneCount = zones?.filter((zone) => zone.unlocked).length ?? 0;
  const researchedCount = research?.researches.filter((r) => r.level > 0).length ?? 0;
  const cards: { key: string; navKey: string; route: string; subtitle: string }[] = [
    { key: 'robot', navKey: 'nav.robot', route: 'robot', subtitle: `${equippedCount}/7 ${t('dashboard.slotsEquipped')}` },
    {
      key: 'clans',
      navKey: 'nav.clans',
      route: 'clans',
      subtitle: myClan ? (myClan.clan ? `${myClan.clan.name} [${myClan.clan.tag}]` : t('dashboard.noClan')) : '…',
    },
    { key: 'friends', navKey: 'nav.friends', route: 'friends', subtitle: t('dashboard.friendsSubtitle') },
    { key: 'zones', navKey: 'nav.zones', route: 'zones', subtitle: zones ? `${unlockedZoneCount}/${zones.length} ${t('dashboard.zonesUnlocked')}` : '…' },
    {
      key: 'pvp',
      navKey: 'nav.pvp',
      route: 'pvp',
      subtitle: pvpStatus ? (pvpStatus.unlocked ? t('dashboard.pvpUnlocked') : t('dashboard.pvpLocked', { level: pvpStatus.minLevel })) : '…',
    },
    { key: 'expeditions', navKey: 'nav.expeditions', route: 'expeditions', subtitle: expeditions?.active ? t('dashboard.expeditionsActive') : t('dashboard.expeditionsIdle') },
    {
      key: 'base',
      navKey: 'nav.base',
      route: 'base',
      subtitle: base ? `${base.buildings.filter((b) => b.level > 0).length}/${base.buildings.length} ${t('dashboard.buildingsBuilt')}` : '…',
    },
    {
      key: 'research',
      navKey: 'nav.research',
      route: 'research',
      subtitle: research ? `${researchedCount}/${research.researches.length} ${t('dashboard.researchLeveled')}` : '…',
    },
    { key: 'players', navKey: 'nav.leaderboard', route: 'players', subtitle: t('dashboard.playersSubtitle') },
    { key: 'reports', navKey: 'nav.reports', route: 'reports', subtitle: t('dashboard.reportsSubtitle') },
    { key: 'market', navKey: 'nav.market', route: 'market', subtitle: t('dashboard.marketSubtitle') },
  ];

  const dailyDone = daily ? daily.tasks.filter((task) => task.completed).length : 0;
  const dailyClaimable = !!daily && (daily.tasks.some((task) => task.completed && !task.claimed) || (daily.allDone.completed && !daily.allDone.claimed) || daily.streak.ready);
  const achievementsClaimable = achievements ? achievements.achievements.filter((a) => a.completed && !a.finished).length + (achievements.levelReward?.reached ? 1 : 0) : 0;

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
      <UpdateBanner />
      <ScreenTitle title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <View style={{ marginBottom: 24 }}>
        <SectionHeading>{t('dashboard.activeOperations')}</SectionHeading>
        {operations.length > 0 ? (
          <View style={{ gap: 8 }}>
            {operations.map((op) => (
              <Pressable key={op.key} onPress={() => go(op.route)} style={card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 12, color: colors.text }}>{op.label}</Text>
                  {op.secondsLeft === null ? (
                    <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', color: colors.positive }}>{op.readyLabel}</Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>{formatDuration(op.secondsLeft)}</Text>
                  )}
                </View>
                {op.secondsLeft !== null && op.share != null && (
                  <View style={{ marginTop: 8, height: 5, borderRadius: 3, backgroundColor: colors.wellBorder, overflow: 'hidden' }}>
                    <View style={{ width: `${op.share * 100}%`, height: '100%', backgroundColor: op.barColor ?? colors.accent }} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={card}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('dashboard.noActiveOperations')}</Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
        <ProgressTile
          iconKey="daily_tasks"
          title={t('dailyTasks.title')}
          subtitle={daily ? t('dashboard.dailyTasksProgress', { done: dailyDone, total: daily.tasks.length }) : ''}
          dot={dailyClaimable}
          onPress={() => setOpenPanel('daily')}
        />
        <ProgressTile
          iconKey="achievements"
          title={t('achievements.title')}
          subtitle={achievementsClaimable > 0 ? t('dashboard.achievementsClaimable', { count: achievementsClaimable }) : t('dashboard.achievementsView')}
          dot={achievementsClaimable > 0}
          onPress={() => setOpenPanel('achievements')}
        />
      </View>

      <SectionHeading>{t('dashboard.quickAccess')}</SectionHeading>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
        {cards.map((c) => (
          <Pressable key={c.key} onPress={() => go(c.route)} style={[card, { width: '48.5%', alignItems: 'center' }]}>
            <View style={{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,45,53,0.35)', marginBottom: 12 }}>
              <AssetImage assetId={`dashboard.${c.key}.icon`} size={64} label={t(c.navKey)} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{t(c.navKey)}</Text>
            <Text style={{ marginTop: 4, minHeight: 30, fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>{c.subtitle}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ marginTop: 16, fontSize: 10, color: colors.textFaint, textAlign: 'center' }}>{t('mobile.version', { version: Constants.expoConfig?.version ?? '' })}</Text>

      <Sheet open={openPanel !== null} onClose={() => setOpenPanel(null)}>
        {openPanel === 'daily' && <DailyTasksPanel onChanged={() => Promise.all([load(), refreshProfile()])} />}
        {openPanel === 'achievements' && <AchievementsPanel onChanged={() => Promise.all([load(), refreshProfile()])} />}
        <Text onPress={() => setOpenPanel(null)} style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: colors.textFaint, textDecorationLine: 'underline' }}>
          {t('common.close')}
        </Text>
      </Sheet>
    </ScrollView>
  );
}

const card = { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8, padding: 16 } as const;

function ProgressTile({ iconKey, title, subtitle, dot, onPress }: { iconKey: string; title: string; subtitle: string; dot: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[card, { flex: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
      {dot && <View style={{ position: 'absolute', right: 12, top: 12, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.positive }} />}
      <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,45,53,0.35)' }}>
        <AssetImage assetId={`interface.${iconKey}.icon`} size={36} label={title} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{title}</Text>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}
