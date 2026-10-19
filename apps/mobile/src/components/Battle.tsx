import { ReactNode, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { CombatRoundDto, LootResultEntryDto } from '@pentilius/shared';
import { LootEntry } from '@/components/LootEntry';
import { AssetImage } from '@/components/AssetImage';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

// Shared by the zone fights, the clan war and PvP: the two fighters and the round-by-round log.
export interface LogLine {
  text: ReactNode;
  kind: 'player' | 'enemy' | 'system';
}

export const ROUND_INTERVAL_MS = 550;

export function FighterPanel({
  name,
  hp,
  maxHp,
  variant,
  iconAssetId,
  avatarKey,
  frameKey,
  showPicture = true,
}: {
  name: string;
  hp: number;
  maxHp: number;
  variant: 'player' | 'enemy';
  iconAssetId?: string;
  avatarKey?: string;
  frameKey?: string;
  showPicture?: boolean;
}) {
  const share = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: 8, borderWidth: 1, borderColor: variant === 'enemy' ? colors.panelBorderDanger : colors.panelBorder, backgroundColor: colors.panel, padding: 8 }}>
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: colors.text, marginBottom: 8 }}>
        {name}
      </Text>
      {showPicture && (
        <View style={{ height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          {avatarKey || frameKey ? (
            <PlayerAvatarFrame avatarKey={avatarKey ?? null} frameKey={frameKey ?? null} size={56} />
          ) : (
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(34,45,53,0.35)', alignItems: 'center', justifyContent: 'center' }}>
              {iconAssetId ? <AssetImage assetId={iconAssetId} size={56} label={name} /> : <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: '600' }}>{name.charAt(0)}</Text>}
            </View>
          )}
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 9, color: colors.textMuted }}>{t(variant === 'enemy' && iconAssetId ? 'pve.hp' : 'robot.stat.hp')}</Text>
        <Text style={{ fontSize: 9, color: colors.textMuted }}>
          {Math.round(hp)} / {maxHp}
        </Text>
      </View>
      <View style={{ height: 7, borderRadius: 4, backgroundColor: colors.wellBorder, overflow: 'hidden' }}>
        <View style={{ width: `${share * 100}%`, height: '100%', backgroundColor: variant === 'enemy' ? colors.danger : colors.positive }} />
      </View>
    </View>
  );
}

/** The combat log box, scrolled to the newest line. */
export function CombatLog({ log }: { log: LogLine[] }) {
  const logRef = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void } | null>(null);
  return (
    <ScrollView
      ref={logRef as never}
      nestedScrollEnabled
      onContentSizeChange={() => logRef.current?.scrollToEnd({ animated: false })}
      style={{ height: 190, borderRadius: 4, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.ink }}
      contentContainerStyle={{ padding: 10, gap: 2 }}
    >
      {log.map((line, index) =>
        typeof line.text === 'string' ? (
          <Text key={index} style={{ fontSize: 11, lineHeight: 17, fontFamily: 'monospace', color: logColor(line.kind) }}>
            {line.text}
          </Text>
        ) : (
          <View key={index}>{line.text}</View>
        ),
      )}
    </ScrollView>
  );
}

export function logColor(kind: LogLine['kind']): string {
  return kind === 'player' ? colors.positive : kind === 'enemy' ? colors.danger : colors.textMuted;
}

/** One round of a player-vs-player duel (PvP, clan war) as log lines, as on the web. */
export function duelRoundLines(round: CombatRoundDto, myName: string, enemyName: string): LogLine[] {
  const lines: LogLine[] = [];
  if (round.pentiliDodged) {
    lines.push({ text: t('pvp.roundDodge', { name: enemyName }), kind: 'enemy' });
  } else {
    lines.push({ text: t('pvp.roundHit', { name: myName, damage: round.playerDamage }), kind: 'player' });
    if (round.playerCritical) lines.push({ text: t('pvp.roundCritical', { name: myName }), kind: 'player' });
    if (round.pentiliReflectedDamage > 0) lines.push({ text: t('pvp.roundReflect', { name: enemyName, damage: round.pentiliReflectedDamage }), kind: 'enemy' });
  }
  if (round.playerDodged) {
    lines.push({ text: t('pvp.roundDodge', { name: myName }), kind: 'player' });
  } else if (round.pentiliDamage > 0) {
    lines.push({ text: t('pvp.roundHit', { name: enemyName, damage: round.pentiliDamage }), kind: 'enemy' });
    if (round.pentiliCritical) lines.push({ text: t('pvp.roundCritical', { name: enemyName }), kind: 'enemy' });
    if (round.playerReflectedDamage > 0) lines.push({ text: t('pvp.roundReflect', { name: myName, damage: round.playerReflectedDamage }), kind: 'player' });
  }
  return lines;
}

/** The duel's last line: victory/defeat, with any loot after it in bold. */
export function duelOutcomeLine(won: boolean, loot: LootResultEntryDto[]): LogLine {
  const text = won ? t('pvp.victoryLog') : t('pvp.defeatLog');
  const kind = won ? 'player' : 'enemy';
  if (!won || loot.length === 0) return { text, kind };
  const color = logColor(kind);
  return {
    kind,
    text: (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
        <Text style={{ fontSize: 11, fontFamily: 'monospace', color }}>{text}</Text>
        {loot.map((entry, index) => (
          <LootEntry key={index} loot={entry} color={color} />
        ))}
      </View>
    ),
  };
}
