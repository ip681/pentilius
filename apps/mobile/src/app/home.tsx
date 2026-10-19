import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button, Muted, Panel, Title } from '@/components/ui';
import { colors } from '@/theme';

/** Command Center — first version: who you are, resources, energy, XP. */
export default function HomeScreen() {
  const { profile, refresh, logout } = useSession();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (!profile) return <Redirect href="/login" />;

  const xpShare = profile.xpForNextLevel ? Math.min(1, profile.xp / profile.xpForNextLevel) : 1;
  const energyShare = profile.energy.max ? profile.energy.current / profile.energy.max : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
        <Panel>
          <Title>{t('dashboard.title')}</Title>
          <Text style={{ color: colors.text, fontSize: 16 }}>
            {profile.username} · {t('dashboard.level')} {profile.level}
          </Text>
          <Muted>{t(`race.${profile.race}.name`)}</Muted>
        </Panel>

        <Panel>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {(['METAL', 'CRYSTAL', 'CREDITS'] as const).map((type) => (
              <View key={type} style={{ alignItems: 'center', flex: 1 }}>
                <Muted>{t(`resource.${type}`)}</Muted>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                  {formatNumber(profile.resources[type.toLowerCase() as 'metal' | 'crystal' | 'credits'])}
                </Text>
              </View>
            ))}
          </View>
        </Panel>

        <Panel>
          <Muted>
            {t('dashboard.energy')}: {profile.energy.current}/{profile.energy.max}
          </Muted>
          <Bar share={energyShare} color={colors.energy} />
          <Muted>
            {t('dashboard.xp')}: {profile.xpForNextLevel ? `${formatNumber(profile.xp)}/${formatNumber(profile.xpForNextLevel)}` : t('dashboard.maxLevel')}
          </Muted>
          <Bar share={xpShare} color={colors.positive} />
        </Panel>

        <Button
          label={t('topbar.logout')}
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Bar({ share, color }: { share: number; color: string }) {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.well, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(share * 100)}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}
