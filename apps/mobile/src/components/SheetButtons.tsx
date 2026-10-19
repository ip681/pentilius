import { Pressable, Text, View } from 'react-native';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** Confirm / cancel side by side, as in the web's bottom sheets. */
export function SheetButtons({
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
  disabled = false,
}: {
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable
        disabled={disabled}
        onPress={onConfirm}
        style={{ flex: 1, borderRadius: 6, borderWidth: 1, paddingVertical: 10, alignItems: 'center', borderColor: danger ? colors.panelBorderDanger : colors.accent, backgroundColor: danger ? colors.well : colors.accentBg, opacity: disabled ? 0.4 : 1 }}
      >
        <Text style={{ fontSize: 12, textTransform: 'uppercase', color: danger ? colors.danger : colors.text }}>{confirmLabel ?? t('common.confirm')}</Text>
      </Pressable>
      <Pressable onPress={onCancel} style={{ flex: 1, borderRadius: 6, borderWidth: 1, paddingVertical: 10, alignItems: 'center', borderColor: colors.panelBorder, backgroundColor: colors.panel }}>
        <Text style={{ fontSize: 12, textTransform: 'uppercase', color: colors.textMuted }}>{t('common.cancel')}</Text>
      </Pressable>
    </View>
  );
}

/** One full-width option in a sheet's list (the web's action-sheet rows). */
export function SheetOption({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderRadius: 6, borderWidth: 1, paddingVertical: 10, alignItems: 'center', borderColor: danger ? colors.panelBorderDanger : colors.wellBorder, backgroundColor: colors.well }}
    >
      <Text style={{ fontSize: 12, textTransform: 'uppercase', color: danger ? colors.danger : colors.text }}>{label}</Text>
    </Pressable>
  );
}
