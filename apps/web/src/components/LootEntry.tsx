'use client';

import type { LootResultEntryDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { AssetIcon } from './AssetIcon';
import { ResourceIcon } from './ResourceIcon';

// One reward line — a resource (icon + quantity) or an item (icon + name +
// quantity if more than 1). Shared by every battle/expedition/report screen
// that shows a lootSummary entry, so they all look the same. `lost` = won but
// not given because the inventory was full (owner decision, 2026-10-20).
export function LootEntry({ loot, lost = false }: { loot: LootResultEntryDto; lost?: boolean }) {
  const t = useTranslations();

  if (loot.type === 'resource') {
    return (
      <span className="inline-flex items-center gap-1">
        +{loot.quantity} <ResourceIcon type={loot.resourceType!} className="h-4 w-4" />
      </span>
    );
  }

  const name = t(loot.itemNameKey!);
  if (lost) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-1 line-through opacity-40">
          <AssetIcon
            assetId={loot.itemIconAssetId ?? ''}
            alt={name}
            className="h-4 w-4 object-contain"
            fallback={<span className="text-[9px] font-semibold text-textMuted">{name.charAt(0)}</span>}
          />
          {name}
          {loot.quantity > 1 ? ` ×${loot.quantity}` : ''}
        </span>
        <span className="text-danger">{t('pve.lootNotGranted')}</span>
      </span>
    );
  }
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
