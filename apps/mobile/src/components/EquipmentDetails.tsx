import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ItemOption, ItemStatsDto, Race } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

export interface EquipmentDetailsItem {
  upgradeLevel: number;
  maxUpgradeLevel: number;
  currentStats: ItemStatsDto | null;
  race: Race | null;
  rolledOptions: ItemOption[];
}

/** The web's EquipmentTooltipDetails: upgrade level, stats, race lock, Excellent options. */
export function EquipmentDetails({ item, playerRace }: { item: EquipmentDetailsItem; playerRace: Race | undefined }) {
  const stats = (['attack', 'defense', 'hp'] as const).filter((key) => item.currentStats?.[key] !== undefined);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>
        {t('robot.upgradeLevel')}: {item.upgradeLevel}/{item.maxUpgradeLevel}
      </Text>
      {stats.length > 0 && <StatsBox stats={item.currentStats!} />}
      {item.race && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AssetImage assetId={`races.${item.race.toLowerCase()}.icon`} size={14} label="" hideFallback />
          <Text style={{ fontSize: 12, color: item.race === playerRace ? colors.positive : colors.danger }}>{t('robot.raceLocked', { race: t(`race.${item.race}.name`) })}</Text>
        </View>
      )}
      {item.rolledOptions.map((option) => (
        <Text key={option} style={{ fontSize: 12, color: colors.positive }}>
          {t(`itemOption.${option}`)}
        </Text>
      ))}
    </View>
  );
}

export function StatsBox({ stats }: { stats: ItemStatsDto }) {
  return (
    <View style={{ borderRadius: 4, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.ink, padding: 8, gap: 2 }}>
      {(['attack', 'defense', 'hp'] as const).map((key) =>
        stats[key] === undefined ? null : (
          <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: colors.textFaint }}>{t(`robot.stat.${key === 'attack' ? 'damage' : key}`)}</Text>
            <Text style={{ fontSize: 12, color: colors.text }}>{stats[key]}</Text>
          </View>
        ),
      )}
    </View>
  );
}

/** A filter chip, as the web's small uppercase pills. */
export function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ borderRadius: 4, borderWidth: 1, borderColor: active ? colors.textFaint : colors.accent, backgroundColor: active ? colors.accentBgHover : colors.accentBg, paddingHorizontal: 8, paddingVertical: 6 }}>
      <Text style={{ fontSize: 9, textTransform: 'uppercase', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

export function PillRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{children}</View>;
}
