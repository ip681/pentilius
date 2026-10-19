import { Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ASSET_BASE_URL } from '@/lib/config';
import { getLocale, t } from '@/lib/i18n';
import { Button, Muted, Panel, Title } from '@/components/ui';
import { colors } from '@/theme';

/** A tab that isn't in the app yet: points to the website, where it works with the same account. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Title>{title}</Title>
        <Panel>
          <Title>{t('mobile.comingTitle')}</Title>
          <Muted>{t('mobile.comingBody')}</Muted>
          <Button label={t('mobile.openWebsite')} onPress={() => Linking.openURL(`${ASSET_BASE_URL}/${getLocale()}`)} />
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}
