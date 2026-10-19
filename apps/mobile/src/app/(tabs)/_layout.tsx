import { Redirect, Tabs } from 'expo-router';
import { GameHeader } from '@/components/GameHeader';
import { GameTabBar } from '@/components/GameTabBar';
import { NAV_ITEMS } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

/** Every page: the game's header on top, the scrolling menu of images at the bottom — as on the web. */
export default function TabsLayout() {
  const { ready, profile } = useSession();
  if (ready && !profile) return <Redirect href="/login" />;
  return (
    // Keyed by language, so a language change in Settings redraws every screen in it.
    <Tabs
      key={profile?.preferredLocale ?? 'default'}
      tabBar={(props) => <GameTabBar activeRoute={props.state.routes[props.state.index]?.name} onNavigate={(route) => {
            const target = props.state.routes.find((r) => r.name === route);
            if (target) props.navigateToTab(target.key);
          }} />}
      screenOptions={{ header: () => <GameHeader />, sceneStyle: { backgroundColor: colors.ink } }}
    >
      {NAV_ITEMS.map((item) => (
        <Tabs.Screen key={item.route} name={item.route} />
      ))}
    </Tabs>
  );
}
