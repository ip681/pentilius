import { Text, View } from 'react-native';
import type { LootResultEntryDto } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

/** One loot result: +amount with the resource icon, or the item icon + name. */
export function LootEntry({ loot, color = colors.text, size = 11 }: { loot: LootResultEntryDto; color?: string; size?: number }) {
  if (loot.type === 'resource') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ color, fontSize: size }}>+{loot.quantity}</Text>
        <ResourceIcon type={loot.resourceType!} size={16} />
      </View>
    );
  }
  const name = t(loot.itemNameKey!);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <AssetImage assetId={loot.itemIconAssetId ?? ''} size={16} label={name} />
      <Text style={{ color, fontSize: size }}>
        {name}
        {loot.quantity > 1 ? ` ×${loot.quantity}` : ''}
      </Text>
    </View>
  );
}
