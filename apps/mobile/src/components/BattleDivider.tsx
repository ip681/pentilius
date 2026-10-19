import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** The lightning bolt between the two fighters, with the round number. */
export function BattleDivider({ round }: { round?: number }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 }}>
      <View style={{ width: 1, flex: 1, backgroundColor: colors.panelBorder }} />
      <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.panelHeader, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill={colors.accent} />
        </Svg>
      </View>
      <View style={{ width: 1, flex: 1, backgroundColor: colors.panelBorder }} />
      {round !== undefined && (
        <Text style={{ fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: colors.textFaint }}>
          {t('pve.round')} {round}
        </Text>
      )}
    </View>
  );
}
