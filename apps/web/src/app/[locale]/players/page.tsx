'use client';

import type {
  ClanLeaderboardEntryDto,
  ClanLeaderboardPageDto,
  ClanLeaderboardSortBy,
  PlayerLeaderboardEntryDto,
  PlayerLeaderboardPageDto,
  PlayerLeaderboardSortBy,
  Race,
} from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ClanLink } from '@/components/ClanLink';
import { GameLayout } from '@/components/GameLayout';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { PlayerLink } from '@/components/PlayerLink';
import { getClanLeaderboard, listPlayers } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

const RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];
const PAGE_SIZE = 20;

function pill(active: boolean) {
  return `rounded px-2.5 py-1.5 text-xs uppercase ${active ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`;
}

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const t = useTranslations();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-panelBorder px-4 py-3 text-xs text-textMuted">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="rounded border border-wellBorder bg-well px-3 py-1.5 disabled:opacity-40"
      >
        {t('leaderboard.pagePrev')}
      </button>
      <span>{t('leaderboard.pageInfo', { page, total: totalPages })}</span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded border border-wellBorder bg-well px-3 py-1.5 disabled:opacity-40"
      >
        {t('leaderboard.pageNext')}
      </button>
    </div>
  );
}

function PlayersTab() {
  const t = useTranslations();
  const [data, setData] = useState<PlayerLeaderboardPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [race, setRace] = useState<Race | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<PlayerLeaderboardSortBy>('level');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [race, search, sortBy]);

  useEffect(() => {
    listPlayers({ race: race === 'ALL' ? undefined : race, search: search || undefined, sortBy, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch(() => setError(t('leaderboard.loadError')));
  }, [race, search, sortBy, page, t]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-xs text-textMuted">
          {t('leaderboard.searchLabel')}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('leaderboard.searchPlaceholder')}
            className="w-56 rounded-md border border-wellBorder bg-well px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-textMuted">
          {t('leaderboard.raceLabel')}
          <select
            value={race}
            onChange={(e) => setRace(e.target.value as Race | 'ALL')}
            className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm text-text outline-none focus:border-accent"
          >
            <option value="ALL">{t('leaderboard.allRaces')}</option>
            {RACES.map((r) => (
              <option key={r} value={r}>
                {t(`race.${r}.name`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['level', 'pvpWins', 'clanWarDamage', 'bossPoints'] as PlayerLeaderboardSortBy[]).map((s) => (
          <button key={s} type="button" onClick={() => setSortBy(s)} className={pill(sortBy === s)}>
            {t(`leaderboard.sortBy${s === 'level' ? 'Level' : s === 'pvpWins' ? 'PvpWins' : s === 'clanWarDamage' ? 'ClanWarDamage' : 'BossPoints'}`)}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {data?.viewerEntry && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent bg-accentBg px-4 py-2.5 text-xs">
          <span className="font-semibold uppercase text-textFaint">{t('leaderboard.yourPosition')}</span>
          <PlayerAvatarFrame avatarKey={data.viewerEntry.selectedAvatarKey} frameKey={data.viewerEntry.selectedFrameKey} className="h-6 w-6" />
          <PlayerLink playerId={data.viewerEntry.id} username={data.viewerEntry.username} />
          <span className="tabular-nums">#{data.viewerEntry.globalRank}</span>
          <span className="text-textFaint">{t('leaderboard.raceRankLabel', { rank: data.viewerEntry.raceRank })}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-panelBorder bg-panel">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-panelBorder bg-panelHeader text-[10px] uppercase text-textFaint">
              <th className="px-4 py-3">{t('leaderboard.rank')}</th>
              <th className="px-4 py-3">{t('leaderboard.player')}</th>
              <th className="px-4 py-3">{t('leaderboard.race')}</th>
              <th className="px-4 py-3">{t('leaderboard.level')}</th>
              <th className="px-4 py-3">{t('leaderboard.pvpWins')}</th>
              <th className="px-4 py-3">{t('leaderboard.clanWarDamage')}</th>
              <th className="px-4 py-3">{t('leaderboard.bossPoints')}</th>
              <th className="px-4 py-3">{t('leaderboard.clan')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.entries.map((player: PlayerLeaderboardEntryDto) => (
              <tr
                key={player.id}
                className={`border-t border-wellBorder ${player.isCurrentPlayer ? 'bg-accentBg' : ''}`}
              >
                <td className="px-4 py-2.5 text-textFaint">
                  <div>#{player.globalRank}</div>
                  <div className="text-[10px] text-textFaint">{t('leaderboard.raceRankLabel', { rank: player.raceRank })}</div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <PlayerAvatarFrame avatarKey={player.selectedAvatarKey} frameKey={player.selectedFrameKey} className="h-8 w-8" />
                    <PlayerLink playerId={player.id} username={player.username} />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-textMuted">
                  <div className="flex items-center gap-1.5">
                    <AssetIcon
                      assetId={`races.${player.race.toLowerCase()}.icon`}
                      alt={t(`race.${player.race}.name`)}
                      className="h-4 w-4 object-contain"
                      fallback={<div className="h-4 w-4 rounded-sm bg-accent opacity-60" />}
                    />
                    {t(`race.${player.race}.name`)}
                  </div>
                </td>
                <td className="px-4 py-2.5">{player.level}</td>
                <td className="px-4 py-2.5">{player.pvpWins}</td>
                <td className="px-4 py-2.5">{player.clanWarDamageDealt}</td>
                <td className="px-4 py-2.5">{player.bossFormationPoints}</td>
                <td className="px-4 py-2.5">
                  {player.clanId && player.clanTag ? (
                    <ClanLink clanId={player.clanId} tag={player.clanTag} />
                  ) : (
                    <span className="text-textFaint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.entries.length === 0 && <p className="p-4 text-xs text-textFaint">{t('leaderboard.noResults')}</p>}
        {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onChange={setPage} />}
      </div>
    </>
  );
}

function ClansTab() {
  const t = useTranslations();
  const [data, setData] = useState<ClanLeaderboardPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<ClanLeaderboardSortBy>('wars');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [sortBy]);

  useEffect(() => {
    getClanLeaderboard({ sortBy, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch(() => setError(t('leaderboard.loadError')));
  }, [sortBy, page, t]);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['wars', 'avgLevel'] as ClanLeaderboardSortBy[]).map((s) => (
          <button key={s} type="button" onClick={() => setSortBy(s)} className={pill(sortBy === s)}>
            {t(`leaderboard.sortBy${s === 'wars' ? 'Wars' : 'AvgLevel'}`)}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {data?.viewerEntry && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent bg-accentBg px-4 py-2.5 text-xs">
          <span className="font-semibold uppercase text-textFaint">{t('leaderboard.yourClanPosition')}</span>
          <ClanLink clanId={data.viewerEntry.id} tag={data.viewerEntry.tag} name={data.viewerEntry.name} />
          <span className="tabular-nums">#{data.viewerEntry.rank}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-panelBorder bg-panel">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-panelBorder bg-panelHeader text-[10px] uppercase text-textFaint">
              <th className="px-4 py-3">{t('leaderboard.clanRank')}</th>
              <th className="px-4 py-3">{t('leaderboard.clanName')}</th>
              <th className="px-4 py-3">{t('leaderboard.members')}</th>
              <th className="px-4 py-3">{t('leaderboard.avgLevel')}</th>
              <th className="px-4 py-3">{t('leaderboard.totalWars')}</th>
              <th className="px-4 py-3">{t('leaderboard.conquestWins')}</th>
              <th className="px-4 py-3">{t('leaderboard.decisionWins')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.entries.map((clan: ClanLeaderboardEntryDto) => (
              <tr key={clan.id} className={`border-t border-wellBorder ${clan.isMyClan ? 'bg-accentBg' : ''}`}>
                <td className="px-4 py-2.5 text-textFaint">#{clan.rank}</td>
                <td className="px-4 py-2.5">
                  <ClanLink clanId={clan.id} tag={clan.tag} name={clan.name} />
                </td>
                <td className="px-4 py-2.5">{clan.memberCount}</td>
                <td className="px-4 py-2.5">{clan.averageMemberLevel}</td>
                <td className="px-4 py-2.5">{clan.totalWars}</td>
                <td className="px-4 py-2.5">{clan.conquestWins}</td>
                <td className="px-4 py-2.5">{clan.decisionWins}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.entries.length === 0 && <p className="p-4 text-xs text-textFaint">{t('leaderboard.noClanResults')}</p>}
        {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onChange={setPage} />}
      </div>
    </>
  );
}

export default function LeaderboardPage() {
  useRequireAuth();
  const t = useTranslations();
  const [tab, setTab] = useState<'players' | 'clans'>('players');

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('leaderboard.title')}</h1>
        <p className="text-xs text-textMuted">{t('leaderboard.subtitle')}</p>
      </div>

      <div className="mb-4 flex gap-1.5">
        <button type="button" onClick={() => setTab('players')} className={pill(tab === 'players')}>
          {t('leaderboard.tabPlayers')}
        </button>
        <button type="button" onClick={() => setTab('clans')} className={pill(tab === 'clans')}>
          {t('leaderboard.tabClans')}
        </button>
      </div>

      {tab === 'players' ? <PlayersTab /> : <ClansTab />}
    </GameLayout>
  );
}
