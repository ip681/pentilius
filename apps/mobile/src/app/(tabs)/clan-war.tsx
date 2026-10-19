import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ClanWarAttackReportDto, ClanWarContributionEntryDto, ClanWarContributionsDto, ClanWarHistoryEntryDto, ClanWarStateDto, ClanWarTargetDto } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { CombatLog, duelOutcomeLine, duelRoundLines, FighterPanel, LogLine, ROUND_INTERVAL_MS } from '@/components/Battle';
import { BattleDivider } from '@/components/BattleDivider';
import { TreasuryChanges, WarOutcomeLine } from '@/components/ClanWarResult';
import { EnergyRefill } from '@/components/EnergyRefill';
import { ApiError, attackClanWarTarget, getClanWarContributions, getClanWarHistory, getClanWarStatus, getClanWarTargets } from '@/lib/api';
import { formatDuration } from '@/lib/duration';
import { formatDateTime, formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { displayPlayerName } from '@/lib/player-name';
import { useSession } from '@/lib/session';
import { useClock, useLive } from '@/lib/use-live';
import { colors } from '@/theme';

interface BattleState {
  report: ClanWarAttackReportDto;
  round: number;
  youHp: number;
  opponentHp: number;
  log: LogLine[];
  finished: boolean;
}

// The web's Clan war page (apps/web/src/app/(player)/[locale]/clan-war/page.tsx), as on a phone.
export default function ClanWarScreen() {
  const { profile, refresh: refreshProfile } = useSession();
  const [war, setWar] = useState<ClanWarStateDto | null | undefined>(undefined);
  const [targets, setTargets] = useState<ClanWarTargetDto[] | null>(null);
  const [contributions, setContributions] = useState<ClanWarContributionsDto | null>(null);
  const [lastWar, setLastWar] = useState<ClanWarHistoryEntryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [attacking, setAttacking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const now = useClock();
  const myName = t('pve.you');

  async function load() {
    try {
      const { war: status } = await getClanWarStatus();
      setWar(status);
      if (status) {
        const [list, contributionsRes] = await Promise.all([getClanWarTargets(), getClanWarContributions(status.id)]);
        setTargets(list);
        setContributions(contributionsRes);
        setLastWar(null);
      } else {
        setTargets(null);
        setContributions(null);
        const history = await getClanWarHistory();
        setLastWar(history[0] ?? null);
      }
    } catch {
      setError(t('clans.war.loadError'));
    }
  }
  // Live while the war runs, only while this screen is in view.
  useLive(load, 10_000);

  const secondsLeft = war ? Math.max(0, Math.ceil((new Date(war.endsAt).getTime() - now) / 1000)) : 0;
  useEffect(() => {
    if (war && secondsLeft === 0) load();
  }, [war && secondsLeft === 0]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  async function handleAttack(defenderId: string) {
    if (attacking || (battle && !battle.finished)) return;
    setError(null);
    setAttacking(true);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const report = await attackClanWarTarget(defenderId);
      const enemyName = displayPlayerName(report.opponentUsername);
      setBattle({
        report,
        round: 0,
        youHp: report.attackerMaxHp,
        opponentHp: report.defenderMaxHp,
        log: [{ text: t('pvp.encounterStart', { name: enemyName }), kind: 'system' }],
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
          const log: LogLine[] = [...previous.log, ...duelRoundLines(roundData, myName, enemyName)];
          const finished = index >= report.rounds.length;
          if (finished) log.push(duelOutcomeLine(report.outcome === 'WIN', report.lootSummary));
          return { ...previous, round: roundData.round, youHp: roundData.playerHpAfter, opponentHp: roundData.pentiliHpAfter, log, finished };
        });
      }, ROUND_INTERVAL_MS);

      await Promise.all([load(), refreshProfile()]);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TARGET_PROTECTED') setError(t('clans.war.errorTargetProtected'));
      else if (err instanceof ApiError && err.code === 'ATTACK_COOLDOWN') setError(t('clans.war.errorAttackCooldown'));
      else if (err instanceof ApiError && err.code === 'EXPEDITION_IN_PROGRESS') setError(t('pve.expeditionInProgress'));
      else if (err instanceof ApiError && err.status === 400) setError(t('pvp.notEnoughEnergy'));
      else setError(t('pvp.attackError'));
      await Promise.all([load(), refreshProfile()]);
    } finally {
      setAttacking(false);
    }
  }

  const myShare = war ? Math.max(0, Math.min(1, war.myPoolRemaining / Math.max(1, war.myPoolRemaining + war.enemyPoolRemaining))) : 0.5;

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text }}>{t('clans.war.title')}</Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>{t('clans.war.subtitle')}</Text>
      </View>
      {error && <Text style={{ marginBottom: 16, textAlign: 'center', color: '#f87171' }}>{error}</Text>}

      {war === null && (
        <View style={[panel, { padding: 20, alignItems: 'center' }]}>
          <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: lastWar ? 12 : 0 }}>{t('clans.war.notAtWar')}</Text>
          {lastWar && <LastWarResultCard entry={lastWar} />}
        </View>
      )}

      {war && (
        <>
          <View style={{ marginBottom: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorderDanger, backgroundColor: colors.panel, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.positive }}>
                [{war.myClanTag}] {war.myClanName}
              </Text>
              <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '600', color: colors.danger }}>
                [{war.enemyClanTag}] {war.enemyClanName}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.wellBorder, marginBottom: 8 }}>
              <View style={{ width: `${myShare * 100}%`, backgroundColor: colors.positive }} />
              <View style={{ width: `${(1 - myShare) * 100}%`, backgroundColor: colors.danger }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}>
              <Text style={{ fontSize: 10, color: colors.textFaint }}>
                {formatNumber(war.myPoolRemaining)} / {formatNumber(war.myPoolMax)}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textFaint }}>
                {t('clans.war.timeLeft')}: {formatDuration(secondsLeft)}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textFaint }}>
                {formatNumber(war.enemyPoolRemaining)} / {formatNumber(war.enemyPoolMax)}
              </Text>
            </View>
          </View>

          {battle ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6, marginBottom: 24 }}>
                <FighterPanel name={myName} hp={battle.youHp} maxHp={battle.report.attackerMaxHp} variant="player" showPicture={false} />
                <BattleDivider round={battle.round} />
                <FighterPanel name={displayPlayerName(battle.report.opponentUsername)} hp={battle.opponentHp} maxHp={battle.report.defenderMaxHp} variant="enemy" showPicture={false} />
              </View>
              <View style={[panel, { padding: 16, marginBottom: 24 }]}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12 }}>{t('pve.combatLog')}</Text>
                <CombatLog log={battle.log} />
                {battle.finished && (
                  <Pressable onPress={() => setBattle(null)} style={{ marginTop: 16, borderRadius: 6, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentBg, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.text }}>{t('clans.war.backToTargets')}</Text>
                  </Pressable>
                )}
              </View>
            </>
          ) : (
            <View style={[panel, { padding: 16 }]}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12 }}>{t('clans.war.targets')}</Text>
              <View style={{ gap: 8 }}>
                {targets?.length === 0 && <Text style={{ padding: 8, fontSize: 12, color: colors.textFaint }}>{t('clans.war.noTargets')}</Text>}
                {targets?.map((target) => {
                  const attackableAtMs = target.attackableAt ? new Date(target.attackableAt).getTime() : 0;
                  const onCooldown = attackableAtMs > now;
                  const hasEnergy = (profile?.energy.current ?? 0) >= 1;
                  return (
                    <View key={target.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 12 }}>
                      <AssetImage assetId={`races.${target.race.toLowerCase()}.icon`} size={32} label={t(`race.${target.race}.name`)} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: target.isVip ? colors.vipGold : colors.text }}>
                          {displayPlayerName(target.username)}
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.textFaint }}>
                          {t('pvp.level')} {target.level}
                        </Text>
                        <Text style={{ marginTop: 2, fontSize: 9, color: colors.textFaint }}>
                          {t('robot.stat.damage')} {Math.round(target.stats.attack)}  {t('robot.stat.defense')} {Math.round(target.stats.defense)}  {t('robot.stat.hp')} {Math.round(target.stats.hp)}  {t('robot.stat.evasion')} {target.stats.evasion}%
                        </Text>
                      </View>
                      <Pressable
                        disabled={onCooldown || attacking || !hasEnergy}
                        onPress={() => handleAttack(target.playerId)}
                        style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.panelBorderDanger, backgroundColor: colors.well, paddingHorizontal: 16, paddingVertical: 8, opacity: onCooldown || attacking || !hasEnergy ? 0.3 : 1 }}
                      >
                        <Text style={{ fontSize: 10, textTransform: 'uppercase', color: colors.danger }}>{onCooldown ? formatDuration((attackableAtMs - now) / 1000) : t('clans.war.attack')}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              {/* Out of energy: packs right under the attack buttons. */}
              <EnergyRefill profile={profile} onRefilled={refreshProfile} />
            </View>
          )}

          {!battle && contributions && (contributions.mine.length > 0 || contributions.enemy.length > 0) && (
            <View style={[panel, { marginTop: 24, padding: 16, gap: 16 }]}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('clans.war.contributions')}</Text>
              <ContributionList title={t('clans.war.contributionsMine')} entries={contributions.mine} accent={colors.positive} />
              <ContributionList title={t('clans.war.contributionsEnemy')} entries={contributions.enemy} accent={colors.danger} />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const panel = { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8 } as const;

function LastWarResultCard({ entry }: { entry: ClanWarHistoryEntryDto }) {
  return (
    <View style={{ alignSelf: 'stretch', borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 16, gap: 6 }}>
      <WarOutcomeLine entry={entry} />
      <Text style={{ fontSize: 10, color: colors.textFaint }}>{formatDateTime(entry.resolvedAt)}</Text>
      <TreasuryChanges entry={entry} />
    </View>
  );
}

function ContributionList({ title, entries, accent }: { title: string; entries: ClanWarContributionEntryDto[]; accent: string }) {
  return (
    <View>
      <Text style={{ marginBottom: 8, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: accent }}>{title}</Text>
      {entries.length === 0 ? (
        <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('clans.war.noTargets')}</Text>
      ) : (
        <View style={{ gap: 6 }}>
          {entries.map((entry, index) => (
            <View key={entry.playerId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: colors.text }}>
                <Text style={{ color: colors.textFaint }}>#{index + 1}</Text> {displayPlayerName(entry.username)}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textFaint }}>
                {formatNumber(entry.totalDamageDealt)} · {entry.attackCount} {t('clans.war.hits')}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
