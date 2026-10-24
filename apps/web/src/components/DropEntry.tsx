'use client';

import type { PentiliLootDropDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { AssetIcon } from './AssetIcon';
import { ResourceIcon } from './ResourceIcon';

/** One Pentili loot-table entry — resource icon + drop chance, or item icon + name + drop chance. */
export function DropEntry({ drop }: { drop: PentiliLootDropDto }) {
  const t = useTranslations();
  const quantity = drop.minQuantity === drop.maxQuantity ? `${drop.minQuantity}` : `${drop.minQuantity}-${drop.maxQuantity}`;
  const percent = Math.round(drop.dropChance * 100);

  if (drop.type === 'resource') {
    return (
      <span className="inline-flex items-center gap-1">
        <ResourceIcon type={drop.resourceType!} className="h-3.5 w-3.5" /> ×{quantity} ({percent}%)
      </span>
    );
  }

  const name = t(drop.itemNameKey!);
  return (
    <span className="inline-flex items-center gap-1">
      <AssetIcon
        assetId={drop.itemIconAssetId ?? ''}
        alt={name}
        className="h-3.5 w-3.5 object-contain"
        fallback={<span className="text-[8px] font-semibold text-textMuted">{name.charAt(0)}</span>}
      />
      {name} ×{quantity} ({percent}%)
    </span>
  );
}
