import { useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { assetUrl } from '@/lib/assets';
import { colors } from '@/theme';

/** A game image by asset id; a letter when the art doesn't exist (yet). */
export function AssetImage({ assetId, size, label, dimmed = false }: { assetId: string; size: number; label: string; dimmed?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentBg, borderRadius: 6, opacity: dimmed ? 0.4 : 0.9 }}>
        <Text style={{ color: colors.textMuted, fontSize: size * 0.35, fontWeight: '600' }}>{label.charAt(0)}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: assetUrl(assetId) }}
      style={{ width: size, height: size, opacity: dimmed ? 0.4 : 1 }}
      contentFit="contain"
      cachePolicy="disk"
      transition={150}
      onError={() => setFailed(true)}
    />
  );
}

export function ResourceIcon({ type, size = 16 }: { type: 'METAL' | 'CRYSTAL' | 'CREDITS'; size?: number }) {
  return <AssetImage assetId={`resource.${type.toLowerCase()}.icon`} size={size} label={type} />;
}
