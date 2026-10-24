'use client';

import type { BossFormationSlotDto, Race } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { AssetIcon } from './AssetIcon';
import { PlayerAvatarFrame } from './PlayerAvatarFrame';
import { displayPlayerName } from '@/lib/player-name';
import { RACE_BG_CLASS, RACE_BG_FAINT_CLASS } from '@/lib/race-colors';

const ALL_RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

// A boss formation's five race slots (owner decision, 2026-10-21) — the same on
// the boss page and in the Command Center: one box per race on its race color,
// the player's picture (or, when free, a faded race icon on a fainter race
// color with a dashed edge) — both as big — and the name under it. Your own
// slot is outlined.
// `raceBadge` adds a small race icon in a taken slot's corner (boss page only).
export function FormationSlots({ slots, raceBadge = false }: { slots: BossFormationSlotDto[]; raceBadge?: boolean }) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {ALL_RACES.map((race) => {
        const slot = slots.find((s) => s.race === race);
        const taken = Boolean(slot?.playerId);
        const picture = taken && Boolean(slot?.playerAvatarKey || slot?.playerFrameKey);
        const raceIcon = (className: string) => (
          <AssetIcon
            assetId={`races.${race.toLowerCase()}.icon`}
            alt={t(`race.${race}.name`)}
            className={className}
            fallback={<span className="text-xs font-semibold">{t(`race.${race}.name`).charAt(0)}</span>}
          />
        );
        return (
          <div
            key={race}
            title={t(`race.${race}.name`)}
            className={`relative flex min-w-0 flex-col items-center gap-1 rounded-md border p-1.5 text-center ${
              taken
                ? `${RACE_BG_CLASS[race]} ${slot?.isCurrentPlayer ? 'border-accent' : 'border-transparent'}`
                : `${RACE_BG_FAINT_CLASS[race]} border-dashed border-wellBorder`
            }`}
          >
            <div className="flex aspect-square w-full max-w-[64px] items-center justify-center">
              {picture ? (
                <PlayerAvatarFrame avatarKey={slot!.playerAvatarKey} frameKey={slot!.playerFrameKey} className="h-[80%] w-[80%]" />
              ) : (
                raceIcon(`h-[80%] w-[80%] object-contain ${taken ? '' : 'opacity-50'}`)
              )}
            </div>
            {raceBadge && picture && <span className="absolute right-1 top-1">{raceIcon('h-3.5 w-3.5 object-contain')}</span>}
            <span className={`w-full truncate text-[10px] ${slot?.playerIsVip ? 'text-vipGold' : taken ? 'text-text' : 'text-textFaint'}`}>
              {taken && slot?.playerUsername ? displayPlayerName(t, slot.playerUsername) : t('bosses.emptySlot')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
