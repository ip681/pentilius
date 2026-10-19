import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { ActiveResearchDto, BaseResponseDto, BuildingStateDto, ExchangeInfoDto, InventoryItemDto, ResourcesDto } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { FortressFrame, FortressPart } from '@/components/FortressFrame';
import { ScreenTitle } from '@/components/ScreenTitle';
import { Button, ErrorText, Muted, Panel, ProgressBar, Sheet, Small, Title, Well } from '@/components/ui';
import { ApiError, cancelBuildQueue, consumeItem, exchangeResources, getBase, getInventory, queueBuilding, upgradeBuilding } from '@/lib/api';
import { formatDuration, secondsUntil } from '@/lib/duration';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useTicker } from '@/lib/use-ticker';
import { colors } from '@/theme';

// The same rules as the web's Base page (apps/web/src/app/(player)/[locale]/base/page.tsx).
const RESEARCH_CENTER_KEY = 'research_center';
const EXCHANGE_KEY = 'exchange';
const DEFENSE_SYSTEM_KEY = 'defense_system';
const DEFENSIVE_WALL_KEY = 'defensive_wall';
const cardStyle = { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8, paddingHorizontal: 16 } as const;

function buildingProgress(building: BuildingStateDto): { active: boolean; share: number; secondsLeft: number } {
  if (!building.constructionEndsAt || !building.nextLevelCost) return { active: false, share: 0, secondsLeft: 0 };
  const secondsLeft = secondsUntil(building.constructionEndsAt);
  if (secondsLeft <= 0) return { active: false, share: 1, secondsLeft: 0 };
  const started = building.constructionStartedAt ? new Date(building.constructionStartedAt).getTime() : null;
  const ends = new Date(building.constructionEndsAt).getTime();
  const total = started ? (ends - started) / 1000 : building.nextLevelCost.constructionSeconds;
  return { active: true, share: total > 0 ? (total - secondsLeft) / total : 0, secondsLeft };
}

function researchProgress(research: ActiveResearchDto | null): { active: boolean; share: number; secondsLeft: number } {
  if (!research) return { active: false, share: 0, secondsLeft: 0 };
  const secondsLeft = secondsUntil(research.endsAt);
  if (secondsLeft <= 0) return { active: false, share: 1, secondsLeft: 0 };
  return { active: true, share: (research.totalSeconds - secondsLeft) / research.totalSeconds, secondsLeft };
}

function canAfford(cost: { metalCost: number; crystalCost: number } | null, resources: ResourcesDto): boolean {
  return !!cost && resources.metal >= cost.metalCost && resources.crystal >= cost.crystalCost;
}

export default function BaseScreen() {
  const { refresh: refreshProfile } = useSession();
  const [data, setData] = useState<BaseResponseDto | null>(null);
  const [speedups, setSpeedups] = useState<InventoryItemDto[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [base, inventory] = await Promise.all([getBase(), getInventory()]);
      setData(base);
      setSpeedups(inventory.items.filter((item) => item.itemDefinitionKey.startsWith('construction_speedup')));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Countdowns tick every second; when a construction or research ends, reload.
  useTicker([...(data?.buildings.map((b) => b.constructionEndsAt) ?? []), data?.activeResearch?.endsAt], () => {
    load();
    refreshProfile();
  });

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function act(action: () => Promise<unknown>, errorFor: (err: unknown) => string, close = false) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      refreshProfile();
      if (close) setSelectedKey(null);
    } catch (err) {
      setError(errorFor(err));
    } finally {
      setBusy(false);
    }
  }

  const upgradeError = (err: unknown) =>
    err instanceof ApiError && err.code === 'ANOTHER_BUILDING_UNDER_CONSTRUCTION'
      ? t('base.anotherBuildingActive')
      : err instanceof ApiError && err.status === 400
        ? t('base.notEnoughResources')
        : t('base.upgradeError');
  const queueError = (err: unknown) =>
    err instanceof ApiError && err.code === 'BUILD_QUEUE_FULL'
      ? t('base.queueFull')
      : err instanceof ApiError && err.status === 400
        ? t('base.notEnoughResources')
        : t('base.upgradeError');

  const anyUnderConstruction = data?.buildings.some((b) => buildingProgress(b).active) ?? false;
  const constructing = data?.buildings.find((b) => buildingProgress(b).active) ?? null;
  const constructingProgress = constructing ? buildingProgress(constructing) : null;
  const queued = data?.buildQueue ? (data.buildings.find((b) => b.key === data.buildQueue!.buildingKey) ?? null) : null;
  const canQueue = !!data?.isVip && anyUnderConstruction && !data?.buildQueue;
  const selected = data?.buildings.find((b) => b.key === selectedKey) ?? null;

  // Drawn as the wall frame instead of tiles (as on the web).
  const defenseSystem = data?.buildings.find((b) => b.key === DEFENSE_SYSTEM_KEY) ?? null;
  const defensiveWall = data?.buildings.find((b) => b.key === DEFENSIVE_WALL_KEY) ?? null;
  const terrainBuildings = data?.buildings.filter((b) => b.key !== DEFENSE_SYSTEM_KEY && b.key !== DEFENSIVE_WALL_KEY) ?? [];
  const framePart = (building: BuildingStateDto | null): FortressPart | null =>
    building && data
      ? {
          level: building.level,
          constructing: buildingProgress(building).active,
          upgradeReady: !anyUnderConstruction && canAfford(building.nextLevelCost, data.resources),
          onPress: () => setSelectedKey(building.key),
        }
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
        <ScreenTitle title={t('base.title')} subtitle={t('base.subtitle')} />

        {loadFailed && <ErrorText>{t('mobile.loadError')}</ErrorText>}
        {error && !selected && <ErrorText>{error}</ErrorText>}

        {constructing && constructingProgress && (
          <Pressable onPress={() => setSelectedKey(constructing.key)} style={[cardStyle, { marginBottom: 16, paddingVertical: 12 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <Text style={{ flex: 1, fontSize: 12, color: colors.text }}>{t('base.constructing', { building: t(constructing.nameKey), level: constructing.level + 1 })}</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{formatDuration(constructingProgress.secondsLeft)}</Text>
            </View>
            <ProgressBar share={constructingProgress.share} />
          </Pressable>
        )}

        {data?.buildQueue && queued && (
          <View style={[cardStyle, { marginTop: -8, marginBottom: 16, paddingVertical: 8, borderColor: 'rgba(197,168,115,0.4)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }]}>
            <Text style={{ color: colors.vipGold, fontSize: 12, flex: 1 }}>{t('base.queued', { building: t(queued.nameKey), level: data.buildQueue.targetLevel })}</Text>
            <Pressable onPress={() => act(() => cancelBuildQueue(), () => t('base.upgradeError'))}>
              <Text style={{ color: colors.textFaint, fontSize: 11, textDecorationLine: 'underline' }}>{t('base.cancelQueue')}</Text>
            </Pressable>
          </View>
        )}

        {data && (
          <FortressFrame corners={framePart(defenseSystem)} walls={framePart(defensiveWall)}>
            {/* Phones: always 2 per row (owner decision, 2026-10-14). */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 }}>
              {terrainBuildings.map((building) => {
                const progress = buildingProgress(building);
                const research = building.key === RESEARCH_CENTER_KEY && !progress.active ? researchProgress(data.activeResearch) : null;
                const upgradeReady = !anyUnderConstruction && canAfford(building.nextLevelCost, data.resources);
                return (
                  <Pressable key={building.key} onPress={() => setSelectedKey(building.key)} style={{ width: '48%', alignItems: 'center', gap: 4, padding: 4 }}>
                    {upgradeReady && <View style={{ position: 'absolute', right: 8, top: 4, zIndex: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.positive }} />}
                    {building.currentProduction && (
                      <View style={{ position: 'absolute', left: 0, top: 0, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                        <ResourceIcon type={building.currentProduction.resourceType} size={12} />
                        <Text style={{ color: colors.positive, fontSize: 9 }}>
                          +{formatNumber(building.currentProduction.perHour)}/{t('base.perHour')}
                        </Text>
                      </View>
                    )}
                    <AssetImage assetId={building.iconAssetId} size={72} label={t(building.nameKey)} dimmed={building.level === 0} />
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '600', textAlign: 'center' }}>
                        {t(building.nameKey)} <Text style={{ color: 'rgba(255,255,255,0.6)' }}>({building.level})</Text>
                      </Text>
                    </View>
                    {progress.active && (
                      <View style={{ alignSelf: 'stretch', maxWidth: 110, width: '100%', gap: 2 }}>
                        <ProgressBar share={progress.share} height={4} />
                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>{formatDuration(progress.secondsLeft)}</Text>
                      </View>
                    )}
                    {research?.active && (
                      <View style={{ alignSelf: 'stretch', maxWidth: 110, width: '100%', gap: 2 }}>
                        <ProgressBar share={research.share} color={colors.positive} height={4} />
                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>{formatDuration(research.secondsLeft)}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </FortressFrame>
        )}

        {/* Compact list of every base building, opening the same sheet (as on the web). */}
        {data && (
          <View style={{ marginTop: 16, gap: 6 }}>
            {data.buildings.map((building) => (
              <Pressable
                key={building.key}
                onPress={() => setSelectedKey(building.key)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <AssetImage assetId={building.iconAssetId} size={24} label={t(building.nameKey)} dimmed={building.level === 0} />
                <Text style={{ fontSize: 12, color: colors.textMuted }}>({building.level})</Text>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: colors.text }}>
                  {t(building.nameKey)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Sheet
        open={!!selected}
        onClose={() => {
          setSelectedKey(null);
          setError(null);
        }}
      >
        {selected && data && (
          <BuildingDetails
            building={selected}
            data={data}
            anotherActive={!buildingProgress(selected).active && anyUnderConstruction}
            canQueue={canQueue}
            speedups={speedups}
            busy={busy}
            error={error}
            onUpgrade={() => act(() => upgradeBuilding(selected.key), upgradeError)}
            onQueue={() => act(() => queueBuilding(selected.key), queueError, true)}
            onSpeedup={(itemId) => act(() => consumeItem(itemId, selected.key), () => t('base.speedupError'))}
            onExchanged={(base) => {
              setData(base);
              refreshProfile();
            }}
          />
        )}
      </Sheet>
    </View>
  );
}

function BuildingDetails({
  building,
  data,
  anotherActive,
  canQueue,
  speedups,
  busy,
  error,
  onUpgrade,
  onQueue,
  onSpeedup,
  onExchanged,
}: {
  building: BuildingStateDto;
  data: BaseResponseDto;
  anotherActive: boolean;
  canQueue: boolean;
  speedups: InventoryItemDto[];
  busy: boolean;
  error: string | null;
  onUpgrade: () => void;
  onQueue: () => void;
  onSpeedup: (itemInstanceId: string) => void;
  onExchanged: (base: BaseResponseDto) => void;
}) {
  const progress = buildingProgress(building);
  const queueCost = progress.active ? building.afterNextLevelCost : building.nextLevelCost;
  const queueLevel = building.level + (progress.active ? 2 : 1);
  const showQueue = canQueue && !!queueCost;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AssetImage assetId={building.iconAssetId} size={64} label={t(building.nameKey)} />
        <View style={{ flex: 1 }}>
          <Title>{t(building.nameKey)}</Title>
          <Small>
            {t('base.level')} {building.level}/{building.maxLevel}
          </Small>
        </View>
      </View>

      <BuildingEffect building={building} />

      {building.specialLevels.length > 0 && (
        <Well>
          <Small>{t('specialLevels.title')}</Small>
          {building.specialLevels.map((entry) => (
            <Text key={`${entry.kind}-${entry.level}`} style={{ color: entry.reached ? colors.positive : colors.textMuted, fontSize: 12 }}>
              {entry.reached ? '✓ ' : '   '}
              {t('specialLevels.level', { level: entry.level })} — {t(`specialLevels.kinds.${entry.kind}`, { name: entry.nameKey ? t(entry.nameKey) : '' })}
            </Text>
          ))}
        </Well>
      )}

      {building.key === EXCHANGE_KEY && data.exchange && <ExchangePanel info={data.exchange} onDone={onExchanged} />}

      {building.key === RESEARCH_CENTER_KEY && <ResearchEntry research={data.activeResearch} />}

      {progress.active ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Small>{t('base.underConstruction')}</Small>
            <Small>{formatDuration(progress.secondsLeft)}</Small>
          </View>
          <ProgressBar share={progress.share} height={7} />
          {speedups.map((item) => (
            <Button key={item.id} label={`${t(item.nameKey)} (×${item.quantity})`} onPress={() => onSpeedup(item.id)} busy={busy} />
          ))}
        </View>
      ) : building.nextLevelCost ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Well style={{ flex: 1 }}>
            <Small>{t('base.nextLevelCost')}</Small>
            <CostLine type="METAL" amount={building.nextLevelCost.metalCost} enough={data.resources.metal >= building.nextLevelCost.metalCost} />
            <CostLine type="CRYSTAL" amount={building.nextLevelCost.crystalCost} enough={data.resources.crystal >= building.nextLevelCost.crystalCost} />
          </Well>
          <Well style={{ flex: 1 }}>
            <Small>{t('base.buildTime')}</Small>
            <Text style={{ color: colors.text, fontSize: 15 }}>{formatDuration(building.nextLevelCost.constructionSeconds)}</Text>
          </Well>
        </View>
      ) : (
        <Muted>{t('base.maxLevel')}</Muted>
      )}

      {!progress.active && building.nextLevelCost && <Button label={t('base.upgrade')} onPress={onUpgrade} busy={busy} disabled={anotherActive} />}
      {anotherActive && <Small>{t('base.anotherBuildingActive')}</Small>}

      {showQueue && queueCost && (
        <Well style={{ borderColor: colors.gold, gap: 8 }}>
          {progress.active && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <Small>{t('base.queueLevelCost', { level: queueLevel })}</Small>
              <CostLine type="METAL" amount={queueCost.metalCost} enough={data.resources.metal >= queueCost.metalCost} />
              <CostLine type="CRYSTAL" amount={queueCost.crystalCost} enough={data.resources.crystal >= queueCost.crystalCost} />
              <Small>{formatDuration(queueCost.constructionSeconds)}</Small>
            </View>
          )}
          <Button variant="vip" label={t('base.addToQueue', { level: queueLevel })} onPress={onQueue} busy={busy} disabled={!canAfford(queueCost, data.resources)} />
          <Small>{t('base.queueNote')}</Small>
        </Well>
      )}

      {error && <ErrorText>{error}</ErrorText>}
    </>
  );
}

function CostLine({ type, amount, enough }: { type: 'METAL' | 'CRYSTAL'; amount: number; enough: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <ResourceIcon type={type} size={16} />
      <Text style={{ color: enough ? colors.text : colors.danger, fontSize: 14 }}>{formatNumber(amount)}</Text>
    </View>
  );
}

/** One building's effect now and at the next level (the same texts as the web). */
function describeEffect(building: BuildingStateDto, side: 'current' | 'next'): string | null {
  const c = side === 'current';
  const production = c ? building.currentProduction : building.nextLevelProduction;
  const capacity = c ? building.currentCapacityBonus : building.nextLevelCapacityBonus;
  const marketSlots = c ? building.currentMarketSlotBonus : building.nextLevelMarketSlotBonus;
  const defense = c ? building.currentDefenseBonusPercent : building.nextLevelDefenseBonusPercent;
  const protection = c ? building.currentPvpProtectionMinutes : building.nextLevelPvpProtectionMinutes;
  const hidden = c ? building.currentProtectedResources : building.nextLevelProtectedResources;
  const researchCap = c ? building.currentResearchCap : building.nextResearchCap;
  const regen = c ? building.currentEnergyRegenPercent : building.nextEnergyRegenPercent;
  const maxEnergy = c ? building.currentMaxEnergyBonus : building.nextMaxEnergyBonus;
  const exchangeLimit = c ? building.currentExchangeLimit : building.nextExchangeLimit;

  if (production) return `+${formatNumber(production.perHour)} ${t(`resource.${production.resourceType}`)}/${t('base.perHour')}`;
  if (capacity !== null) return `+${capacity} ${t('base.inventorySlots')}`;
  if (marketSlots !== null) return `+${marketSlots} ${t('base.marketSlots')}`;
  if (defense !== null) return t('base.defenseBonus', { percent: defense });
  if (protection !== null) return t('base.pvpProtectionBonus', { minutes: protection });
  if (hidden) return t('base.protectedResources', { metal: hidden.metal, crystal: hidden.crystal });
  if (researchCap !== null) return t('base.researchCap', { level: researchCap });
  if (regen !== null) return maxEnergy ? `${t('base.energyRegen', { percent: regen })}, ${t('base.maxEnergyBonus', { amount: maxEnergy })}` : t('base.energyRegen', { percent: regen });
  if (exchangeLimit !== null) return t('base.exchangeLimit', { amount: formatNumber(exchangeLimit) });
  return null;
}

function effectNoteKey(building: BuildingStateDto): string | null {
  if (building.currentDefenseBonusPercent !== null || building.nextLevelDefenseBonusPercent !== null) return 'base.defenseBonusNote';
  if (building.currentPvpProtectionMinutes !== null || building.nextLevelPvpProtectionMinutes !== null) return 'base.pvpProtectionNote';
  if (building.currentProtectedResources || building.nextLevelProtectedResources) return 'base.protectedResourcesNote';
  return null;
}

function BuildingEffect({ building }: { building: BuildingStateDto }) {
  const current = describeEffect(building, 'current');
  const next = describeEffect(building, 'next');
  if (!current && !next) return <Small>{t('base.noEffect')}</Small>;
  const noteKey = effectNoteKey(building);
  return (
    <Well>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Small>{t('base.currentEffect')}</Small>
        <Text style={{ color: current ? colors.text : colors.textFaint, fontSize: 12, flexShrink: 1, textAlign: 'right' }}>{current ?? t('base.noEffect')}</Text>
      </View>
      {next && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Small>{t('base.nextEffect')}</Small>
          <Text style={{ color: colors.positive, fontSize: 12, flexShrink: 1, textAlign: 'right' }}>{next}</Text>
        </View>
      )}
      {noteKey && <Small>{t(noteKey)}</Small>}
    </Well>
  );
}

function ResearchEntry({ research }: { research: ActiveResearchDto | null }) {
  const progress = researchProgress(research);
  return (
    <Well>
      {research && progress.active ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Small>{t('base.researching', { name: t(research.nameKey), level: research.level })}</Small>
            <Small>{formatDuration(progress.secondsLeft)}</Small>
          </View>
          <ProgressBar share={progress.share} color={colors.positive} height={7} />
        </>
      ) : (
        <Muted>{t('base.noResearch')}</Muted>
      )}
      <Button label={t('base.openResearch')} onPress={() => router.navigate('/research')} />
    </Well>
  );
}

/** Metal <-> Crystal exchange; the preview mirrors the server's formula, the server decides. */
function ExchangePanel({ info, onDone }: { info: ExchangeInfoDto; onDone: (base: BaseResponseDto) => void }) {
  const [from, setFrom] = useState<'METAL' | 'CRYSTAL'>('METAL');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  const to = from === 'METAL' ? 'CRYSTAL' : 'METAL';
  const received = Math.floor(from === 'METAL' ? (value / info.metalPerCrystal) * info.rateFactor : value * info.metalPerCrystal * info.rateFactor);
  const fee = Math.ceil((value * info.creditsPer100) / 100);
  const left = Math.max(0, info.dailyLimit - info.usedToday);

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      onDone(await exchangeResources(from, value));
      setAmount('');
      setDone(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setError(
        code === 'EXCHANGE_DAILY_LIMIT'
          ? t('exchange.errorLimit')
          : code === 'NOT_ENOUGH_CREDITS'
            ? t('exchange.errorCredits')
            : code === 'EXCHANGE_AMOUNT_TOO_SMALL'
              ? t('exchange.errorTooSmall')
              : t('exchange.errorResources'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Well style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Small>{t('exchange.title')}</Small>
        <Small>{t('exchange.left', { left: formatNumber(left), limit: formatNumber(info.dailyLimit) })}</Small>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['METAL', 'CRYSTAL'] as const).map((option) => (
          <Pressable
            key={option}
            onPress={() => setFrom(option)}
            style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: from === option ? colors.accent : colors.wellBorder, backgroundColor: from === option ? colors.accentBg : 'transparent' }}
          >
            <ResourceIcon type={option} size={16} />
            <Text style={{ color: colors.textMuted }}>→</Text>
            <ResourceIcon type={option === 'METAL' ? 'CRYSTAL' : 'METAL'} size={16} />
          </Pressable>
        ))}
      </View>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="number-pad"
        placeholder={t('exchange.amount')}
        placeholderTextColor={colors.textFaint}
        style={{ backgroundColor: colors.panel, borderColor: colors.wellBorder, borderWidth: 1, borderRadius: 6, color: colors.text, paddingHorizontal: 12, paddingVertical: 8 }}
      />
      {value > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Small>{t('exchange.youGet')}</Small>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{formatNumber(received)}</Text>
            <ResourceIcon type={to} size={14} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Small>{t('exchange.fee')}</Small>
            <Text style={{ color: colors.text }}>{formatNumber(fee)}</Text>
            <ResourceIcon type="CREDITS" size={14} />
          </View>
        </View>
      )}
      <Button label={t('exchange.submit')} onPress={submit} busy={busy} disabled={value < 1 || received < 1} />
      {error && <ErrorText>{error}</ErrorText>}
      {done && <Small color={colors.positive}>{t('exchange.done')}</Small>}
    </Well>
  );
}
