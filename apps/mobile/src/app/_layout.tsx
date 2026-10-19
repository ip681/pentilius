import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/lib/session';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider style={{ backgroundColor: colors.ink }}>
      <SessionProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink } }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
