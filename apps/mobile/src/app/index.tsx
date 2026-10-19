import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

/** Start: wait for the saved session, then go to the game or to the login. */
export default function Start() {
  const { ready, profile } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink }}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }
  return <Redirect href={profile ? '/home' : '/login'} />;
}
