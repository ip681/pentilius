// Maps a stable backend asset id ("items.energy_pack_small.icon") to its static file
// under public/assets, per instructions/ASSETS.md: the backend never hardcodes filenames,
// only this one function does the id -> path translation.
export function assetUrl(iconAssetId: string): string {
  const [namespace, key] = iconAssetId.split('.');
  return `/assets/${namespace}/${key}.png`;
}
