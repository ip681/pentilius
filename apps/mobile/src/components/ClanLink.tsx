import { Text, TextStyle } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/theme';

/** "[TAG] Name" that opens the clan's public page (the web's ClanLink). */
export function ClanLink({ clanId, tag, name, style }: { clanId: string; tag: string; name?: string; style?: TextStyle }) {
  return (
    <Text
      onPress={() => router.navigate({ pathname: '/clan/[id]', params: { id: clanId } })}
      style={[{ color: colors.text, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }, style]}
    >
      [{tag}]{name ? ` ${name}` : ''}
    </Text>
  );
}
