import { ASSET_BASE_URL } from './config';

// The same asset ids as the web ("buildings.metal_mine.icon"), served by the
// game's website — the app ships no game art of its own (instructions/ASSETS.md).
export function assetUrl(assetId: string): string {
  const [namespace, key] = assetId.split('.');
  return `${ASSET_BASE_URL}/assets/${namespace}/${key}.png`;
}
