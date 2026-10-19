import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { InventoryItemDto, PlayerProfileDto } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { ActionButton } from '@/components/ConfirmButton';
import { consumeItem, getInventory } from '@/lib/api';
import { formatDuration } from '@/lib/duration';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** Under an energy-gated button when energy runs out: the player's energy packs, usable right there. */
export function EnergyRefill({ profile, needed = 1, onRefilled }: { profile: PlayerProfileDto | null; needed?: number; onRefilled: () => void | Promise<void> }) {
  const [packs, setPacks] = useState<InventoryItemDto[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const outOfEnergy = !!profile && profile.energy.current < needed;

  function loadPacks() {
    getInventory()
      .then((inventory) => setPacks(inventory.items.filter((item) => (item.energyGain ?? 0) > 0).sort((a, b) => (a.energyGain ?? 0) - (b.energyGain ?? 0))))
      .catch(() => setPacks([]));
  }

  useEffect(() => {
    if (!outOfEnergy) return;
    loadPacks();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [outOfEnergy]);

  async function use(item: InventoryItemDto) {
    setBusyId(item.id);
    try {
      await consumeItem(item.id);
      await onRefilled();
    } finally {
      loadPacks();
      setBusyId(null);
    }
  }

  if (!outOfEnergy || !profile || packs === null) return null;
  const secondsToNext = profile.energy.nextRegenAt ? Math.max(0, Math.ceil((new Date(profile.energy.nextRegenAt).getTime() - now) / 1000)) : null;
  return (
    <View style={{ marginTop: 8, alignItems: 'center', gap: 6 }}>
      {packs.length > 0 ? (
        <>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('energyRefill.usePack')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            {packs.map((item) => (
              <ActionButton
                key={item.id}
                size="sm"
                disabled={busyId !== null}
                onPress={() => use(item)}
                label={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AssetImage assetId={item.iconAssetId} size={16} label={t(item.nameKey)} />
                    <Text style={{ color: colors.text, fontSize: 11, textTransform: 'uppercase' }}>
                      {t(item.nameKey)} +{item.energyGain} (×{item.quantity})
                    </Text>
                  </View>
                }
              />
            ))}
          </View>
        </>
      ) : (
        <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>
          {secondsToNext !== null ? t('energyRefill.noPacksNext', { time: formatDuration(secondsToNext) }) : t('energyRefill.noPacks')}
        </Text>
      )}
    </View>
  );
}
