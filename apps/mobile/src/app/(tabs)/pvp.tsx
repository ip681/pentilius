import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { MyClanResponseDto, PvpBattleReportDto, PvpScoutDto, PvpStatusDto } from '@pentilius/shared';
import { CombatLog, duelOutcomeLine, duelRoundLines, FighterPanel, LogLine, ROUND_INTERVAL_MS } from '@/components/Battle';
import { BattleDivider } from '@/components/BattleDivider';
import { CombatStatsCard } from '@/components/CombatStatsCard';
import { EnergyRefill } from '@/components/EnergyRefill';
import { PlayerLink } from '@/components/PlayerLink';
import { ApiError, attackPvpOpponent, getMyClan, getPvpReports, getPvpStatus, scoutPvpOpponent } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { displayPlayerName } from '@/lib/player-name';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/use-live';
import { colors } from '@/theme';

interface BattleState {
  report: PvpBattleReportDto;
  round: number;
  youHp: number;
  opponentHp: number;
  log: LogLine[];
  finished: boolean;
}

// The web's PvP page (apps/web/src/app/(player)/[locale]/pvp/page.tsx), as on a phone.
export default function PvpScreen() {
  const { profile, refresh: refreshProfile } = useSession();
  const [status, setStatus] = useState<PvpStatusDto | null>(null);
  const [reports, setReports] = useState<PvpBattleReportDto[] | null>(null);
  const [scout, setScout] = useState<PvpScoutDto | null>(null);
  const [myClan, setMyClan] = useState<MyClanResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [attacking, setAttacking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myName = profile?.username ?? t('pvp.you');

  async function loadScout() {
    try {
      setScout(await scoutPvpOpponent());
    } catch (err) {
      setScout(null);
      if (err instanceof ApiError && err.status === 404) setError(t('pvp.noOpponents'));
    }
  }

  async function load(withScout: boolean) {
    try {
      const [statusRes, reportsRes, myClanRes] = await Promise.all([getPvpStatus(), getPvpReports(), getMyClan()]);
      setStatus(statusRes);
      setReports(reportsRes);
      setMyClan(myClanRes);
      if (statusRes.unlocked && withScout) await loadScout();
    } catch {
      setError(t('pvp.loadError'));
    }
  }
  // An opponent is scouted once; coming back to the screen only refreshes the reports, so it doesn't reroll.
  const scouted = useRef(false);
  useLive(() => {
    load(!scouted.current);
    scouted.current = true;
  });

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  async function handleAttack() {
    if (attacking || (battle && !battle.finished) || !scout) return;
    if ((profile?.energy.current ?? 0) < 1) {
      setError(t('pvp.notEnoughEnergy'));
      return;
    }
    setError(null);
    setAttacking(true);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const report = await attackPvpOpponent(scout.opponentId);
      setScout(null);
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

      await Promise.all([load(false), refreshProfile()]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(t('pvp.opponentGone'));
        await loadScout();
      } else if (err instanceof ApiError && err.code === 'EXPEDITION_IN_PROGRESS') setError(t('pvp.expeditionInProgress'));
      else if (err instanceof ApiError && err.status === 400) setError(t('pvp.notEnoughEnergy'));
      else setError(t('pvp.attackError'));
      await refreshProfile();
    } finally {
      setAttacking(false);
    }
  }

  async function reroll() {
    setError(null);
    await loadScout();
  }

  const noEnergy = (profile?.energy.current ?? 0) < 1;

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text }}>{t('pvp.title')}</Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>{t('pvp.subtitle')}</Text>
      </View>
      {error && <Text style={{ marginBottom: 16, textAlign: 'center', color: '#f87171' }}>{error}</Text>}

      {status && !status.unlocked && (
        <View style={[panel, { padding: 20, marginBottom: 24 }]}>
          <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>{t('pvp.locked', { level: status.minLevel })}</Text>
        </View>
      )}

      {status?.unlocked && !battle && (
        <View style={{ marginBottom: 24 }}>
          {scout ? (
            <View style={[panel, { padding: 16 }]}>
              <Text style={{ marginBottom: 16, textAlign: 'center', fontSize: 14, fontWeight: '600', color: colors.text }}>{t('pvp.scoutTitle')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6, marginBottom: 20 }}>
                {profile && (
                  <CombatStatsCard
                    title={myName}
                    subtitle={`${t(`race.${profile.race}.name`)} · ${t('pvp.level')} ${profile.level} · ${myClan?.clan ? `[${myClan.clan.tag}]` : '-'}`}
                    stats={scout.myStats}
                    variant="player"
                    avatarFrame={{ avatarKey: profile.selectedAvatarKey, frameKey: profile.selectedFrameKey }}
                    showItemBonuses={false}
                  />
                )}
                <BattleDivider />
                <CombatStatsCard
                  title={<PlayerLink playerId={scout.opponentId} username={scout.opponentUsername} isVip={scout.opponentIsVip} />}
                  subtitle={`${t(`race.${scout.opponentRace}.name`)} · ${t('pvp.level')} ${scout.opponentLevel} · ${scout.opponentClanTag ? `[${scout.opponentClanTag}]` : '-'}`}
                  stats={scout.opponentStats}
                  variant="enemy"
                  avatarFrame={{ avatarKey: scout.opponentSelectedAvatarKey, frameKey: scout.opponentSelectedFrameKey }}
                  showItemBonuses={false}
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                <Button label={t('pvp.reroll')} onPress={reroll} disabled={attacking} plain />
                <Button label={t('pvp.attack')} onPress={handleAttack} dimmed={attacking || noEnergy} />
              </View>
              <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 10, color: colors.textFaint }}>{t('pvp.attackCost', { amount: status.attackCostEnergy })}</Text>
              <EnergyRefill profile={profile} needed={status.attackCostEnergy} onRefilled={refreshProfile} />
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Button label={t('pvp.findOpponent')} onPress={reroll} />
            </View>
          )}
        </View>
      )}

      {battle && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6, marginBottom: 24 }}>
            <FighterPanel name={myName} hp={battle.youHp} maxHp={battle.report.attackerMaxHp} variant="player" avatarKey={profile?.selectedAvatarKey} frameKey={profile?.selectedFrameKey} />
            <BattleDivider round={battle.round} />
            <FighterPanel
              name={displayPlayerName(battle.report.opponentUsername)}
              hp={battle.opponentHp}
              maxHp={battle.report.defenderMaxHp}
              variant="enemy"
              avatarKey={battle.report.opponentSelectedAvatarKey}
              frameKey={battle.report.opponentSelectedFrameKey}
            />
          </View>
          <View style={[panel, { padding: 16, marginBottom: 24 }]}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12 }}>{t('pve.combatLog')}</Text>
            <CombatLog log={battle.log} />
            {battle.finished && (
              <View style={{ marginTop: 16 }}>
                <Button
                  label={t('pvp.attackAgain')}
                  onPress={() => {
                    setBattle(null);
                    loadScout();
                  }}
                />
              </View>
            )}
          </View>
        </>
      )}

      {reports && (
        <View>
          <Text style={{ marginBottom: 12, fontSize: 14, fontWeight: '600', color: colors.text }}>{t('pvp.reportsTitle')}</Text>
          <View style={{ gap: 12 }}>
            {reports.slice(0, 5).map((report) => (
              <View key={report.id} style={[panel, { padding: 16 }]}>
                <ReportLine report={report} />
                <Text style={{ fontSize: 13, color: colors.textMuted }}>{formatDateTime(report.createdAt)}</Text>
              </View>
            ))}
          </View>
          <Text onPress={() => router.navigate('/reports')} style={{ marginTop: 12, fontSize: 12, color: colors.accent }}>
            {t('nav.reports')} →
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const panel = { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8 } as const;

/** "You defeated <name>" with the name as a link — the web's t.rich with <link>. */
function ReportLine({ report }: { report: PvpBattleReportDto }) {
  const key =
    report.role === 'attacker'
      ? report.outcome === 'WIN'
        ? 'pvp.outcomeYouWon'
        : 'pvp.outcomeYouLost'
      : report.outcome === 'WIN'
        ? 'pvp.outcomeDefeatedBy'
        : 'pvp.outcomeYouDefended';
  const [before, after] = t(key, { name: '\u0000' }).split(/<link>\u0000<\/link>/);
  return (
    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>
      {before}
      <PlayerLink playerId={report.opponentId} username={report.opponentUsername} />
      {after}
    </Text>
  );
}

function Button({ label, onPress, disabled = false, dimmed = false, plain = false }: { label: string; onPress: () => void; disabled?: boolean; dimmed?: boolean; plain?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 6,
        borderWidth: 1,
        borderColor: plain ? colors.wellBorder : colors.accent,
        backgroundColor: pressed ? colors.accentBgHover : plain ? colors.well : colors.accentBg,
        paddingHorizontal: 20,
        paddingVertical: 10,
        alignItems: 'center',
        opacity: disabled || dimmed ? 0.3 : 1,
      })}
    >
      <Text style={{ fontSize: 12, textTransform: 'uppercase', color: plain ? colors.textMuted : colors.text }}>{label}</Text>
    </Pressable>
  );
}
