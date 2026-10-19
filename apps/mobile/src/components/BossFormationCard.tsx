import { Text, View } from 'react-native';
import type { BossFormationDto, Race } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { CheckRow, ConfirmButton } from '@/components/ConfirmButton';
import { LootEntry } from '@/components/LootEntry';
import { formatDuration } from '@/lib/duration';
import { t } from '@/lib/i18n';
import { displayPlayerName } from '@/lib/player-name';
import { colors, RACE_TINT } from '@/theme';

const ALL_RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

/** One formation's 5-race-slot card — join, visibility, countdown, result (the web's BossFormationCard). */
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
  const isOpen = formation.status === 'OPEN';
  const remainingMs = isOpen ? new Date(formation.resolvesAt).getTime() - now : 0;
  const alreadyIn = formation.slots.some((s) => s.isCurrentPlayer);
  const mySlot = myRace ? formation.slots.find((s) => s.race === myRace) : undefined;
  const canJoin = isOpen && !alreadyIn && mySlot !== undefined && mySlot.playerId === null && !onCooldown;
  const mine = formation.slots.find((s) => s.isCurrentPlayer);
  const outcome = formation.result?.outcome;

  return (
    <View style={{ borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.well, borderRadius: 8, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>
          {t('bosses.createdBy')} <Text style={{ color: formation.creatorIsVip ? colors.vipGold : colors.text }}>{displayPlayerName(formation.creatorUsername)}</Text>
        </Text>
        {isOpen ? (
          <Text style={{ fontSize: 12, color: colors.gold }}>
            {t('bosses.joinWindow')} {formatDuration(remainingMs / 1000)}
          </Text>
        ) : (
          <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', color: outcome === 'WIN' ? colors.positive : outcome === 'LOSS' ? colors.danger : colors.textFaint }}>
            {outcome === 'WIN' ? t('bosses.victory') : outcome === 'LOSS' ? t('bosses.defeat') : t('bosses.noOne')}
          </Text>
        )}
      </View>

      {formation.canEditVisibility ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <CheckRow
            label={t('market.clanOnly')}
            checked={formation.visibleToClanOnly}
            onChange={(v) => onVisibilityToggle({ visibleToClanOnly: v, visibleToFriendsOnly: formation.visibleToFriendsOnly })}
          />
          <CheckRow
            label={t('market.friendsOnly')}
            checked={formation.visibleToFriendsOnly}
            onChange={(v) => onVisibilityToggle({ visibleToClanOnly: formation.visibleToClanOnly, visibleToFriendsOnly: v })}
          />
          {formation.visibilityEditDeadline && (
            <Text style={{ fontSize: 11, color: colors.textFaint }}>
              {t('bosses.visibilityEditWindow')} {formatDuration(Math.max(0, (new Date(formation.visibilityEditDeadline).getTime() - now) / 1000))}
            </Text>
          )}
        </View>
      ) : (
        (formation.visibleToClanOnly || formation.visibleToFriendsOnly) && (
          <Text style={{ fontSize: 11, color: colors.gold }}>
            {formation.visibleToClanOnly && formation.visibleToFriendsOnly
              ? t('market.visibilityClanAndFriends')
              : formation.visibleToClanOnly
                ? t('market.visibilityClanOnly')
                : t('market.visibilityFriendsOnly')}
          </Text>
        )
      )}

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {ALL_RACES.map((race) => {
          const slot = formation.slots.find((s) => s.race === race);
          const filled = Boolean(slot?.playerId);
          return (
            <View
              key={race}
              style={{
                flex: 1,
                alignItems: 'center',
                gap: 4,
                borderRadius: 6,
                padding: 8,
                borderWidth: 1,
                borderStyle: filled ? 'solid' : 'dashed',
                borderColor: filled ? 'transparent' : colors.wellBorder,
                backgroundColor: filled ? RACE_TINT[race] : 'transparent',
                opacity: filled ? 1 : 0.5,
              }}
            >
              <AssetImage assetId={`races.${race.toLowerCase()}.icon`} size={24} label={t(`race.${race}.name`)} />
              <Text numberOfLines={1} style={{ fontSize: 10, color: slot?.playerIsVip ? colors.vipGold : colors.text }}>
                {slot?.playerUsername ? displayPlayerName(slot.playerUsername) : t('bosses.emptySlot')}
              </Text>
            </View>
          );
        })}
      </View>

      {canJoin && <ConfirmButton label={t('bosses.join')} message={t('bosses.joinConfirm')} onConfirm={onJoin} />}

      {formation.result && mine && (
        <View style={{ borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.ink, borderRadius: 4, padding: 10, gap: 4 }}>
          <Text style={{ fontSize: 11, color: colors.textFaint }}>
            {t('bosses.totalDamage')}: <Text style={{ color: colors.text }}>{formation.result.totalDamageDealt}</Text>
          </Text>
          {formation.result.outcome === 'WIN' && mine.xpGained !== null && (
            <>
              <Text style={{ fontSize: 11, color: colors.textFaint }}>
                +{mine.xpGained} {t('pve.xpGained')}
              </Text>
              {mine.lootSummary?.map((loot, index) => (
                <LootEntry key={index} loot={loot} />
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
}
