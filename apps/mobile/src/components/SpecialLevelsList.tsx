import { Text, View } from 'react-native';
import type { SpecialLevelDto } from '@pentilius/shared';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** Levels where something special happens, a check mark once reached (the web's SpecialLevels). */
export function SpecialLevelsList({ levels }: { levels: SpecialLevelDto[] }) {
  if (levels.length === 0) return null;
  return (
    <View style={{ borderRadius: 4, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 10, gap: 2 }}>
      <Text style={{ fontSize: 8, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 2 }}>{t('specialLevels.title')}</Text>
      {levels.map((entry) => (
        <Text key={`${entry.kind}-${entry.level}`} style={{ fontSize: 11, color: entry.reached ? colors.positive : colors.textMuted }}>
          {entry.reached ? '✓ ' : '    '}
          {t('specialLevels.level', { level: entry.level })} — {t(`specialLevels.kinds.${entry.kind}`, { name: entry.nameKey ? t(entry.nameKey) : '' })}
        </Text>
      ))}
    </View>
  );
}
