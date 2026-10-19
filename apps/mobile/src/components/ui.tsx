import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors } from '@/theme';

export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Button({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, (busy || disabled) && styles.buttonDisabled]}
    >
      {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.buttonText}>{label}</Text>}
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

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8, padding: 16, gap: 10 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: 13 },
  label: { color: colors.textMuted, fontSize: 12 },
  input: { backgroundColor: colors.well, borderColor: colors.wellBorder, borderWidth: 1, borderRadius: 6, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  button: { backgroundColor: colors.accentBg, borderColor: colors.accent, borderWidth: 1, borderRadius: 6, paddingVertical: 12, alignItems: 'center' },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: '600', textTransform: 'uppercase' },
});
