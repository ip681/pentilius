'use client';

import type { BossFormationDto, Race } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { AssetIcon } from '@/components/AssetIcon';
import { ConfirmButton } from '@/components/ConfirmButton';
import { LootEntry } from '@/components/LootEntry';
import { formatDuration } from '@/lib/format-duration';
import { RACE_BG_CLASS } from '@/lib/race-colors';
import { displayPlayerName } from '@/lib/player-name';

const ALL_RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

/** One formation's 5-race-slot card — join button, visibility toggle, live countdown while OPEN, result summary once resolved. Shared by the full /bosses page and the per-zone boss panel. */
export function BossFormationCard({
  formation,
  now,
  myRace,
  onCooldown,
  onJoin,
  onVisibilityToggle,
}: {
  formation: BossFormationDto;
  now: number;
  myRace: Race | null;
  onCooldown: boolean;
  onJoin: () => void;
  onVisibilityToggle: (next: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean }) => void;
}) {
  const t = useTranslations();
  const isOpen = formation.status === 'OPEN';
  const remainingMs = isOpen ? new Date(formation.resolvesAt).getTime() - now : 0;

  const alreadyIn = formation.slots.some((s) => s.isCurrentPlayer);
  const mySlot = myRace ? formation.slots.find((s) => s.race === myRace) : undefined;
  const canJoin = isOpen && !alreadyIn && mySlot !== undefined && mySlot.playerId === null && !onCooldown;

  const mine = formation.slots.find((s) => s.isCurrentPlayer);

  return (
    <div className="rounded-lg border border-panelBorder bg-well p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-textMuted">
          {t('bosses.createdBy')} <span className={formation.creatorIsVip ? 'text-vipGold' : 'text-text'}>{displayPlayerName(t, formation.creatorUsername)}</span>
        </span>
        {isOpen ? (
          <span className="tabular-nums text-gold">
            {t('bosses.joinWindow')} {formatDuration(remainingMs / 1000)}
          </span>
        ) : (
          <span className={`font-semibold uppercase ${formation.result?.outcome === 'WIN' ? 'text-positive' : formation.result?.outcome === 'LOSS' ? 'text-danger' : 'text-textFaint'}`}>
            {formation.result?.outcome === 'WIN' ? t('bosses.victory') : formation.result?.outcome === 'LOSS' ? t('bosses.defeat') : t('bosses.noOne')}
          </span>
        )}
      </div>

      {formation.canEditVisibility ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-textMuted">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={formation.visibleToClanOnly}
              onChange={(e) => onVisibilityToggle({ visibleToClanOnly: e.target.checked, visibleToFriendsOnly: formation.visibleToFriendsOnly })}
              className="accent-accent"
            />
            {t('market.clanOnly')}
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={formation.visibleToFriendsOnly}
              onChange={(e) => onVisibilityToggle({ visibleToClanOnly: formation.visibleToClanOnly, visibleToFriendsOnly: e.target.checked })}
              className="accent-accent"
            />
            {t('market.friendsOnly')}
          </label>
          {formation.visibilityEditDeadline && (
            <span className="tabular-nums text-textFaint">
              {t('bosses.visibilityEditWindow')} {formatDuration(Math.max(0, (new Date(formation.visibilityEditDeadline).getTime() - now) / 1000))}
            </span>
          )}
        </div>
      ) : (
        (formation.visibleToClanOnly || formation.visibleToFriendsOnly) && (
          <p className="mb-3 text-[11px] text-gold">
            {formation.visibleToClanOnly && formation.visibleToFriendsOnly
              ? t('market.visibilityClanAndFriends')
              : formation.visibleToClanOnly
                ? t('market.visibilityClanOnly')
                : t('market.visibilityFriendsOnly')}
          </p>
        )
      )}

      <div className="mb-3 grid grid-cols-5 gap-1.5">
        {ALL_RACES.map((race) => {
          const slot = formation.slots.find((s) => s.race === race);
          const filled = Boolean(slot?.playerId);
          return (
            <div
              key={race}
              className={`flex flex-col items-center gap-1 rounded-md border p-2 text-center ${filled ? RACE_BG_CLASS[race] + ' border-transparent' : 'border-dashed border-wellBorder opacity-50'}`}
            >
              <AssetIcon
                assetId={`races.${race.toLowerCase()}.icon`}
                alt={t(`race.${race}.name`)}
                className="h-6 w-6 object-contain"
                fallback={<span className="text-xs font-semibold">{t(`race.${race}.name`).charAt(0)}</span>}
              />
              <span className={`w-full truncate text-[10px] ${slot?.playerIsVip ? 'text-vipGold' : 'text-text'}`}>{slot?.playerUsername ? displayPlayerName(t, slot.playerUsername) : t('bosses.emptySlot')}</span>
            </div>
          );
        })}
      </div>

      {canJoin && (
        <ConfirmButton
          label={t('bosses.join')}
          confirmLabel={t('common.confirm')}
          cancelLabel={t('common.cancel')}
          message={t('bosses.joinConfirm')}
          onConfirm={onJoin}
          className="w-full rounded-md border border-accent bg-accentBg py-2 text-xs uppercase text-text hover:bg-accentBgHover"
          confirmClassName="flex-1 rounded-md border border-accent bg-accentBg py-2 text-xs uppercase text-text hover:bg-accentBgHover"
          cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel py-2 text-xs uppercase text-textMuted hover:bg-accentBgHover"
        />
      )}

      {formation.result && mine && (
        <div className="mt-3 rounded border border-wellBorder bg-ink p-2.5 text-[11px]">
          <p className="text-textFaint">
            {t('bosses.totalDamage')}: <span className="text-text">{formation.result.totalDamageDealt}</span>
          </p>
          {formation.result.outcome === 'WIN' && mine.xpGained !== null && (
            <>
              <p className="mt-1 text-textFaint">
                +{mine.xpGained} {t('pve.xpGained')}
              </p>
              {mine.lootSummary && mine.lootSummary.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {mine.lootSummary.map((loot, index) => (
                    <li key={index}>
                      <LootEntry loot={loot} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
