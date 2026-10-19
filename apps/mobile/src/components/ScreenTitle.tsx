import { Text, View } from 'react-native';
import { colors } from '@/theme';

/** Page title + subtitle, as at the top of every web page (text-2xl / text-xs). */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 12, color: colors.textMuted }}>{subtitle}</Text> : null}
    </View>
  );
}

/** Small uppercase section heading (the web's text-[11px] uppercase tracking-wide). */
export function SectionHeading({ children }: { children: string }) {
  return <Text style={{ marginBottom: 12, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{children}</Text>;
}
