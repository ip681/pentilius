import { ReactNode, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { ClanLeaderboardPageDto, ClanLeaderboardSortBy, PlayerLeaderboardPageDto, PlayerLeaderboardSortBy, Race } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { ClanLink } from '@/components/ClanLink';
import { Pagination } from '@/components/Pagination';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { PlayerLink } from '@/components/PlayerLink';
import { CloseLink } from '@/components/ReportSheet';
import { ScreenTitle } from '@/components/ScreenTitle';
import { SheetOption } from '@/components/SheetButtons';
import { Sheet } from '@/components/ui';
import { getClanLeaderboard, listPlayers } from '@/lib/api';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

const RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];
const PAGE_SIZE = 20;
const PLAYER_SORT_KEY: Record<PlayerLeaderboardSortBy, string> = {
  level: 'leaderboard.sortByLevel',
  pvpWins: 'leaderboard.sortByPvpWins',
  clanWarDamage: 'leaderboard.sortByClanWarDamage',
  bossPoints: 'leaderboard.sortByBossPoints',
};

// The web's Leaderboard page (apps/web/src/app/(player)/[locale]/players/page.tsx), as on a phone.
export default function LeaderboardScreen() {
  const [tab, setTab] = useState<'players' | 'clans'>('players');
  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <ScreenTitle title={t('leaderboard.title')} subtitle={t('leaderboard.subtitle')} />
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
        <Pill label={t('leaderboard.tabPlayers')} active={tab === 'players'} onPress={() => setTab('players')} />
        <Pill label={t('leaderboard.tabClans')} active={tab === 'clans'} onPress={() => setTab('clans')} />
      </View>
      {tab === 'players' ? <PlayersTab /> : <ClansTab />}
    </ScrollView>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ borderRadius: 4, borderWidth: 1, borderColor: active ? colors.textFaint : colors.accent, backgroundColor: active ? colors.accentBgHover : colors.accentBg, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ fontSize: 12, textTransform: 'uppercase', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

function PlayersTab() {
  const [data, setData] = useState<PlayerLeaderboardPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [race, setRace] = useState<Race | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<PlayerLeaderboardSortBy>('level');
  const [page, setPage] = useState(1);
  const [racePickerOpen, setRacePickerOpen] = useState(false);

  useEffect(() => setPage(1), [race, search, sortBy]);
  useEffect(() => {
    listPlayers({ race: race === 'ALL' ? undefined : race, search: search || undefined, sortBy, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch(() => setError(t('leaderboard.loadError')));
  }, [race, search, sortBy, page]);

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
        <View style={{ flex: 1, minWidth: 160, gap: 6 }}>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('leaderboard.searchLabel')}</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('leaderboard.searchPlaceholder')}
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colors.text }}
          />
        </View>
        {/* A dropdown for one-of-many choices, as on the web. */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('leaderboard.raceLabel')}</Text>
          <Pressable onPress={() => setRacePickerOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Text style={{ fontSize: 14, color: colors.text }}>{race === 'ALL' ? t('leaderboard.allRaces') : t(`race.${race}.name`)}</Text>
            <Text style={{ fontSize: 10, color: colors.textFaint }}>▾</Text>
          </Pressable>
        </View>
      </View>
      <Sheet open={racePickerOpen} onClose={() => setRacePickerOpen(false)}>
        {(['ALL', ...RACES] as const).map((r) => (
          <SheetOption
            key={r}
            label={r === 'ALL' ? t('leaderboard.allRaces') : t(`race.${r}.name`)}
            onPress={() => {
              setRace(r);
              setRacePickerOpen(false);
            }}
          />
        ))}
        <CloseLink onPress={() => setRacePickerOpen(false)} />
      </Sheet>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {(Object.keys(PLAYER_SORT_KEY) as PlayerLeaderboardSortBy[]).map((s) => (
          <Pill key={s} label={t(PLAYER_SORT_KEY[s])} active={sortBy === s} onPress={() => setSortBy(s)} />
        ))}
      </View>

      {error && <Text style={{ marginBottom: 16, color: '#f87171' }}>{error}</Text>}

      {data?.viewerEntry && (
        <View style={yourPosition}>
          <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', color: colors.textFaint }}>{t('leaderboard.yourPosition')}</Text>
          <PlayerAvatarFrame avatarKey={data.viewerEntry.selectedAvatarKey} frameKey={data.viewerEntry.selectedFrameKey} size={24} />
          <Text style={{ fontSize: 12 }}>
            <PlayerLink playerId={data.viewerEntry.id} username={data.viewerEntry.username} isVip={data.viewerEntry.isVip} />
          </Text>
          <Text style={{ fontSize: 12, color: colors.text }}>#{data.viewerEntry.globalRank}</Text>
          <Text style={{ fontSize: 12, color: colors.textFaint }}>{t('leaderboard.raceRankLabel', { rank: data.viewerEntry.raceRank })}</Text>
        </View>
      )}

      <Table
        columns={[
          ['leaderboard.rank', 80],
          ['leaderboard.player', 180],
          ['leaderboard.race', 120],
          ['leaderboard.level', 70],
          ['leaderboard.pvpWins', 90],
          ['leaderboard.clanWarDamage', 120],
          ['leaderboard.bossPoints', 100],
          ['leaderboard.clan', 90],
        ]}
        rows={(data?.entries ?? []).map((player) => ({
          key: player.id,
          highlighted: player.isCurrentPlayer,
          cells: [
            <View key="rank">
              <Text style={{ fontSize: 13, color: colors.textFaint }}>#{player.globalRank}</Text>
              <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('leaderboard.raceRankLabel', { rank: player.raceRank })}</Text>
            </View>,
            <View key="player" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PlayerAvatarFrame avatarKey={player.selectedAvatarKey} frameKey={player.selectedFrameKey} size={32} />
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13 }}>
                <PlayerLink playerId={player.id} username={player.username} isVip={player.isVip} />
              </Text>
            </View>,
            <View key="race" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AssetImage assetId={`races.${player.race.toLowerCase()}.icon`} size={16} label="" hideFallback />
              <Text style={{ fontSize: 13, color: colors.textMuted }}>{t(`race.${player.race}.name`)}</Text>
            </View>,
            <Cell key="level">{player.level}</Cell>,
            <Cell key="pvp">{player.pvpWins}</Cell>,
            <Cell key="war">{player.clanWarDamageDealt}</Cell>,
            <Cell key="boss">{player.bossFormationPoints}</Cell>,
            player.clanId && player.clanTag ? (
              <Text key="clan" style={{ fontSize: 13 }}>
                <ClanLink clanId={player.clanId} tag={player.clanTag} />
              </Text>
            ) : (
              <Text key="clan" style={{ fontSize: 13, color: colors.textFaint }}>
                —
              </Text>
            ),
          ],
        }))}
        empty={data && data.entries.length === 0 ? t('leaderboard.noResults') : null}
        footer={data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onChange={setPage} />}
      />
    </>
  );
}

function ClansTab() {
  const [data, setData] = useState<ClanLeaderboardPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<ClanLeaderboardSortBy>('wars');
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [sortBy]);
  useEffect(() => {
    getClanLeaderboard({ sortBy, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch(() => setError(t('leaderboard.loadError')));
  }, [sortBy, page]);

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
        <Pill label={t('leaderboard.sortByWars')} active={sortBy === 'wars'} onPress={() => setSortBy('wars')} />
        <Pill label={t('leaderboard.sortByAvgLevel')} active={sortBy === 'avgLevel'} onPress={() => setSortBy('avgLevel')} />
      </View>
      {error && <Text style={{ marginBottom: 16, color: '#f87171' }}>{error}</Text>}
      {data?.viewerEntry && (
        <View style={yourPosition}>
          <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', color: colors.textFaint }}>{t('leaderboard.yourClanPosition')}</Text>
          <Text style={{ fontSize: 12 }}>
            <ClanLink clanId={data.viewerEntry.id} tag={data.viewerEntry.tag} name={data.viewerEntry.name} />
          </Text>
          <Text style={{ fontSize: 12, color: colors.text }}>#{data.viewerEntry.rank}</Text>
        </View>
      )}
      <Table
        columns={[
          ['leaderboard.clanRank', 70],
          ['leaderboard.clanName', 180],
          ['leaderboard.members', 90],
          ['leaderboard.avgLevel', 90],
          ['leaderboard.totalWars', 90],
          ['leaderboard.conquestWins', 110],
          ['leaderboard.decisionWins', 110],
        ]}
        rows={(data?.entries ?? []).map((clan) => ({
          key: clan.id,
          highlighted: clan.isMyClan,
          cells: [
            <Text key="rank" style={{ fontSize: 13, color: colors.textFaint }}>
              #{clan.rank}
            </Text>,
            <Text key="name" numberOfLines={1} style={{ fontSize: 13 }}>
              <ClanLink clanId={clan.id} tag={clan.tag} name={clan.name} />
            </Text>,
            <Cell key="members">{clan.memberCount}</Cell>,
            <Cell key="avg">{clan.averageMemberLevel}</Cell>,
            <Cell key="wars">{clan.totalWars}</Cell>,
            <Cell key="conquest">{clan.conquestWins}</Cell>,
            <Cell key="decision">{clan.decisionWins}</Cell>,
          ],
        }))}
        empty={data && data.entries.length === 0 ? t('leaderboard.noClanResults') : null}
        footer={data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onChange={setPage} />}
      />
    </>
  );
}

const yourPosition = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentBg, paddingHorizontal: 16, paddingVertical: 10 } as const;

function Cell({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 13, color: colors.text }}>{children}</Text>;
}

/** The web's leaderboard table; on a phone it scrolls sideways, the pages stay below it. */
function Table({ columns, rows, empty, footer }: { columns: [string, number][]; rows: { key: string; highlighted: boolean; cells: ReactNode[] }[]; empty: string | null; footer: ReactNode }) {
  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel, overflow: 'hidden' }}>
      <ScrollView horizontal>
        <View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.panelBorder, backgroundColor: colors.panelHeader }}>
            {columns.map(([key, width]) => (
              <Text key={key} style={{ width, paddingHorizontal: 16, paddingVertical: 12, fontSize: 10, textTransform: 'uppercase', color: colors.textFaint }}>
                {t(key)}
              </Text>
            ))}
          </View>
          {rows.map((row) => (
            <View key={row.key} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.wellBorder, backgroundColor: row.highlighted ? colors.accentBg : 'transparent' }}>
              {row.cells.map((cell, index) => (
                <View key={index} style={{ width: columns[index][1], paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' }}>
                  {cell}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {empty && <Text style={{ padding: 16, fontSize: 12, color: colors.textFaint }}>{empty}</Text>}
      {footer}
    </View>
  );
}
