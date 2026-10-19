import { ReactNode, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { assetUrl } from '@/lib/assets';
import { colors } from '@/theme';

export interface FortressPart {
  level: number;
  constructing: boolean;
  upgradeReady: boolean;
  onPress: () => void;
}

// The web's wall thickness on a phone: clamp(22px, 5vw, 36px) is 22px there.
const WALL = 22;
// defensive_wall.png is a 128x256 portrait tile; drawn WALL wide it is 2×WALL tall.
const TILE = WALL * 2;
const TOWER = assetUrl('buildings.guard_tower.icon');
const WALL_IMG = assetUrl('buildings.defensive_wall.icon');

/**
 * The base as a fortress (the web's FortressFrame): the 4 corner towers are the
 * Defense System, the wall segments between them the Defensive Wall — each
 * tappable, with the green "upgrade affordable" dot.
 */
export function FortressFrame({ children, corners, walls }: { children: ReactNode; corners: FortressPart | null; walls: FortressPart | null }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  const innerW = Math.max(0, size.width - 2 * WALL);
  const innerH = Math.max(0, size.height - 2 * WALL);

  const dim = (part: FortressPart | null) => (part && part.level === 0 ? 0.6 : 1) * (part?.constructing ? 0.75 : 1);

  const verticalWall = (key: string) => (
    <Pressable key={key} onPress={walls?.onPress} style={{ width: WALL, height: innerH, overflow: 'hidden', opacity: dim(walls) }}>
      {Array.from({ length: Math.ceil(innerH / TILE) }, (_, i) => (
        <Image key={i} source={{ uri: WALL_IMG }} style={{ width: WALL, height: TILE }} contentFit="fill" cachePolicy="disk" />
      ))}
    </Pressable>
  );
  const horizontalWall = (key: string, dot: boolean) => (
    <Pressable key={key} onPress={walls?.onPress} style={{ width: innerW, height: WALL, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', opacity: dim(walls) }}>
        {Array.from({ length: Math.ceil(innerW / TILE) }, (_, i) => (
          // A portrait tile turned on its side.
          <View key={i} style={{ width: TILE, height: WALL, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri: WALL_IMG }} style={{ width: WALL, height: TILE, transform: [{ rotate: '90deg' }] }} contentFit="fill" cachePolicy="disk" />
          </View>
        ))}
      </View>
      {dot && walls?.upgradeReady && <Dot style={{ left: innerW / 2 - 4, top: 2 }} />}
    </Pressable>
  );
  const tower = (rotate: number, dot: boolean) => (
    <Pressable onPress={corners?.onPress} style={{ width: WALL, height: WALL }}>
      <Image source={{ uri: TOWER }} style={{ width: WALL, height: WALL, opacity: dim(corners), transform: [{ rotate: `${rotate}deg` }] }} contentFit="cover" cachePolicy="disk" />
      {dot && corners?.upgradeReady && <Dot style={{ right: 2, top: 2 }} />}
    </Pressable>
  );

  return (
    <View onLayout={onLayout} style={{ borderRadius: 12, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row' }}>
        {tower(0, true)}
        {horizontalWall('top', true)}
        {tower(90, false)}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {verticalWall('left')}
        <View style={{ flex: 1, padding: 16, backgroundColor: '#141c24' }}>{children}</View>
        {verticalWall('right')}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {tower(270, false)}
        {horizontalWall('bottom', false)}
        {tower(180, false)}
      </View>
    </View>
  );
}

function Dot({ style }: { style: object }) {
  return <View style={[{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.positive }, style]} />;
}
