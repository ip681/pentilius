import { ReactNode, useState } from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

export type ButtonTone = 'accent' | 'danger' | 'vip' | 'plain' | 'text';

const TONES: Record<ButtonTone, { border: string; bg: string; text: string }> = {
  accent: { border: colors.accent, bg: colors.accentBg, text: colors.text },
  danger: { border: colors.panelBorderDanger, bg: colors.well, text: colors.danger },
  vip: { border: colors.vipGold, bg: colors.accentBg, text: colors.vipGold },
  // A quiet grey button (the web's border-wellBorder text-textMuted).
  plain: { border: colors.wellBorder, bg: 'transparent', text: colors.textMuted },
  // Just small grey text, no frame (the web's "Remove" next to a friend).
  text: { border: 'transparent', bg: 'transparent', text: colors.textFaint },
};

/** The web's small uppercase action button (text-[10px] uppercase, border, rounded-md). */
export function ActionButton({
  label,
  onPress,
  disabled,
  tone = 'accent',
  style,
  size = 'md',
}: {
  label: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  tone?: ButtonTone;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}) {
  const c = TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        { borderWidth: tone === 'text' ? 0 : 1, borderColor: c.border, backgroundColor: pressed && tone !== 'text' ? colors.accentBgHover : c.bg, borderRadius: 6, paddingVertical: tone === 'text' ? 4 : size === 'sm' ? 6 : 10, paddingHorizontal: tone === 'text' ? 0 : 12, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 },
        style,
      ]}
    >
      {typeof label === 'string' ? <Text style={{ color: c.text, fontSize: size === 'sm' ? 10 : 11, textTransform: 'uppercase' }}>{label}</Text> : label}
    </Pressable>
  );
}

/**
 * A button that asks once more before acting (the web's ConfirmButton).
 * size "sm" is the web's small row button (text-[10px], py-1.5): Confirm / Cancel
 * then sit side by side at their own width, not stretched across the row.
 */
export function ConfirmButton({
  label,
  message,
  onConfirm,
  disabled,
  tone = 'accent',
  confirmTone,
  confirmLabel,
  size = 'md',
  style,
}: {
  label: string;
  message?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  tone?: ButtonTone;
  // The Confirm button's look when it differs from the first one (e.g. a grey "Remove" confirmed in red).
  confirmTone?: ButtonTone;
  confirmLabel?: string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}) {
  const [confirming, setConfirming] = useState(false);
  const compact = size === 'sm';
  if (confirming) {
    const confirmAs = confirmTone ?? (tone === 'plain' || tone === 'text' ? 'danger' : tone);
    return (
      <View style={[{ gap: 8, flexShrink: 0 }, style]}>
        {message ? <Text style={{ fontSize: 10, color: colors.textMuted, maxWidth: compact ? 150 : undefined }}>{message}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ActionButton
            label={confirmLabel ?? t('common.confirm')}
            tone={confirmAs}
            size={size}
            style={compact ? undefined : { flex: 1 }}
            onPress={() => {
              setConfirming(false);
              void onConfirm();
            }}
          />
          <ActionButton
            label={t('common.cancel')}
            size={size}
            style={{ borderColor: colors.panelBorder, backgroundColor: colors.panel, ...(compact ? {} : { flex: 1 }) }}
            onPress={() => setConfirming(false)}
          />
        </View>
      </View>
    );
  }
  return <ActionButton label={label} tone={tone} size={size} disabled={disabled} style={style} onPress={() => setConfirming(true)} />;
}

/** A checkbox row (React Native has none built in). */
export function CheckRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={() => onChange(!checked)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ width: 16, height: 16, borderRadius: 3, borderWidth: 1, borderColor: colors.accent, backgroundColor: checked ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <Text style={{ color: colors.text, fontSize: 11, lineHeight: 13 }}>✓</Text>}
      </View>
      <Text style={{ fontSize: 12, color: disabled ? colors.textFaint : colors.textMuted }}>{label}</Text>
    </Pressable>
  );
}
