import { ReactNode, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { AchievementRewardDto } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** Row look by state: ready to claim stands out in the accent colour; claimed fades (the web's rowClass). */
export function rowStyle(state: 'open' | 'ready' | 'claimed') {
  return {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderColor: state === 'ready' ? colors.accent : colors.wellBorder,
    backgroundColor: state === 'ready' ? colors.accentBg : colors.well,
    opacity: state === 'claimed' ? 0.6 : 1,
  } as const;
}

export function ClaimButton({ label, busy, onPress, wide = false }: { label: string; busy: boolean; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      disabled={busy}
      onPress={onPress}
      style={{ height: 28, alignSelf: wide ? 'stretch' : 'auto', flex: wide ? 1 : undefined, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
    >
      <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

/** Progress bar with the "x/y" (or %) next to it — fixed height, so rows don't jump. */
export function ProgressLine({ share, text }: { share: number; text: string }) {
  return (
    <View style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.wellBorder, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, height: '100%', backgroundColor: colors.accent }} />
      </View>
      <Text style={{ width: 70, textAlign: 'right', fontSize: 11, color: colors.textMuted }}>{text}</Text>
    </View>
  );
}

export function ClaimedText() {
  return (
    <View style={{ height: 28, justifyContent: 'center' }}>
      <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.textFaint }}>✓ {t('dailyTasks.claimed')}</Text>
    </View>
  );
}

/** Rewards: Metal, Crystal, XP, energy, an item. */
export function RewardLine({ reward }: { reward: Partial<AchievementRewardDto> & { xp?: number; energy?: number } }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {!!reward.metal && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <ResourceIcon type="METAL" size={14} />
          <Text style={{ fontSize: 11, color: colors.textMuted }}>{formatNumber(reward.metal)}</Text>
        </View>
      )}
      {!!reward.crystal && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <ResourceIcon type="CRYSTAL" size={14} />
          <Text style={{ fontSize: 11, color: colors.textMuted }}>{formatNumber(reward.crystal)}</Text>
        </View>
      )}
      {!!reward.xp && <Text style={{ fontSize: 11, color: colors.textMuted }}>+{formatNumber(reward.xp)} XP</Text>}
      {!!reward.energy && <Text style={{ fontSize: 11, color: colors.textMuted }}>+{reward.energy} ⚡</Text>}
      {!!reward.itemKey && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <AssetImage assetId={`items.${reward.itemKey}.icon`} size={16} label="" hideFallback />
          <Text style={{ fontSize: 11, color: colors.textMuted }}>{t(`items.${reward.itemKey}.name`)}</Text>
        </View>
      )}
    </View>
  );
}

/** Claimed rewards folded away at the bottom of a list. */
export function ClaimedSection({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <Text style={{ fontSize: 11, color: colors.textFaint }}>
          {open ? '▾' : '▸'} {t('claimedSection.title', { count })}
        </Text>
      </Pressable>
      {open && children}
    </View>
  );
}

export function SubHeading({ children, divider }: { children: string; divider?: boolean }) {
  return (
    <Text style={{ marginTop: divider ? 8 : 0, paddingTop: divider ? 12 : 0, borderTopWidth: divider ? 1 : 0, borderTopColor: colors.wellBorder, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>
      {children}
    </Text>
  );
}
