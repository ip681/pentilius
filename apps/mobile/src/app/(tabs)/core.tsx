import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { CoreAttackResultDto, CorePlayerRankingPageDto, CorePlayerRankingScope, CorePlayerStandingDto, CoreStandingDto, CoreStateDto } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { ClanLink } from '@/components/ClanLink';
import { EnergyRefill } from '@/components/EnergyRefill';
import { Pagination } from '@/components/Pagination';
import { PlayerLink } from '@/components/PlayerLink';
import { ApiError, attackCore, getCorePlayerRanking, getCoreState } from '@/lib/api';
import { formatDuration } from '@/lib/duration';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useClock, useLive } from '@/lib/use-live';
import { colors } from '@/theme';

// The web's Core page (apps/web/src/app/(player)/[locale]/core/page.tsx), as on a phone.
// Every outcome is decided by the server — this screen only shows it.
export default function CoreScreen() {
  const { profile, refresh: refreshProfile } = useSession();
  const [state, setState] = useState<CoreStateDto | null>(null);
  const [lastAttack, setLastAttack] = useState<CoreAttackResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attacking, setAttacking] = useState(false);
  // Bumped on every refresh so the player rankings reload in step with the sliders.
  const [refreshTick, setRefreshTick] = useState(0);
  // Server clock minus phone clock, so countdowns don't drift with a wrong phone clock.
  const clockOffsetRef = useRef(0);
  const now = useClock();

  function applyState(next: CoreStateDto) {
    // Nothing to see before the Core opens — the Zones screen shows "Coming soon".
    if (next.status === 'NOT_SCHEDULED' || next.status === 'SCHEDULED') {
      router.replace('/zones');
      return;
    }
    clockOffsetRef.current = new Date(next.serverNow).getTime() - Date.now();
    setState(next);
    setRefreshTick((tick) => tick + 1);
  }

  async function load() {
    try {
      applyState(await getCoreState());
    } catch {
      setError(t('core.loadError'));
    }
  }
  // Other clans' attacks show up every 30 s while this screen is in view.
  useLive(load, 30_000);

  const serverNow = now + clockOffsetRef.current;
  const secondsLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - serverNow) / 1000)) : 0);
  const endsIn = state?.status === 'OPEN' ? secondsLeft(state.endsAt) : null;
  const resetIn = state?.status === 'ENDED' && state.resetAt ? secondsLeft(state.resetAt) : null;
  // A countdown reaching zero means the status changed on the server — reload once.
  useEffect(() => {
    if (endsIn === 0) load();
  }, [endsIn === 0]);

  const cooldownLeft = secondsLeft(state?.nextAttackAt ?? null);
  const energy = profile?.energy.current ?? 0;
  const canAttack = state?.status === 'OPEN' && state.inClan && cooldownLeft === 0 && energy >= state.attackCostEnergy && !attacking;

  async function handleAttack() {
    if (!canAttack) return;
    setError(null);
    setAttacking(true);
    try {
      const result = await attackCore();
      setLastAttack(result);
      applyState(result.state);
    } catch (err) {
      const map: Record<string, string> = {
        CORE_NOT_OPEN: t('core.errorNotOpen'),
        NOT_IN_CLAN: t('core.errorNotInClan'),
        NOT_ENOUGH_ENERGY: t('core.errorNotEnoughEnergy'),
        CORE_ATTACK_COOLDOWN: t('core.errorCooldown'),
        EXPEDITION_IN_PROGRESS: t('core.errorExpedition'),
      };
      setError(err instanceof ApiError && err.code && map[err.code] ? map[err.code] : t('core.attackError'));
      load();
    } finally {
      setAttacking(false);
      refreshProfile();
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(197,168,115,0.6)', backgroundColor: colors.well, alignItems: 'center', justifyContent: 'center' }}>
          <AssetImage assetId="zones.core" size={64} label={t('core.title')} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text }}>{t('core.title')}</Text>
          {state && <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('core.seasonLabel', { season: state.seasonId })}</Text>}
        </View>
      </View>

      {error && (
        <Text style={{ marginBottom: 16, borderRadius: 6, borderWidth: 1, borderColor: colors.panelBorderDanger, backgroundColor: colors.panel, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, color: colors.danger }}>{error}</Text>
      )}

      {!state ? (
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('core.loading')}</Text>
      ) : (
        <>
          <StatusBanner state={state} endsIn={endsIn} resetIn={resetIn} />

          {state.status === 'OPEN' && (
            <View style={[panel, { padding: 16, marginBottom: 24 }]}>
              {!state.inClan ? (
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  {t('core.joinClanFirst')}{' '}
                  <Text onPress={() => router.navigate('/clans')} style={{ color: colors.accent, textDecorationLine: 'underline' }}>
                    {t('nav.clans')}
                  </Text>
                </Text>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 24, rowGap: 8, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                      {t('core.myDamage')}: <Text style={{ fontWeight: '600', color: colors.text }}>{formatNumber(state.myDamage)}</Text>
                    </Text>
                    {state.tavern && state.tavern.level > 0 && (
                      <Text style={{ fontSize: 12, color: state.tavern.active ? colors.positive : colors.textFaint }}>
                        {state.tavern.active ? t('core.tavernActive', { percent: state.tavern.bonusPercent }) : t('core.tavernInactive', { percent: state.tavern.bonusPercent })}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={handleAttack}
                    disabled={!canAttack}
                    style={({ pressed }) => ({ borderRadius: 6, borderWidth: 1, borderColor: colors.gold, backgroundColor: pressed ? colors.accentBgHover : colors.accentBg, paddingVertical: 12, alignItems: 'center', opacity: canAttack ? 1 : 0.4 })}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gold }}>
                      {cooldownLeft > 0 ? t('core.attackCooldown', { seconds: cooldownLeft }) : t('core.attack', { energy: state.attackCostEnergy })}
                    </Text>
                  </Pressable>
                  {energy < state.attackCostEnergy && <Text style={{ marginTop: 8, fontSize: 12, color: colors.textMuted }}>{t('core.errorNotEnoughEnergy')}</Text>}
                  <EnergyRefill profile={profile} needed={state.attackCostEnergy} onRefilled={refreshProfile} />
                  {lastAttack && (
                    <View style={{ marginTop: 16, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 12 }}>
                      <Text style={{ marginBottom: 4, fontSize: 12, fontWeight: '600', color: colors.text }}>{t('core.lastAttack')}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>
                        {t('core.lastAttackSummary', {
                          damage: formatNumber(lastAttack.damageDealt),
                          rounds: lastAttack.roundsSurvived,
                          maxRounds: lastAttack.maxRounds,
                          taken: formatNumber(lastAttack.damageTaken),
                        })}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          <Standings state={state} />

          <View style={{ marginTop: 24, gap: 16 }}>
            {state.myClan && <PlayerRanking scope="clan" title={`[${state.myClan.tag}] ${state.myClan.name}`} refreshTick={refreshTick} />}
            <PlayerRanking scope="server" title={t('core.topPlayers')} refreshTick={refreshTick} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const panel = { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8 } as const;

function StatusBanner({ state, endsIn, resetIn }: { state: CoreStateDto; endsIn: number | null; resetIn: number | null }) {
  const winner = state.standings[0];
  const text =
    state.status === 'OPEN'
      ? t('core.endsIn', { time: formatDuration(endsIn ?? 0), days: state.durationDays })
      : winner
        ? t('core.endedWinner', { clan: `[${winner.clanTag}] ${winner.clanName}` })
        : t('core.endedNoWinner');
  const open = state.status === 'OPEN';
  return (
    <View style={{ marginBottom: 24, borderRadius: 8, borderWidth: 1, borderColor: open ? 'rgba(197,168,115,0.6)' : colors.panelBorder, backgroundColor: colors.panel, padding: 16 }}>
      <Text style={{ fontSize: 14, color: open ? colors.gold : colors.text }}>{text}</Text>
      {state.status !== 'ENDED' && <Text style={{ marginTop: 4, fontSize: 12, color: colors.textMuted }}>{t('core.rulesSummary')}</Text>}
      {state.status === 'ENDED' && resetIn !== null && <Text style={{ marginTop: 8, fontSize: 12, color: colors.danger }}>{t('core.resetIn', { time: formatDuration(resetIn) })}</Text>}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={{ marginBottom: 12, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{children}</Text>;
}

function Standings({ state }: { state: CoreStateDto }) {
  return (
    <View style={[panel, { padding: 16 }]}>
      <SectionLabel>{t('core.standings')}</SectionLabel>
      {state.standings.length === 0 ? (
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('core.noStandings')}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {state.standings.map((standing) => (
            <StandingRow key={standing.clanId ?? standing.clanTag} standing={standing} />
          ))}
          {state.myClanStanding && (
            <>
              <Text style={{ textAlign: 'center', fontSize: 12, color: colors.textFaint }}>⋯</Text>
              <StandingRow standing={state.myClanStanding} />
            </>
          )}
        </View>
      )}
    </View>
  );
}

const PODIUM: Record<number, string> = { 1: colors.podiumGold, 2: colors.silver, 3: colors.bronze };

function StandingRow({ standing }: { standing: CoreStandingDto }) {
  const podium = PODIUM[standing.rank];
  return (
    <View style={{ borderRadius: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderColor: standing.isMyClan ? colors.accent : colors.wellBorder, backgroundColor: standing.isMyClan ? colors.accentBg : colors.well }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Text style={{ width: 28, fontSize: 12, fontWeight: podium ? '600' : '400', color: podium ?? colors.textFaint }}>#{standing.rank}</Text>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: colors.text }}>
            {standing.clanId ? <ClanLink clanId={standing.clanId} tag={standing.clanTag} name={standing.clanName} /> : `[${standing.clanTag}] ${standing.clanName}`}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{formatNumber(standing.damage)}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.wellBorder }}>
        <View style={{ width: `${standing.percentOfLeader}%`, height: '100%', backgroundColor: podium ?? (standing.isMyClan ? colors.cyan : colors.accent) }} />
      </View>
    </View>
  );
}

function PlayerRanking({ scope, title, refreshTick }: { scope: CorePlayerRankingScope; title: string; refreshTick: number }) {
  const [data, setData] = useState<CorePlayerRankingPageDto | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    getCorePlayerRanking(scope, page)
      .then(setData)
      .catch(() => undefined);
  }, [scope, page, refreshTick]);

  const showClanTag = scope === 'server';
  return (
    <View style={[panel, { paddingTop: 16, overflow: 'hidden' }]}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <SectionLabel>{title}</SectionLabel>
        {/* The viewer's own row, pinned on top. */}
        {data?.viewerEntry && (
          <View style={{ marginBottom: 12 }}>
            <PlayerRankingRow row={data.viewerEntry} showClanTag={showClanTag} />
          </View>
        )}
        {!data ? (
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('core.loading')}</Text>
        ) : data.entries.length === 0 ? (
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('core.noPlayerDamage')}</Text>
        ) : (
          <View style={{ gap: 4 }}>
            {data.entries.map((row) => (
              <PlayerRankingRow key={row.playerId} row={row} showClanTag={showClanTag} />
            ))}
          </View>
        )}
      </View>
      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onChange={setPage} />}
    </View>
  );
}

function PlayerRankingRow({ row, showClanTag }: { row: CorePlayerStandingDto; showClanTag: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        borderRadius: 6,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderColor: row.isCurrentPlayer ? colors.accent : colors.wellBorder,
        backgroundColor: row.isCurrentPlayer ? colors.accentBg : colors.well,
        opacity: row.damage === 0 ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Text style={{ width: 28, fontSize: 12, fontWeight: row.rank === 1 ? '600' : '400', color: row.rank === 1 ? colors.gold : colors.textFaint }}>{row.rank ? `#${row.rank}` : '—'}</Text>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>
          <PlayerLink playerId={row.playerId} username={row.username} isVip={row.isVip} />
          {showClanTag && row.clanTag ? <Text style={{ color: colors.textFaint }}> [{row.clanTag}]</Text> : null}
        </Text>
      </View>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{formatNumber(row.damage)}</Text>
    </View>
  );
}
