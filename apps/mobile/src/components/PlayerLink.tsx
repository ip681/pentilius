import { Text, TextStyle } from 'react-native';
import { router } from 'expo-router';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

const DELETED_PLAYER_PREFIX = '~deleted~';

/** A player's name that opens their profile; VIP names in gold; a deleted account as muted text. */
export function PlayerLink({ playerId, username, isVip = false, style }: { playerId: string; username: string; isVip?: boolean; style?: TextStyle }) {
  if (username.startsWith(DELETED_PLAYER_PREFIX)) {
    return <Text style={[{ fontStyle: 'italic', color: colors.textFaint }, style]}>{t('common.deletedPlayer')}</Text>;
  }
  return (
    <Text
      onPress={() => router.navigate({ pathname: '/player/[id]', params: { id: playerId } })}
      style={[{ color: isVip ? colors.vipGold : colors.text, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }, style]}
    >
      {username}
    </Text>
  );
}
