'use client';

import type { PlayerListEntryDto, Race } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { ClanLink } from '@/components/ClanLink';
import { PlayerLink } from '@/components/PlayerLink';
import { listPlayers } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

const RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

export default function LeaderboardPage() {
  useRequireAuth();
  const t = useTranslations();
  const [players, setPlayers] = useState<PlayerListEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [race, setRace] = useState<Race | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    listPlayers({ race: race === 'ALL' ? undefined : race, search: search || undefined })
      .then(setPlayers)
      .catch(() => setError(t('leaderboard.loadError')));
  }, [race, search, t]);

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('leaderboard.title')}</h1>
        <p className="text-xs text-textMuted">{t('leaderboard.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

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

      <div className="overflow-x-auto rounded-lg border border-panelBorder bg-panel">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-panelBorder bg-panelHeader text-[10px] uppercase text-textFaint">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">{t('leaderboard.player')}</th>
              <th className="px-4 py-3">{t('leaderboard.race')}</th>
              <th className="px-4 py-3">{t('leaderboard.level')}</th>
              <th className="px-4 py-3">{t('leaderboard.clan')}</th>
            </tr>
          </thead>
          <tbody>
            {players?.map((player, index) => (
              <tr key={player.id} className="border-t border-wellBorder">
                <td className="px-4 py-2.5 text-textFaint">{index + 1}</td>
                <td className="px-4 py-2.5">
                  <PlayerLink playerId={player.id} username={player.username} />
                </td>
                <td className="px-4 py-2.5 text-textMuted">{t(`race.${player.race}.name`)}</td>
                <td className="px-4 py-2.5">{player.level}</td>
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
        {players && players.length === 0 && <p className="p-4 text-xs text-textFaint">{t('leaderboard.noResults')}</p>}
      </div>
    </GameLayout>
  );
}
