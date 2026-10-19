import { ScrollView, Text, View } from 'react-native';
import { t } from '@/lib/i18n';
import { openWebsite } from '@/lib/web';
import { Button, Muted, Panel } from '@/components/ui';
import { colors } from '@/theme';

/** A page not yet in the app: its title, and a way to the website (same account). */
export function ComingSoon({ titleKey, webPath }: { titleKey: string; webPath: string }) {
  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, gap: 12 }}>
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text }}>{t(titleKey)}</Text>
      </View>
      <Panel>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('mobile.comingTitle')}</Text>
        <Muted>{t('mobile.comingBody')}</Muted>
        <Button label={t('mobile.openWebsite')} onPress={() => openWebsite(webPath)} />
      </Panel>
    </ScrollView>
  );
}
