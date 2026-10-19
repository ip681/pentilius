import type { ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const TAB = (icon: IconName) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} color={String(color ?? colors.textFaint)} size={size} />;

/** The bottom menu: the main parts of the game, one tap away. */
export default function TabsLayout() {
  const { ready, profile } = useSession();
  if (ready && !profile) return <Redirect href="/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.ink },
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.panelBorder },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('nav.commandCenter'), tabBarIcon: TAB('grid-outline') }} />
      <Tabs.Screen name="base" options={{ title: t('nav.base'), tabBarIcon: TAB('business-outline') }} />
      <Tabs.Screen name="zones" options={{ title: t('nav.zones'), tabBarIcon: TAB('map-outline') }} />
      <Tabs.Screen name="robot" options={{ title: t('nav.robot'), tabBarIcon: TAB('hardware-chip-outline') }} />
      <Tabs.Screen name="more" options={{ title: t('mobile.more'), tabBarIcon: TAB('ellipsis-horizontal') }} />
    </Tabs>
  );
}
