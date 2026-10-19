import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { BattleReportDto, BossDto, PentiliDto, PentiliLootDropDto, Race } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { CombatLog, FighterPanel, LogLine, ROUND_INTERVAL_MS } from '@/components/Battle';
import { BattleDivider } from '@/components/BattleDivider';
import { BossFormationCard } from '@/components/BossFormationCard';
import { ActionButton, CheckRow, ConfirmButton } from '@/components/ConfirmButton';
import { EnergyRefill } from '@/components/EnergyRefill';
import { LootEntry } from '@/components/LootEntry';
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
} from '@/lib/api';
import { formatDuration } from '@/lib/duration';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { takePendingBattle } from '@/lib/pending-battle';
import { useSession } from '@/lib/session';
import { useClock, useLive } from '@/lib/use-live';
import { isVipActive, multiAttackCount } from '@/lib/vip';
import { colors } from '@/theme';

// The web's zone page (apps/web/src/app/(player)/[locale]/zones/[zoneId]/page.tsx), as on a phone.
interface BattleState {
  target: PentiliDto;
  report: BattleReportDto;
  round: number;
  playerHp: number;
  pentiliHp: number;
  log: LogLine[];
  finished: boolean;
}

function RewardSummary({ report, color }: { report: BattleReportDto; color: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
      <Text style={{ color, fontSize: 11, fontWeight: '600' }}>
        {t('pve.xpGained')}: {report.xpGained}
      </Text>
      {report.leveledUp && <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{t('pve.leveledUp', { level: report.playerLevel })}</Text>}
      {report.lootSummary.map((loot, index) => (
        <LootEntry key={index} loot={loot} color={color} />
      ))}
    </View>
  );
}

function DropEntry({ drop }: { drop: PentiliLootDropDto }) {
  const quantity = drop.minQuantity === drop.maxQuantity ? `${drop.minQuantity}` : `${drop.minQuantity}-${drop.maxQuantity}`;
  const percent = Math.round(drop.dropChance * 100);
  if (drop.type === 'resource') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <ResourceIcon type={drop.resourceType!} size={14} />
        <Text style={{ fontSize: 9, color: colors.textFaint }}>
          ×{quantity} ({percent}%)
        </Text>
      </View>
    );
  }
  const name = t(drop.itemNameKey!);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <AssetImage assetId={drop.itemIconAssetId ?? ''} size={14} label={name} />
      <Text style={{ fontSize: 9, color: colors.textFaint }}>
        {name} ×{quantity} ({percent}%)
      </Text>
    </View>
  );
}

export default function ZoneScreen() {
  const params = useLocalSearchParams<{ zoneId: string; pentili?: string; boss?: string; visit?: string }>();
  // A fresh screen for every trip into a zone (see zones.tsx), like a new page on the web.
  return <ZoneContent key={`${params.zoneId}-${params.visit ?? ''}`} params={params} />;
}

function ZoneContent({ params }: { params: { zoneId: string; pentili?: string; boss?: string } }) {
  const zoneId = params.zoneId;
  const targetPentiliId = params.pentili ?? null;
  const focusBoss = params.boss === '1';
  const { profile, refresh: refreshProfile } = useSession();
  const [pentili, setPentili] = useState<PentiliDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [attacking, setAttacking] = useState(false);
  const [series, setSeries] = useState<BattleReportDto[] | null>(null);
  const multiCount = multiAttackCount(profile);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The combat log scrolls to its newest line as rounds come in.
  const autoShown = useRef(false);
  const myName = profile?.username ?? t('pve.you');

  useEffect(() => {
    getPentiliInZone(zoneId)
      .then(setPentili)
      .catch(() => setError(t('pve.loadError')));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [zoneId]);

  // An attack fired on the planet: show its result at once.
  useEffect(() => {
    if (!targetPentiliId || autoShown.current || !pentili) return;
    const target = pentili.find((entry) => entry.id === targetPentiliId);
    const reports = target ? takePendingBattle(targetPentiliId) : null;
    if (!target || !reports) return;
    autoShown.current = true;
    showReports(target, reports);
  }, [pentili, targetPentiliId]);

  function startBattle(target: PentiliDto, report: BattleReportDto) {
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
      const r = report.rounds[index];
      index += 1;
      setBattle((previous) => {
        if (!previous) return previous;
        const log: LogLine[] = [...previous.log];
        const enemy = t(target.nameKey);
        if (r.pentiliDodged) log.push({ text: t('pve.roundDodge', { name: enemy }), kind: 'enemy' });
        else {
          log.push({ text: t('pve.roundHit', { name: myName, damage: r.playerDamage }), kind: 'player' });
          if (r.playerCritical) log.push({ text: t('pve.roundCritical', { name: myName }), kind: 'player' });
          if (r.pentiliReflectedDamage > 0) log.push({ text: t('pve.roundReflect', { name: enemy, damage: r.pentiliReflectedDamage }), kind: 'enemy' });
        }
        if (r.playerDodged) log.push({ text: t('pve.roundDodge', { name: myName }), kind: 'player' });
        else if (r.pentiliDamage > 0) {
          log.push({ text: t('pve.roundHit', { name: enemy, damage: r.pentiliDamage }), kind: 'enemy' });
          if (r.pentiliCritical) log.push({ text: t('pve.roundCritical', { name: enemy }), kind: 'enemy' });
          if (r.playerReflectedDamage > 0) log.push({ text: t('pve.roundReflect', { name: myName, damage: r.playerReflectedDamage }), kind: 'player' });
        }
        const finished = index >= report.rounds.length;
        if (finished) {
          const win = report.outcome === 'WIN';
          log.push({
            text: win ? (
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.positive, fontSize: 11, fontFamily: 'monospace' }}>{t('pve.victoryLog')}</Text>
                <RewardSummary report={report} color={colors.positive} />
              </View>
            ) : (
              t('pve.defeatLog')
            ),
            kind: win ? 'player' : 'enemy',
          });
        }
        return { ...previous, round: r.round, playerHp: r.playerHpAfter, pentiliHp: r.pentiliHpAfter, log, finished };
      });
    }, ROUND_INTERVAL_MS);
  }

  function showReports(target: PentiliDto, reports: BattleReportDto[]) {
    setSeries(reports.length > 1 ? reports : null);
    startBattle(target, reports[reports.length - 1]);
  }

  async function attack(target: PentiliDto, multi = false) {
    if (attacking || (battle && !battle.finished)) return;
    if ((profile?.energy.current ?? 0) < (multi ? 2 : 1)) {
      setError(t('pve.notEnoughEnergy'));
      return;
    }
    setError(null);
    setAttacking(true);
    try {
      const reports = multi ? (await attackPentiliMulti(target.id)).reports : [await attackPentili(target.id)];
      await refreshProfile();
      showReports(target, reports);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EXPEDITION_IN_PROGRESS') setError(t('pve.expeditionInProgress'));
      else if (err instanceof ApiError && err.status === 400) setError(t('pve.notEnoughEnergy'));
      else setError(t('pve.attackError'));
      await refreshProfile();
    } finally {
      setAttacking(false);
    }
  }

  const busy = attacking || (battle !== null && !battle.finished);
  const noEnergy = (profile?.energy.current ?? 0) < 1;
  const attackButtons = (entry: PentiliDto, compact: boolean) => (
    <View style={{ gap: 6, alignSelf: compact ? 'stretch' : 'auto', flexDirection: compact ? 'column' : 'row' }}>
      <ActionButton size={compact ? 'sm' : 'md'} label={t('pve.attack')} disabled={busy || noEnergy} onPress={() => attack(entry)} />
      {isVipActive(profile) && (
        <ActionButton
          size={compact ? 'sm' : 'md'}
          tone="vip"
          label={t('pve.attackMulti', { count: multiCount >= 2 ? multiCount : (profile?.vipMultiAttackCount ?? 3) })}
          disabled={busy || multiCount < 2}
          onPress={() => attack(entry, true)}
        />
      )}
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text, textAlign: 'center', marginBottom: 24 }}>{t('pve.title')}</Text>
      {error && <Text style={{ marginBottom: 16, textAlign: 'center', color: '#f87171' }}>{error}</Text>}

      {battle && !focusBoss && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6, marginBottom: 24 }}>
            <FighterPanel name={myName} hp={battle.playerHp} maxHp={battle.report.playerMaxHp} variant="player" avatarKey={profile?.selectedAvatarKey} frameKey={profile?.selectedFrameKey} />
            <BattleDivider round={battle.round} />
            <FighterPanel name={t(battle.target.nameKey)} hp={battle.pentiliHp} maxHp={battle.report.pentiliMaxHp} variant="enemy" iconAssetId={battle.target.iconAssetId} />
          </View>

          {series && (
            <View style={[panel, { padding: 16, marginBottom: 16, gap: 6 }]}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 }}>
                {t('pve.seriesTitle', { count: series.length, wins: series.filter((r) => r.outcome === 'WIN').length })}
              </Text>
              {series.map((report, index) => (
                <Pressable
                  key={report.id}
                  onPress={() => startBattle(battle.target, report)}
                  style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, borderRadius: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderColor: report.id === battle.report.id ? colors.accent : colors.wellBorder, backgroundColor: report.id === battle.report.id ? colors.accentBg : colors.well }}
                >
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>{t('pve.seriesBattle', { number: index + 1 })}</Text>
                  <Text style={{ fontSize: 11, color: report.outcome === 'WIN' ? colors.positive : colors.danger }}>{report.outcome === 'WIN' ? t('pve.seriesWin') : t('pve.seriesLoss')}</Text>
                  {report.outcome === 'WIN' && <RewardSummary report={report} color={colors.text} />}
                </Pressable>
              ))}
              {series[series.length - 1].outcome !== 'WIN' && <Text style={{ fontSize: 11, color: colors.textFaint }}>{t('pve.seriesStopped')}</Text>}
            </View>
          )}

          <View style={[panel, { padding: 16, marginBottom: 24 }]}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12 }}>{t('pve.combatLog')}</Text>
            <CombatLog log={battle.log} />
          </View>
        </>
      )}

      {pentili && !focusBoss && targetPentiliId &&
        pentili
          .filter((entry) => entry.id === targetPentiliId)
          .map((entry) => (
            <View key={entry.id} style={[panel, { padding: 16, gap: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <AssetImage assetId={entry.iconAssetId} size={64} label={t(entry.nameKey)} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>
                    {t(entry.nameKey)} (Lv. {entry.level})
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>
                    HP {formatNumber(entry.maxHp)} · ATK {formatNumber(entry.attack)} · DEF {formatNumber(entry.defense)}
                  </Text>
                  {entry.lootDrops.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, marginTop: 4 }}>
                      <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('pve.drops')}:</Text>
                      {entry.lootDrops.map((drop, index) => (
                        <DropEntry key={index} drop={drop} />
                      ))}
                    </View>
                  )}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {attackButtons(entry, false)}
                <EnergyRefill profile={profile} onRefilled={refreshProfile} />
              </View>
            </View>
          ))}

      {pentili && !focusBoss && !targetPentiliId && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
            {pentili.map((entry) => (
              <View key={entry.id} style={[panel, { width: '48.5%', padding: 12, alignItems: 'center', gap: 8 }]}>
                <AssetImage assetId={entry.iconAssetId} size={56} label={t(entry.nameKey)} />
                <Text style={{ fontSize: 12, fontWeight: '500', color: colors.text, textAlign: 'center' }}>
                  {t(entry.nameKey)} (Lv. {entry.level})
                </Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, textAlign: 'center' }}>
                  HP {formatNumber(entry.maxHp)} · ATK {formatNumber(entry.attack)} · DEF {formatNumber(entry.defense)}
                </Text>
                {entry.lootDrops.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 6, rowGap: 4 }}>
                    {entry.lootDrops.map((drop, index) => (
                      <DropEntry key={index} drop={drop} />
                    ))}
                  </View>
                )}
                {attackButtons(entry, true)}
              </View>
            ))}
          </View>
          <EnergyRefill profile={profile} onRefilled={refreshProfile} />
        </>
      )}

      {!targetPentiliId && <ZoneBossPanel zoneId={zoneId} myRace={profile?.race ?? null} />}
    </ScrollView>
  );
}

const panel = { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8 } as const;

/** This land's boss with its open formations (the web's ZoneBossPanel). */
function ZoneBossPanel({ zoneId, myRace }: { zoneId: string; myRace: Race | null }) {
  const [data, setData] = useState<{ bosses: BossDto[]; nextActionAvailableAt: string | null } | null>(null);
  const [inClan, setInClan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useClock();
  const [visibility, setVisibility] = useState({ visibleToClanOnly: false, visibleToFriendsOnly: false });

  async function load() {
    try {
      const [formations, myClan] = await Promise.all([getBossFormations(), getMyClan()]);
      setData(formations);
      setInClan(myClan.clan !== null);
    } catch {
      setError(t('bosses.loadError'));
    }
  }

  // Other players fill formations — refreshed every 10 s, only while this screen is in view.
  useLive(load, 10_000);

  const boss = data?.bosses.find((b) => b.zoneId === zoneId) ?? null;
  if (!boss) return null;
  const openFormations = boss.formations.filter((f) => f.status === 'OPEN');
  const cooldownMs = data?.nextActionAvailableAt ? new Date(data.nextActionAvailableAt).getTime() - now : 0;
  const onCooldown = cooldownMs > 0;

  function errorMessage(err: unknown): string {
    const map: Record<string, string> = {
      LEVEL_TOO_LOW: t('bosses.errorLevelTooLow', { level: boss?.minLevel ?? 0 }),
      NOT_IN_CLAN: t('bosses.errorNotInClan'),
      BOSS_FORMATION_COOLDOWN_ACTIVE: t('bosses.errorCooldownActive'),
      EXPEDITION_IN_PROGRESS: t('bosses.expeditionInProgress'),
      SLOT_ALREADY_FILLED: t('bosses.errorSlotFilled'),
      FORMATION_ALREADY_RESOLVED: t('bosses.errorAlreadyResolved'),
      VISIBILITY_EDIT_WINDOW_CLOSED: t('bosses.errorVisibilityLocked'),
    };
    return err instanceof ApiError && err.code && map[err.code] ? map[err.code] : t('bosses.actionError');
  }
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <View style={{ marginTop: 32, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(197,168,115,0.5)', backgroundColor: colors.panel, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(197,168,115,0.5)', backgroundColor: colors.panelHeader, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', textTransform: 'uppercase', color: colors.gold }}>
          {t('bosses.title')}: {t(boss.nameKey)}
        </Text>
        {onCooldown && (
          <Text style={{ fontSize: 10, color: colors.gold }}>
            {t('bosses.cooldownActive')} {formatDuration(cooldownMs / 1000)}
          </Text>
        )}
      </View>
      <View style={{ padding: 20, gap: 12 }}>
        {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
        {!boss.unlocked && <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('bosses.locked', { level: boss.minLevel })}</Text>}
        <View pointerEvents={boss.unlocked ? 'auto' : 'none'} style={{ gap: 16, opacity: boss.unlocked ? 1 : 0.4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <AssetImage assetId={boss.iconAssetId} size={112} label={t(boss.nameKey)} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>HP {formatNumber(boss.maxHp)}</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                {t('bosses.attack')} {formatNumber(boss.attack)}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                {t('bosses.defense')} {formatNumber(boss.defense)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
            <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('pve.drops')}:</Text>
            <Text style={{ fontSize: 10, color: colors.textFaint }}>
              {t('pve.xpGained')} +{formatNumber(boss.xpReward)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <AssetImage assetId={boss.guaranteedBoxIconAssetId} size={14} label={t(boss.guaranteedBoxNameKey)} />
              <Text style={{ fontSize: 10, color: colors.textFaint }}>
                {t(boss.guaranteedBoxNameKey)} ({t('bosses.guaranteed')})
              </Text>
            </View>
            {boss.lootDrops.map((drop, index) => (
              <DropEntry key={index} drop={drop as PentiliLootDropDto} />
            ))}
          </View>

          <View style={{ borderRadius: 4, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 12, gap: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{t('bosses.createFormation')}</Text>
            <CheckRow label={t('market.clanOnly')} checked={visibility.visibleToClanOnly} disabled={!inClan} onChange={(v) => setVisibility({ ...visibility, visibleToClanOnly: v })} />
            <CheckRow label={t('market.friendsOnly')} checked={visibility.visibleToFriendsOnly} onChange={(v) => setVisibility({ ...visibility, visibleToFriendsOnly: v })} />
            <ConfirmButton label={t('bosses.createFormation')} message={t('bosses.createConfirm')} disabled={onCooldown || !boss.unlocked} onConfirm={() => run(() => createBossFormation(boss.key, visibility))} />
          </View>

          {openFormations.length === 0 ? (
            <Text style={{ fontSize: 12, color: colors.textFaint }}>{t('bosses.noFormations')}</Text>
          ) : (
            openFormations.map((formation) => (
              <BossFormationCard
                key={formation.id}
                formation={formation}
                now={now}
                myRace={myRace}
                onCooldown={onCooldown}
                onJoin={() => run(() => joinBossFormation(formation.id))}
                onVisibilityToggle={(next) => run(() => updateBossFormationVisibility(formation.id, next))}
              />
            ))
          )}
        </View>
      </View>
    </View>
  );
}
