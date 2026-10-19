import { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';

export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Well({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.well, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Small({ children, color }: { children: ReactNode; color?: string }) {
  return <Text style={[styles.small, color ? { color } : null]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.danger, fontSize: 13 }}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  busy,
  disabled,
  variant = 'default',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'vip' | 'plain';
}) {
  const border = variant === 'vip' ? colors.gold : variant === 'plain' ? colors.wellBorder : colors.accent;
  const text = variant === 'vip' ? colors.gold : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [styles.button, { borderColor: border }, pressed && styles.pressed, (busy || disabled) && styles.disabled]}
    >
      {busy ? <ActivityIndicator color={colors.text} /> : <Text style={[styles.buttonText, { color: text }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...input } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textFaint} style={styles.input} {...input} />
    </View>
  );
}

export function ProgressBar({ share, color = colors.accent, height = 6 }: { share: number; color?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.wellBorder, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

/** A sheet sliding up from the bottom — the app's version of the web's BottomSheet. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8, padding: 16, gap: 10 },
  well: { backgroundColor: colors.well, borderColor: colors.wellBorder, borderWidth: 1, borderRadius: 6, padding: 10, gap: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: 13 },
  small: { color: colors.textFaint, fontSize: 11 },
  label: { color: colors.textMuted, fontSize: 12 },
  input: { backgroundColor: colors.well, borderColor: colors.wellBorder, borderWidth: 1, borderRadius: 6, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  button: { backgroundColor: colors.accentBg, borderWidth: 1, borderRadius: 6, paddingVertical: 12, alignItems: 'center' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  buttonText: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { maxHeight: '85%', backgroundColor: colors.panel, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderColor: colors.panelBorder, borderWidth: 1, padding: 16 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.panelBorder, marginBottom: 12 },
});
