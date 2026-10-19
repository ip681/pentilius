import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Muted, Panel, ProgressBar, Title } from '@/components/ui';
import { colors } from '@/theme';

/** Command Center — first version: who you are, resources, energy, XP. */
export default function HomeScreen() {
  const { profile, refresh } = useSession();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (!profile) return null;

  const xpShare = profile.xpForNextLevel ? profile.xp / profile.xpForNextLevel : 1;
  const energyShare = profile.energy.max ? profile.energy.current / profile.energy.max : 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
        <Panel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AssetImage assetId={`avatars.${profile.selectedAvatarKey}.icon`} size={56} label={profile.username} />
            <View style={{ flex: 1, gap: 2 }}>
              <Title>{t('dashboard.title')}</Title>
              <Text style={{ color: colors.text, fontSize: 16 }}>
                {profile.username} · {t('dashboard.level')} {profile.level}
              </Text>
              <Muted>{t(`race.${profile.race}.name`)}</Muted>
            </View>
          </View>
        </Panel>

        <Panel>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {(['METAL', 'CRYSTAL', 'CREDITS'] as const).map((type) => (
              <View key={type} style={{ alignItems: 'center', flex: 1, gap: 4 }}>
                <ResourceIcon type={type} size={28} />
                <Muted>{t(`resource.${type}`)}</Muted>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                  {formatNumber(profile.resources[type.toLowerCase() as 'metal' | 'crystal' | 'credits'])}
                </Text>
              </View>
            ))}
          </View>
        </Panel>

        <Panel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AssetImage assetId="interface.energy.icon" size={20} label="E" />
            <Muted>
              {t('dashboard.energy')}: {profile.energy.current}/{profile.energy.max}
            </Muted>
          </View>
          <ProgressBar share={energyShare} color={colors.energy} height={8} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AssetImage assetId="interface.experience.icon" size={20} label="X" />
            <Muted>
              {t('dashboard.xp')}: {profile.xpForNextLevel ? `${formatNumber(profile.xp)}/${formatNumber(profile.xpForNextLevel)}` : t('dashboard.maxLevel')}
            </Muted>
          </View>
          <ProgressBar share={xpShare} color={colors.positive} height={8} />
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}
