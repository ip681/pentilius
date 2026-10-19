import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PlayerProfileDto } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { StatBar } from '@/components/StatBar';
import { ASSET_BASE_URL } from '@/lib/config';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

function isVip(profile: PlayerProfileDto): boolean {
  return !!profile.vipUntil && new Date(profile.vipUntil).getTime() > Date.now();
}

/**
 * The web's TopBar as it looks on a phone: logo, avatar + name, Info /
 * Settings / Logout; then the energy and XP bars and the resources row.
 */
export function GameHeader() {
  const { profile, logout } = useSession();
  const insets = useSafeAreaInsets();
  if (!profile) return null;

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.inkRaised, borderBottomWidth: 1, borderBottomColor: colors.panelBorder }}>
      <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Image source={{ uri: `${ASSET_BASE_URL}/logo.png` }} style={{ height: 56, width: 93 }} contentFit="contain" cachePolicy="disk" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <PlayerAvatarFrame avatarKey={profile.selectedAvatarKey} frameKey={profile.selectedFrameKey} size={40} />
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, fontWeight: '600', color: isVip(profile) ? colors.vipGold : colors.text }}>
              {profile.username}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <HeaderIcon assetId="interface.info.icon" label={t('topbar.info')} onPress={() => router.navigate('/info')} />
          <HeaderIcon assetId="interface.settings.icon" label={t('topbar.settings')} onPress={() => router.navigate('/settings')} />
          <HeaderIcon
            assetId="interface.exit.icon"
            label={t('topbar.logout')}
            onPress={async () => {
              await logout();
              router.replace('/login');
            }}
          />
        </View>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.panelBorder, paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatBar
            label={t('dashboard.energy')}
            icon="interface.energy.icon"
            hideLabelText
            current={profile.energy.current}
            max={profile.energy.max}
            color={colors.energy}
            countdownTarget={profile.energy.nextRegenAt}
          />
          <StatBar label={`${t('dashboard.level')} ${profile.level}`} icon="interface.experience.icon" current={profile.xp} max={profile.xpForNextLevel} color={colors.cyan} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
          {(['METAL', 'CRYSTAL', 'CREDITS'] as const).map((type) => (
            <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ResourceIcon type={type} size={12} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text }}>
                {formatNumber(profile.resources[type.toLowerCase() as 'metal' | 'crystal' | 'credits'])}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function HeaderIcon({ assetId, label, onPress }: { assetId: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6} style={({ pressed }) => ({ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <AssetImage assetId={assetId} size={16} label={label} />
    </Pressable>
  );
}
