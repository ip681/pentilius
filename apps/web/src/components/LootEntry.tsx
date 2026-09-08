'use client';

import type { LootResultEntryDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { AssetIcon } from './AssetIcon';
import { ResourceIcon } from './ResourceIcon';

// One reward line — a resource (icon + quantity) or an item (icon + name +
// quantity if more than 1). Shared by every battle/expedition/report screen
// that shows a lootSummary entry, so they all look the same.
export function LootEntry({ loot }: { loot: LootResultEntryDto }) {
  const t = useTranslations();

  if (loot.type === 'resource') {
    return (
      <span className="inline-flex items-center gap-1">
        +{loot.quantity} <ResourceIcon type={loot.resourceType!} className="h-4 w-4" />
      </span>
    );
  }

  const name = t(loot.itemNameKey!);
  return (
    <span className="inline-flex items-center gap-1">
      <AssetIcon
        assetId={loot.itemIconAssetId ?? ''}
        alt={name}
        className="h-4 w-4 object-contain"
        fallback={<span className="text-[9px] font-semibold text-textMuted">{name.charAt(0)}</span>}
      />
      {name}
      {loot.quantity > 1 ? ` ×${loot.quantity}` : ''}
    </span>
  );
}
