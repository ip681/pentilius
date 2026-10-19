import { Linking, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ASSET_BASE_URL } from '@/lib/config';
import { getLocale, t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button, Muted, Panel, Small, Title } from '@/components/ui';
import { colors } from '@/theme';

/** Everything not yet in the app — on the website for now — plus logout. */
export default function MoreTab() {
  const { logout } = useSession();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Title>{t('mobile.more')}</Title>
        <Panel>
          <Title>{t('mobile.comingTitle')}</Title>
          <Muted>{t('mobile.comingBody')}</Muted>
          <Button label={t('mobile.openWebsite')} onPress={() => Linking.openURL(`${ASSET_BASE_URL}/${getLocale()}`)} />
        </Panel>
        <Button
          variant="plain"
          label={t('topbar.logout')}
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
        />
        <Small>{t('mobile.version', { version: Constants.expoConfig?.version ?? '' })}</Small>
      </ScrollView>
    </SafeAreaView>
  );
}
