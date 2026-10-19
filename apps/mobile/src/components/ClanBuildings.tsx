import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ClanBuildingActivationDto, ClanBuildingStateDto } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { CloseLink } from '@/components/ReportSheet';
import { SpecialLevelsList } from '@/components/SpecialLevelsList';
import { Sheet } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useClock } from '@/lib/use-live';
import { colors } from '@/theme';

type Treasury = { metal: number; crystal: number; credits: number };

/** Current bonus and next level's, e.g. "+10 (+12 at next level)"; one decimal, as the Generator gives +0.5% a level. */
function bonusLabel(building: ClanBuildingStateDto): { current: string; next: string | null } {
  const format = (value: number) => (building.bonusType === 'MEMBER_CAPACITY' ? `+${Math.round(value)}` : `+${Math.round(value * 1000) / 10}%`);
  const current = format(building.level * building.bonusPerLevel);
  return { current, next: building.nextLevelCost ? format((building.level + 1) * building.bonusPerLevel) : null };
}

function buildingProgress(building: ClanBuildingStateDto, now: number): { active: boolean; share: number; secondsLeft: number } {
  if (!building.constructionEndsAt || !building.nextLevelCost) return { active: false, share: 0, secondsLeft: 0 };
  const endsAt = new Date(building.constructionEndsAt).getTime();
  if (endsAt <= now) return { active: false, share: 1, secondsLeft: 0 };
  const total = building.nextLevelCost.constructionSeconds;
  const secondsLeft = Math.ceil((endsAt - now) / 1000);
  return { active: true, share: Math.max(0, Math.min(1, (total - secondsLeft) / total)), secondsLeft };
}

function canAffordCost(treasury: Treasury, cost: { metalCost: number; crystalCost: number; creditsCost: number }): boolean {
  return treasury.metal >= cost.metalCost && treasury.crystal >= cost.crystalCost && treasury.credits >= cost.creditsCost;
}

/**
 * Clan buildings as tiles — picture, then "Name (level)" — with only the
 * at-a-glance state on the tile; a tap opens the details and actions (the web's ClanBuildingsGrid).
 */
export function ClanBuildingsGrid({
  buildings,
  treasury,
  canManage,
  onUpgrade,
  onActivate,
  error,
}: {
  buildings: ClanBuildingStateDto[];
  treasury: Treasury;
  canManage: boolean;
  onUpgrade: (key: string, canAfford: boolean) => Promise<void>;
  onActivate: (key: string, canAfford: boolean) => Promise<void>;
  error: string | null;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const now = useClock();
  const selected = buildings.find((b) => b.key === selectedKey) ?? null;

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {buildings.map((building) => {
          const progress = buildingProgress(building, now);
          const upgradeReady = canManage && !progress.active && !!building.nextLevelCost && canAffordCost(treasury, building.nextLevelCost);
          const tavernSecondsLeft = building.activation?.activeUntil ? Math.max(0, Math.ceil((new Date(building.activation.activeUntil).getTime() - now) / 1000)) : 0;
          return (
            <Pressable
              key={building.key}
              onPress={() => setSelectedKey(building.key)}
              style={{ width: '31.5%', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 8 }}
            >
              {upgradeReady && <View style={{ position: 'absolute', right: 8, top: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.positive }} />}
              <View style={{ width: 72, height: 72, marginBottom: 6, alignItems: 'center', justifyContent: 'center' }}>
                <AssetImage assetId={`clanBuildings.${building.key}.icon`} size={72} label={t(building.nameKey)} dimmed={building.level === 0} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '600', textAlign: 'center', color: colors.text }}>
                {t(building.nameKey)} <Text style={{ color: colors.textMuted }}>({building.level})</Text>
              </Text>
              {progress.active && (
                <View style={{ marginTop: 8, alignSelf: 'stretch' }}>
                  <View style={{ height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.wellBorder }}>
                    <View style={{ width: `${progress.share * 100}%`, height: '100%', backgroundColor: colors.accent }} />
                  </View>
                  <Text style={{ marginTop: 4, textAlign: 'center', fontSize: 10, color: colors.textMuted }}>{formatDuration(progress.secondsLeft)}</Text>
                </View>
              )}
              {/* Active Tavern: its time left. Inactive: nothing on the tile. */}
              {tavernSecondsLeft > 0 && <Text style={{ marginTop: 4, fontSize: 10, fontWeight: '600', color: colors.positive }}>{formatDuration(tavernSecondsLeft)}</Text>}
            </Pressable>
          );
        })}
      </View>

      <Sheet open={!!selected} onClose={() => setSelectedKey(null)}>
        {selected && (
          <ClanBuildingDetails building={selected} treasury={treasury} canManage={canManage} onUpgrade={onUpgrade} onActivate={onActivate} onClose={() => setSelectedKey(null)} error={error} now={now} />
        )}
      </Sheet>
    </>
  );
}

function CostLine({ items, suffix }: { items: [('METAL' | 'CRYSTAL' | 'CREDITS'), number][]; suffix?: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
      {items.map(([type, amount]) => (
        <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ResourceIcon type={type} size={14} />
          <Text style={{ fontSize: 11, color: colors.textFaint }}>{formatNumber(amount)}</Text>
        </View>
      ))}
      {suffix && <Text style={{ fontSize: 11, color: colors.textFaint }}>{suffix}</Text>}
    </View>
  );
}

function ClanBuildingDetails({
  building,
  treasury,
  canManage,
  onUpgrade,
  onActivate,
  onClose,
  error,
  now,
}: {
  building: ClanBuildingStateDto;
  treasury: Treasury;
  canManage: boolean;
  onUpgrade: (key: string, canAfford: boolean) => Promise<void>;
  onActivate: (key: string, canAfford: boolean) => Promise<void>;
  onClose: () => void;
  error: string | null;
  now: number;
}) {
  const progress = buildingProgress(building, now);
  const bonus = bonusLabel(building);
  const canAfford = !building.nextLevelCost || canAffordCost(treasury, building.nextLevelCost);
  const upgradeDisabled = !canManage || progress.active || !building.nextLevelCost;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AssetImage assetId={`clanBuildings.${building.key}.icon`} size={64} label={t(building.nameKey)} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t(building.nameKey)}</Text>
          <Text style={{ fontSize: 10, textTransform: 'uppercase', color: colors.textFaint }}>
            {t('clans.buildingLevel')} {building.level}
            {/* The Tavern has no designed level cap — its max level is only a technical ceiling. */}
            {!building.activation && `/${building.maxLevel}`}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{t(building.descriptionKey)}</Text>
      <Text style={{ fontSize: 12, color: colors.accent }}>
        <Text style={{ fontWeight: '600' }}>{bonus.current}</Text>
        {bonus.next ? <Text style={{ opacity: 0.8 }}> ({t('common.atNextLevel', { value: bonus.next })})</Text> : null}
      </Text>
      <SpecialLevelsList levels={building.specialLevels} />

      {progress.active ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 10, color: colors.textMuted }}>{t('clans.buildingInProgress')}</Text>
            <Text style={{ fontSize: 10, color: colors.textMuted }}>{formatDuration(progress.secondsLeft)}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.wellBorder }}>
            <View style={{ width: `${progress.share * 100}%`, height: '100%', backgroundColor: colors.accent }} />
          </View>
        </View>
      ) : building.nextLevelCost ? (
        <CostLine
          items={[
            ['METAL', building.nextLevelCost.metalCost],
            ['CRYSTAL', building.nextLevelCost.crystalCost],
            ['CREDITS', building.nextLevelCost.creditsCost],
          ]}
          suffix={`· ${formatDuration(building.nextLevelCost.constructionSeconds)}`}
        />
      ) : (
        <Text style={{ fontSize: 11, color: colors.textFaint }}>{t('clans.buildingMaxLevel')}</Text>
      )}

      <Pressable
        disabled={upgradeDisabled}
        onPress={() => onUpgrade(building.key, canAfford)}
        style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentBg, paddingVertical: 8, alignItems: 'center', opacity: upgradeDisabled || !canAfford ? 0.3 : 1 }}
      >
        <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.text }}>{t('clans.upgradeBuilding')}</Text>
      </Pressable>

      {building.activation && building.level > 0 && (
        <TavernActivation activation={building.activation} treasury={treasury} canManage={canManage} now={now} onActivate={(ok) => onActivate(building.key, ok)} />
      )}

      {error && <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>}
      <CloseLink onPress={onClose} />
    </>
  );
}

function TavernActivation({
  activation,
  treasury,
  canManage,
  now,
  onActivate,
}: {
  activation: ClanBuildingActivationDto;
  treasury: Treasury;
  canManage: boolean;
  now: number;
  onActivate: (canAfford: boolean) => void;
}) {
  const secondsLeft = activation.activeUntil ? Math.max(0, Math.ceil((new Date(activation.activeUntil).getTime() - now) / 1000)) : 0;
  const active = secondsLeft > 0;
  const canAfford = treasury.metal >= activation.cost.metal && treasury.crystal >= activation.cost.crystal && treasury.credits >= activation.cost.credits;
  const costItems: [('METAL' | 'CRYSTAL' | 'CREDITS'), number][] = [
    ['METAL', activation.cost.metal],
    ['CRYSTAL', activation.cost.crystal],
  ];
  if (activation.cost.credits > 0) costItems.push(['CREDITS', activation.cost.credits]);

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.wellBorder, paddingTop: 8, gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 10, fontWeight: '600', textTransform: 'uppercase', color: active ? colors.positive : colors.danger }}>{active ? t('clans.tavern.active') : t('clans.tavern.inactive')}</Text>
        {active && <Text style={{ fontSize: 10, color: colors.textMuted }}>{formatDuration(secondsLeft)}</Text>}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('clans.tavern.costPer', { hours: activation.durationHours })}</Text>
        <CostLine items={costItems} />
      </View>
      {!active && (
        <Pressable
          disabled={!canManage}
          onPress={() => onActivate(canAfford)}
          style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.accentBg, paddingVertical: 6, alignItems: 'center', opacity: !canManage || !canAfford ? 0.3 : 1 }}
        >
          <Text style={{ fontSize: 10, textTransform: 'uppercase', color: colors.gold }}>{t('clans.tavern.activate')}</Text>
        </Pressable>
      )}
    </View>
  );
}
