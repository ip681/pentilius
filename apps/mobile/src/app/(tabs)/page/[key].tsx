import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getLocale, t, tRaw } from '@/lib/i18n';
import { fillLegal, LEGAL } from '@/lib/legal';
import { colors } from '@/theme';

interface PageContent {
  title: string;
  intro?: string;
  sections: { heading?: string; paragraphs?: string[]; bullets?: string[] }[];
}

// The rules and privacy pages show when they were last updated, as on the web.
const SHOW_UPDATED = new Set(['rules', 'privacy']);

// One public information page (the web's PublicPage) — the text lives under pages.<key> in the translations.
export default function InfoPageScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const content = tRaw<PageContent>(`pages.${key}`);
  const locale = getLocale();
  const fill = (text: string) => fillLegal(text, locale);

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <Text onPress={() => router.navigate('/info')} style={{ marginBottom: 16, fontSize: 12, color: colors.accent }}>
        ← {t('mobile.infoTitle')}
      </Text>
      {content && (
        <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel, padding: 20 }}>
          <Text style={{ marginBottom: 8, fontSize: 20, fontWeight: '600', color: colors.textMuted }}>{content.title}</Text>
          {SHOW_UPDATED.has(key ?? '') && (
            <Text style={{ marginBottom: 16, fontSize: 11, color: colors.textFaint }}>
              {t('pages.updated', { updated: new Date(LEGAL.updated).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB') })}
            </Text>
          )}
          {content.intro && <Text style={{ marginBottom: 20, fontSize: 14, lineHeight: 21, color: colors.textMuted }}>{fill(content.intro)}</Text>}
          {content.sections.map((section, index) => (
            <View key={index} style={{ marginBottom: 20 }}>
              {section.heading && <Text style={{ marginBottom: 8, fontSize: 16, fontWeight: '600', color: colors.textMuted }}>{fill(section.heading)}</Text>}
              {section.paragraphs?.map((paragraph, i) => (
                <Text key={i} style={{ marginBottom: 8, fontSize: 14, lineHeight: 21, color: colors.textMuted }}>
                  {fill(paragraph)}
                </Text>
              ))}
              {section.bullets?.map((bullet, i) => (
                <Text key={i} style={{ marginBottom: 4, paddingLeft: 8, fontSize: 14, lineHeight: 21, color: colors.textMuted }}>
                  • {fill(bullet)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
