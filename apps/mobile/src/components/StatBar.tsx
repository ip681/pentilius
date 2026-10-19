import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { AssetImage } from '@/components/AssetImage';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** Energy / XP bar of the header (the web's StatBar). */
export function StatBar({
  label,
  icon,
  hideLabelText = false,
  current,
  max,
  color,
  countdownTarget,
}: {
  label: string;
  icon?: string;
  hideLabelText?: boolean;
  current: number;
  max: number | null;
  color: string;
  countdownTarget?: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!countdownTarget) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [countdownTarget]);
  const share = max ? Math.min(1, Math.max(0, current / max)) : 1;
  const remaining = countdownTarget ? new Date(countdownTarget).getTime() - now : null;
  const countdown = remaining !== null && remaining > 0 ? formatCountdown(remaining) : null;

  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {icon && <AssetImage assetId={icon} size={14} label={label} />}
          {!hideLabelText && <Text style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.text }}>{label}</Text>}
          {countdown && <Text style={{ fontSize: 10, color: colors.text }}>({countdown})</Text>}
        </View>
        <Text style={{ fontSize: 10, color: colors.text }}>{max !== null ? `${current}/${max}` : t('dashboard.maxLevel')}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.wellBorder, overflow: 'hidden' }}>
        <View style={{ width: `${share * 100}%`, height: '100%', backgroundColor: color }} />
      </View>
    </View>
  );
}
