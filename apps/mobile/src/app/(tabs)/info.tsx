import { Pressable, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { ScreenTitle } from '@/components/ScreenTitle';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

// The public information pages (the web's InfoLinks): About, History, Rules, Privacy, Support, Delete account.
const INFO_PAGES = ['about', 'lore', 'rules', 'privacy', 'support', 'deleteAccount'] as const;

export default function InfoScreen() {
  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 8 }}>
      <ScreenTitle title={t('mobile.infoTitle')} />
      {INFO_PAGES.map((key) => (
        <Pressable
          key={key}
          onPress={() => router.navigate({ pathname: '/page/[key]', params: { key } })}
          style={({ pressed }) => ({ borderRadius: 8, borderWidth: 1, borderColor: pressed ? colors.accent : colors.panelBorder, backgroundColor: colors.panel, paddingHorizontal: 16, paddingVertical: 14 })}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t(`pages.${key}.title`)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
