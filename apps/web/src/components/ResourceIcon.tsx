'use client';

import type { ResourceType } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { AssetIcon } from './AssetIcon';

// Metal/Crystal/Credits icon — replaces the old plain-text "500 Metal" (or
// worse, an abbreviated "500M") labels across every cost/reward display.
export function ResourceIcon({ type, className = 'h-4 w-4' }: { type: ResourceType; className?: string }) {
  const t = useTranslations();
  const alt = t(`resource.${type}`);
  return (
    <AssetIcon
      assetId={`resource.${type.toLowerCase()}.icon`}
      alt={alt}
      className={`${className} shrink-0 object-contain`}
      fallback={<span className="text-[9px] font-semibold text-textMuted">{alt.charAt(0)}</span>}
    />
  );
}
