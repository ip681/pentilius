import { Pressable, Text, View } from 'react-native';
import { t } from '@/lib/i18n';
import { downloadUpdate, useNewerVersion } from '@/lib/update';
import { colors } from '@/theme';

/** "Version X is available" with a download button — only when the server has a newer app. */
export function UpdateBanner() {
  const newer = useNewerVersion();
  if (!newer) return null;
  return (
    <View style={{ marginBottom: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.accentBg, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.gold }}>{t('mobile.updateAvailable', { version: newer })}</Text>
        <Pressable onPress={downloadUpdate} style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.gold, paddingHorizontal: 14, paddingVertical: 7 }}>
          <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.gold }}>{t('mobile.updateDownload')}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 11, color: colors.textMuted }}>{t('mobile.updateHint')}</Text>
    </View>
  );
}
