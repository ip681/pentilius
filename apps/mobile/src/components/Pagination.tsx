import { Pressable, Text, View } from 'react-native';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** Prev / "page X of Y" / next — nothing when everything fits on one page (the web's Pagination). */
export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const button = (label: string, target: number, disabled: boolean) => (
    <Pressable
      disabled={disabled}
      onPress={() => onChange(target)}
      style={{ borderRadius: 4, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 12, paddingVertical: 6, opacity: disabled ? 0.4 : 1 }}
    >
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.panelBorder, paddingHorizontal: 16, paddingVertical: 12 }}>
      {button(t('leaderboard.pagePrev'), page - 1, page <= 1)}
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('leaderboard.pageInfo', { page, total: totalPages })}</Text>
      {button(t('leaderboard.pageNext'), page + 1, page >= totalPages)}
    </View>
  );
}
