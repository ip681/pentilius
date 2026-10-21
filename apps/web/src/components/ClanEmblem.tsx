'use client';

import type { ClanEmblemDto } from '@pentilius/shared';
import type { CSSProperties } from 'react';
import { assetUrl } from '@/lib/assets';

// A clan emblem (owner decision, 2026-10-21): the shape and the symbol are
// white-on-transparent images used as masks, so each is painted in its color.
export function ClanEmblem({ emblem, size, className }: { emblem: ClanEmblemDto; size: number; className?: string }) {
  const layer = (assetId: string, color: string): CSSProperties => {
    const url = `url(${assetUrl(assetId)})`;
    return {
      backgroundColor: color,
      WebkitMaskImage: url,
      maskImage: url,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    };
  };
  const inset = `${((1 - emblem.symbolScale) / 2) * 100}%`;
  return (
    <span aria-hidden="true" className={`relative inline-block shrink-0 align-middle ${className ?? ''}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0" style={layer(emblem.shapeAssetId, emblem.backgroundColor)} />
      <span className="absolute" style={{ ...layer(emblem.symbolAssetId, emblem.symbolColor), inset }} />
    </span>
  );
}
