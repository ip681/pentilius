import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import type { BoxOpenResultDto, CombatStatsDto, EquipmentSlot, EquippedItemDto, InventoryItemDto, RobotAttributesDto, RobotSlotDto } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { CombatStatsCard } from '@/components/CombatStatsCard';
import { ActionButton, ConfirmButton } from '@/components/ConfirmButton';
import { ScreenTitle } from '@/components/ScreenTitle';
import { Sheet } from '@/components/ui';
import {
  allocateAttribute,
  ApiError,
  consumeItem,
  equipItem,
  getInventory,
  getRobot,
  getRobotAttributes,
  getRobotCombatStats,
  openBox,
  recycleItem,
  sellItem,
  unequipSlot,
  upgradeItem,
} from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors, RACE_TINT } from '@/theme';

// The web's Robot page (apps/web/src/app/(player)/[locale]/robot/page.tsx), as on a phone.
const SLOTS: EquipmentSlot[] = ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'ARMOR', 'CORE', 'LEFT_LEG', 'RIGHT_LEG'];
const ATTRIBUTE_STATS = ['damage', 'defense', 'hp', 'evasion'] as const;
type AttributeStat = (typeof ATTRIBUTE_STATS)[number];

const isBox = (item: InventoryItemDto) => item.itemDefinitionKey.endsWith('_box');
const isBuildingTargeted = (item: InventoryItemDto) => item.itemDefinitionKey.startsWith('construction_speedup');
const isUpgradeMaterial = (item: InventoryItemDto) => item.itemDefinitionKey.endsWith('_fragment') || item.itemDefinitionKey.endsWith('_upgrade');
const qualityColor = (quality: string, fallback: string) => (quality === 'EPIC' ? colors.epic : quality === 'RARE' ? colors.positive : fallback);

export default function RobotScreen() {
  const { profile, refresh: refreshProfile } = useSession();
  const [items, setItems] = useState<InventoryItemDto[] | null>(null);
  const [capacity, setCapacity] = useState(0);
  const [used, setUsed] = useState(0);
  const [slots, setSlots] = useState<RobotSlotDto[] | null>(null);
  const [attributes, setAttributes] = useState<RobotAttributesDto | null>(null);
  const [combatStats, setCombatStats] = useState<CombatStatsDto | null>(null);
  const [filter, setFilter] = useState<EquipmentSlot | 'ALL' | 'CONSUMABLE'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boxResult, setBoxResult] = useState<BoxOpenResultDto | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  const load = useCallback(async () => {
    try {
      const [inventory, robot, attrs, stats] = await Promise.all([getInventory(), getRobot(), getRobotAttributes(), getRobotCombatStats()]);
      setItems(inventory.items);
      setCapacity(inventory.capacity);
      setUsed(inventory.used);
      setSlots(robot);
      setAttributes(attrs);
      setCombatStats(stats);
    } catch {
      setError(t('robot.loadError'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = items?.find((item) => item.id === selectedId) ?? null;
  const itemForSlot = (slot: EquipmentSlot): EquippedItemDto | null => slots?.find((s) => s.slot === slot)?.item ?? null;
  const ownedUpgradeMaterial = selected?.upgradeCost ? (items?.find((i) => i.itemDefinitionKey === selected.upgradeCost!.itemDefinitionKey)?.quantity ?? 0) : 0;
  const canAffordUpgrade = !selected?.upgradeCost || ownedUpgradeMaterial >= selected.upgradeCost.quantity;
  const visibleItems = useMemo(() => {
    if (!items) return [];
    if (filter === 'ALL') return items;
    if (filter === 'CONSUMABLE') return items.filter((item) => item.category === 'CONSUMABLE');
    return items.filter((item) => item.slot === filter);
  }, [items, filter]);

  async function run(action: () => Promise<unknown>, errorKey: string | ((err: unknown) => string), after?: () => void) {
    setError(null);
    try {
      await action();
      after?.();
      refreshProfile();
      await load();
    } catch (err) {
      setError(typeof errorKey === 'function' ? errorKey(err) : t(errorKey));
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // 5 squares per row, as on the web.
  const cell = gridWidth > 0 ? (gridWidth - 4 * 6) / 5 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
        <View style={{ marginBottom: -20 }}>
          <ScreenTitle title={t('robot.title')} subtitle={t('robot.subtitle')} />
        </View>

        {error && <Text style={{ color: '#f87171' }}>{error}</Text>}

        {boxResult && (
          <View style={[panel, { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
            <AssetImage assetId={boxResult.iconAssetId} size={56} label={t(boxResult.nameKey)} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{t('robot.boxOpenedTitle')}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                {t(boxResult.nameKey)} · <Text style={{ color: qualityColor(boxResult.quality, colors.positive) }}>{t(`itemQuality.${boxResult.quality}`)}</Text>
              </Text>
              {boxResult.rolledOptions.length > 0 && (
                <Text style={{ fontSize: 11, color: qualityColor(boxResult.quality, colors.positive) }}>{boxResult.rolledOptions.map((o) => t(`itemOption.${o}`)).join(', ')}</Text>
              )}
              {boxResult.race && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AssetImage assetId={`races.${boxResult.race.toLowerCase()}.icon`} size={14} label={boxResult.race} />
                  <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('robot.raceLocked', { race: t(`race.${boxResult.race}.name`) })}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* INVENTORY */}
        <View style={[panel, { overflow: 'hidden' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.panelBorder, backgroundColor: colors.panelHeader, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{t('robot.inventory')}</Text>
            <Text style={{ fontSize: 9, textTransform: 'uppercase', color: colors.textFaint }}>
              {used}/{capacity}
            </Text>
          </View>
          <View style={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
              {(['ALL', ...SLOTS, 'CONSUMABLE'] as const).map((key) => {
                const active = filter === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setFilter(key)}
                    style={{ borderRadius: 4, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: active ? colors.textFaint : colors.accent, backgroundColor: active ? colors.accentBgHover : colors.accentBg }}
                  >
                    <Text style={{ fontSize: 9, textTransform: 'uppercase', color: colors.text }}>
                      {key === 'ALL' ? t('robot.all') : key === 'CONSUMABLE' ? t('robot.consumables') : t(`equipmentSlot.${key}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {cell > 0 &&
                visibleItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setSelectedId(item.id)}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: selectedId === item.id ? colors.textFaint : qualityColor(item.quality, colors.wellBorder),
                      backgroundColor: item.race ? RACE_TINT[item.race] : colors.well,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AssetImage assetId={item.iconAssetId} size={cell - 8} label={t(item.nameKey)} />
                    {item.quality !== 'NORMAL' && (
                      <Text style={{ position: 'absolute', left: 2, top: 2, fontSize: 7, fontWeight: '600', textTransform: 'uppercase', color: qualityColor(item.quality, colors.text) }}>
                        {t(`itemQuality.${item.quality}`)}
                      </Text>
                    )}
                    {item.equipped && <Badge text={t('robot.equippedBadge')} bg="#1e40af" color={colors.text} />}
                    {item.listedForSale && <Badge text={t('robot.listedBadge')} bg={colors.gold} color={colors.ink} />}
                    {item.slot ? (
                      item.upgradeLevel > 0 && <Text style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 8, fontWeight: '600', color: colors.accent }}>+{item.upgradeLevel}</Text>
                    ) : (
                      <Text style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 8, fontWeight: '600', color: colors.text }}>×{item.quantity}</Text>
                    )}
                  </Pressable>
                ))}
              {cell > 0 &&
                filter === 'ALL' &&
                Array.from({ length: Math.max(0, capacity - used) }, (_, i) => (
                  <View key={`empty-${i}`} style={{ width: cell, height: cell, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(34,45,53,0.6)', backgroundColor: 'rgba(8,12,17,0.4)' }} />
                ))}
            </View>
          </View>
        </View>

        {/* EQUIPMENT */}
        <View style={[panel, { padding: 20 }]}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center', marginBottom: 16 }}>{t('robot.equipment')}</Text>
          <View style={{ borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.well, borderRadius: 6, padding: 24, gap: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
              <View style={{ width: 56 }} />
              <SlotRow slot="HEAD" item={itemForSlot('HEAD')} onSelect={setSelectedId} />
              <SlotRow slot="CORE" item={itemForSlot('CORE')} onSelect={setSelectedId} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
              <SlotRow slot="LEFT_ARM" item={itemForSlot('LEFT_ARM')} onSelect={setSelectedId} />
              <SlotRow slot="ARMOR" item={itemForSlot('ARMOR')} onSelect={setSelectedId} />
              <SlotRow slot="RIGHT_ARM" item={itemForSlot('RIGHT_ARM')} onSelect={setSelectedId} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
              <SlotRow slot="LEFT_LEG" item={itemForSlot('LEFT_LEG')} onSelect={setSelectedId} />
              <SlotRow slot="RIGHT_LEG" item={itemForSlot('RIGHT_LEG')} onSelect={setSelectedId} />
            </View>
          </View>
          {combatStats && (
            <View style={{ marginTop: 16 }}>
              <CombatStatsCard title={t('robot.combatStats')} stats={combatStats} variant="player" />
            </View>
          )}
        </View>

        {/* STATS */}
        {attributes && (
          <View style={[panel, { padding: 20 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{t('robot.attributes')}</Text>
              <Text style={{ fontSize: 9, textTransform: 'uppercase', color: colors.textFaint }}>
                {t('robot.attributePoints')}: <Text style={{ color: colors.text }}>{attributes.available}</Text>
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {ATTRIBUTE_STATS.map((stat: AttributeStat) => {
                const atCap = stat === 'evasion' && attributes.evasionAtCap;
                return (
                  <View key={stat} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, borderRadius: 6, padding: 10 }}>
                    <View>
                      <Text style={{ fontSize: 9, textTransform: 'uppercase', color: colors.textFaint }}>{t(`robot.stat.${stat}`)}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{attributes.base[stat]}</Text>
                    </View>
                    <ActionButton
                      size="sm"
                      disabled={atCap || attributes.available < attributes.nextCost[stat]}
                      onPress={() => run(() => allocateAttribute(stat), 'robot.allocateError')}
                      label={<Text style={{ color: colors.text, fontSize: 10 }}>{atCap ? t('robot.attributeMax') : `+1 (${attributes.nextCost[stat]})`}</Text>}
                    />
                  </View>
                );
              })}
            </View>
            <Text style={{ marginTop: 8, fontSize: 9, color: colors.textFaint }}>{t('robot.attributeNote')}</Text>
          </View>
        )}
      </ScrollView>

      <Sheet open={!!selected} onClose={() => setSelectedId(null)}>
        {selected && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 9, textTransform: 'uppercase', color: colors.textFaint }}>{selected.slot ? t(`equipmentSlot.${selected.slot}`) : t('robot.consumables')}</Text>
              <Pressable onPress={() => setSelectedId(null)} hitSlop={10}>
                <Text style={{ color: colors.textFaint, fontSize: 16 }}>✕</Text>
              </Pressable>
            </View>
            <View style={{ alignSelf: 'center', width: 80, height: 80, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, alignItems: 'center', justifyContent: 'center' }}>
              <AssetImage assetId={selected.iconAssetId} size={64} label={t(selected.nameKey)} />
            </View>

            <View style={{ borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, borderRadius: 6, padding: 16, gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t(selected.nameKey)}</Text>
              {selected.category === 'CONSUMABLE' ? (
                <>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>{t(selected.descriptionKey)}</Text>
                  <Text style={{ fontSize: 10, color: colors.textFaint }}>
                    {t('robot.quantity')}: {selected.quantity}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>
                    {t('robot.upgradeLevel')}: {selected.upgradeLevel}/{selected.maxUpgradeLevel}
                  </Text>
                  {selected.currentStats && (
                    <View style={{ borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.ink, borderRadius: 4, padding: 10, gap: 4 }}>
                      {(['attack', 'defense', 'hp'] as const).map((key) => {
                        const current = selected.currentStats?.[key];
                        if (current === undefined) return null;
                        const next = selected.nextLevelStats?.[key];
                        return (
                          <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 10, color: colors.textFaint }}>{t(`robot.stat.${key === 'attack' ? 'damage' : key}`)}</Text>
                            <Text style={{ fontSize: 10, color: colors.text }}>
                              <Text style={{ fontWeight: '600' }}>{current}</Text>
                              {next !== undefined ? <Text style={{ opacity: 0.8 }}> ({t('common.atNextLevel', { value: next })})</Text> : null}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  {selected.upgradeCost && (
                    <Text style={{ fontSize: 10, color: canAffordUpgrade ? colors.textFaint : colors.danger }}>
                      {t('robot.upgradeCost')}: {t(`items.${selected.upgradeCost.itemDefinitionKey}.name`)} × {selected.upgradeCost.quantity} ({t('robot.owned')}: {ownedUpgradeMaterial})
                    </Text>
                  )}
                  {selected.race && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AssetImage assetId={`races.${selected.race.toLowerCase()}.icon`} size={14} label={selected.race} />
                      <Text style={{ fontSize: 10, color: selected.race === profile?.race ? colors.positive : colors.danger }}>{t('robot.raceLocked', { race: t(`race.${selected.race}.name`) })}</Text>
                    </View>
                  )}
                  {selected.rolledOptions.map((option) => (
                    <Text key={option} style={{ fontSize: 10, color: colors.positive }}>
                      {t(`itemOption.${option}`)}
                    </Text>
                  ))}
                  {selected.sellValue && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('robot.sellValue')}:</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 10, color: colors.textFaint }}>{formatNumber(selected.sellValue.metal)}</Text>
                        <ResourceIcon type="METAL" size={14} />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 10, color: colors.textFaint }}>{formatNumber(selected.sellValue.crystal)}</Text>
                        <ResourceIcon type="CRYSTAL" size={14} />
                      </View>
                    </View>
                  )}
                  {selected.recycleValue && (
                    <Text style={{ fontSize: 10, color: colors.textFaint }}>
                      {t('robot.recycleProgress', {
                        name: t(`items.${selected.recycleValue.fragmentItemDefinitionKey}.name`),
                        owned: selected.recycleValue.ownedFragments,
                        required: selected.recycleValue.fragmentsPerStone,
                      })}
                    </Text>
                  )}
                </>
              )}
            </View>

            {error && <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>}

            {selected.category === 'CONSUMABLE' ? (
              isBox(selected) ? (
                <ActionButton
                  label={t('robot.open')}
                  onPress={() =>
                    run(
                      async () => setBoxResult(await openBox(selected.id)),
                      (err) => (err instanceof ApiError && err.code === 'INVENTORY_FULL' ? t('robot.inventoryFull') : t('robot.openError')),
                      () => setSelectedId(null),
                    )
                  }
                />
              ) : isBuildingTargeted(selected) ? (
                <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('robot.useOnBase')}</Text>
              ) : isUpgradeMaterial(selected) ? (
                <Text style={{ fontSize: 10, color: colors.textFaint }}>{t(selected.itemDefinitionKey.endsWith('_fragment') ? 'robot.useAutoFragment' : 'robot.useAutoUpgrade')}</Text>
              ) : (
                <ActionButton label={t('robot.use')} onPress={() => run(() => consumeItem(selected.id), 'robot.useError')} />
              )
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <ActionButton
                    style={{ flex: 1 }}
                    label={t('robot.equip')}
                    disabled={selected.equipped || selected.listedForSale || (!!selected.race && selected.race !== profile?.race)}
                    onPress={() => run(() => equipItem(selected.id), (err) => (err instanceof ApiError && err.code === 'RACE_MISMATCH' ? t('robot.raceMismatch') : t('robot.actionError')))}
                  />
                  <ActionButton style={{ flex: 1 }} label={t('robot.unequip')} disabled={!selected.equipped} onPress={() => selected.slot && run(() => unequipSlot(selected.slot!), 'robot.actionError')} />
                </View>
                <ActionButton
                  label={t('robot.upgrade')}
                  disabled={selected.upgradeLevel >= selected.maxUpgradeLevel || !canAffordUpgrade || selected.listedForSale}
                  onPress={() => run(() => upgradeItem(selected.id), 'robot.actionError')}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <ConfirmButton
                    key={`sell-${selected.id}`}
                    tone="danger"
                    style={{ flex: 1 }}
                    label={t('robot.sell')}
                    message={selected.sellValue ? t('robot.sellConfirm', { metal: selected.sellValue.metal, crystal: selected.sellValue.crystal }) : undefined}
                    disabled={selected.equipped || selected.listedForSale}
                    onConfirm={() => run(() => sellItem(selected.id), 'robot.actionError', () => setSelectedId(null))}
                  />
                  <ConfirmButton
                    key={`recycle-${selected.id}`}
                    tone="danger"
                    style={{ flex: 1 }}
                    label={t('robot.recycle')}
                    message={
                      selected.recycleValue
                        ? t('robot.recycleConfirm', { name: t(`items.${selected.recycleValue.fragmentItemDefinitionKey}.name`), count: selected.recycleValue.fragments })
                        : undefined
                    }
                    disabled={selected.equipped || selected.listedForSale}
                    onConfirm={() => run(() => recycleItem(selected.id), 'robot.actionError', () => setSelectedId(null))}
                  />
                </View>
              </>
            )}
          </>
        )}
      </Sheet>
    </View>
  );
}

const panel = { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8 } as const;

function Badge({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <View style={{ position: 'absolute', left: 2, bottom: 2, backgroundColor: bg, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 }}>
      <Text style={{ fontSize: 7, fontWeight: '600', textTransform: 'uppercase', color }}>{text}</Text>
    </View>
  );
}

function SlotRow({ slot, item, onSelect }: { slot: EquipmentSlot; item: EquippedItemDto | null; onSelect: (id: string) => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 4, width: 64 }}>
      {item ? (
        <Pressable
          onPress={() => onSelect(item.itemInstanceId)}
          style={{
            width: 56,
            height: 56,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: qualityColor(item.quality, colors.textFaint),
            backgroundColor: item.race ? RACE_TINT[item.race] : colors.well,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AssetImage assetId={item.iconAssetId} size={48} label={t(item.nameKey)} />
          {item.upgradeLevel > 0 && (
            <View style={{ position: 'absolute', right: -4, bottom: -4, backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 7, fontWeight: '600', color: colors.text }}>+{item.upgradeLevel}</Text>
            </View>
          )}
        </Pressable>
      ) : (
        <View style={{ width: 56, height: 56, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.well, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textFaint, fontSize: 14 }}>+</Text>
        </View>
      )}
      <Text style={{ fontSize: 8, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textFaint, textAlign: 'center' }}>{t(`equipmentSlot.${slot}`)}</Text>
    </View>
  );
}
