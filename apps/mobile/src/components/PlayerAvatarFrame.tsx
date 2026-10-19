import { View } from 'react-native';
import { AssetImage } from '@/components/AssetImage';

/** Avatar under its frame, both stretched to the same box (the web's PlayerAvatarFrame). */
export function PlayerAvatarFrame({ avatarKey, frameKey, size }: { avatarKey: string | null; frameKey: string | null; size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      {avatarKey && (
        <View style={{ position: 'absolute', inset: 0 }}>
          <AssetImage assetId={`avatars.${avatarKey}.icon`} size={size} label="" />
        </View>
      )}
      {frameKey && (
        <View style={{ position: 'absolute', inset: 0 }}>
          <AssetImage assetId={`frames.${frameKey}.icon`} size={size} label="" hideFallback />
        </View>
      )}
    </View>
  );
}
