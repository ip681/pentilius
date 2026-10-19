import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { CombatStatsDto } from '@pentilius/shared';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** Attack / Defense / HP / Evasion (+ item bonuses) — the web's CombatStatsCard. */
export function CombatStatsCard({
  title,
  subtitle,
  stats,
  variant,
  avatarFrame,
  // PvP's scout hides the item bonuses for both sides — only the base stats.
  showItemBonuses = true,
}: {
  title: ReactNode;
  subtitle?: string;
  stats: CombatStatsDto;
  variant: 'player' | 'enemy';
  avatarFrame?: { avatarKey: string | null; frameKey: string | null };
  showItemBonuses?: boolean;
}) {
  const row = (label: string, value: string) => (
    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 12, color: colors.text }}>{value}</Text>
    </View>
  );
  return (
    <View style={{ flex: avatarFrame ? 1 : undefined, minWidth: 0, borderWidth: 1, borderColor: variant === 'enemy' ? colors.panelBorderDanger : colors.panelBorder, backgroundColor: colors.well, borderRadius: 6, padding: avatarFrame ? 10 : 16, gap: 6 }}>
      {avatarFrame && (
        <View style={{ height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
          <PlayerAvatarFrame avatarKey={avatarFrame.avatarKey} frameKey={avatarFrame.frameKey} size={56} />
        </View>
      )}
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: subtitle ? 0 : 4 }}>
        {title}
      </Text>
      {subtitle && (
        <Text numberOfLines={1} style={{ fontSize: 10, color: colors.textFaint, marginBottom: 6 }}>
          {subtitle}
        </Text>
      )}
      {row(t('bosses.attack'), String(stats.attack))}
      {row(t('bosses.defense'), String(stats.defense))}
      {row(t('robot.stat.hp'), String(stats.hp))}
      {row(t('robot.stat.evasion'), `${stats.evasion}%`)}
      {showItemBonuses && stats.criticalDamageBonus > 0 && row(t('robot.stat.criticalDamageBonus'), `${stats.criticalDamageBonus}%`)}
      {showItemBonuses && stats.damageDecrease > 0 && row(t('robot.stat.damageDecrease'), `${stats.damageDecrease}%`)}
      {showItemBonuses && stats.damageReflect > 0 && row(t('robot.stat.damageReflect'), `${stats.damageReflect}%`)}
    </View>
  );
}
