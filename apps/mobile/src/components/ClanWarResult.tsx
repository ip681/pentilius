import { Text, View } from 'react-native';
import type { ClanWarHistoryEntryDto } from '@pentilius/shared';
import { ResourceIcon } from '@/components/AssetImage';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** "Won · by points · vs [TAG] Name" — a finished war, as on the web. */
export function WarOutcomeLine({ entry }: { entry: ClanWarHistoryEntryDto }) {
  const color = entry.won === true ? colors.positive : entry.won === false ? colors.danger : colors.textMuted;
  return (
    <Text style={{ fontSize: 12 }}>
      <Text style={{ fontWeight: '600', color }}>{entry.won === true ? t('clans.war.outcomeWon') : entry.won === false ? t('clans.war.outcomeLost') : t('clans.war.outcomeDraw')}</Text>{' '}
      <Text style={{ color: colors.textFaint }}>
        {t(`clans.war.outcomeType.${entry.outcome}`)} · {t('clans.war.vs')} [{entry.opponentClanTag}] {entry.opponentClanName}
      </Text>
    </Text>
  );
}

/** What the war added to or took from the treasury; nothing when unchanged. */
export function TreasuryChanges({ entry }: { entry: ClanWarHistoryEntryDto }) {
  const changes = [
    ['METAL', entry.treasuryMetalChange],
    ['CRYSTAL', entry.treasuryCrystalChange],
    ['CREDITS', entry.treasuryCreditsChange],
  ] as const;
  if (changes.every(([, amount]) => amount === 0)) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {changes
        .filter(([, amount]) => amount !== 0)
        .map(([type, amount]) => (
          <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 10, color: amount > 0 ? colors.positive : colors.danger }}>
              {amount > 0 ? '+' : ''}
              {formatNumber(amount)}
            </Text>
            <ResourceIcon type={type} size={12} />
          </View>
        ))}
    </View>
  );
}
