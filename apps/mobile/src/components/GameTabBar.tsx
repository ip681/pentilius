import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AssetImage } from '@/components/AssetImage';
import { t } from '@/lib/i18n';
import { NAV_ITEMS } from '@/lib/nav';
import { colors } from '@/theme';

/** The web's mobile BottomNav: one row of the game's images that scrolls sideways. */
// Screens without their own button light up the button they belong to.
const SUB_SCREENS: Record<string, string> = { core: 'zones', bosses: 'zones', 'clan-war': 'clans', research: 'base' };

export function GameTabBar({ activeRoute, onNavigate }: { activeRoute: string | undefined; onNavigate: (route: string) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.inkRaised, borderTopWidth: 1, borderTopColor: colors.panelBorder, paddingBottom: insets.bottom }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {NAV_ITEMS.map((item) => {
          const active = activeRoute === item.route || SUB_SCREENS[activeRoute ?? ''] === item.route || (item.route === 'zones' && !!activeRoute?.startsWith('zone/')) || (item.route === 'clans' && !!activeRoute?.startsWith('clan/')) || (item.route === 'friends' && !!activeRoute?.startsWith('friend/')) || (item.route === 'players' && !!activeRoute?.startsWith('player/'));
          return (
            <Pressable
              key={item.route}
              accessibilityLabel={t(item.labelKey)}
              onPress={() => onNavigate(item.route)}
              style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.accentBgHover : 'transparent' }}
            >
              <View style={{ opacity: active ? 1 : 0.8 }}>
                <AssetImage assetId={`dashboard.${item.iconKey}.icon`} size={36} label={t(item.labelKey)} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
