import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { EquipmentSlot, ItemTier, ShopItemDto, ShopResponseDto } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { ConfirmButton } from '@/components/ConfirmButton';
import { FilterPill, PillRow, StatsBox } from '@/components/EquipmentDetails';
import { CloseLink } from '@/components/ReportSheet';
import { ScreenTitle } from '@/components/ScreenTitle';
import { Sheet } from '@/components/ui';
import { ApiError, buyItem, getShop } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/use-live';
import { colors } from '@/theme';

const SLOTS: EquipmentSlot[] = ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'ARMOR', 'CORE', 'LEFT_LEG', 'RIGHT_LEG'];
const TIERS: ItemTier[] = ['PIONEER', 'ASCENDANT', 'COREFORGED'];
type PriceType = 'METAL' | 'CRYSTAL' | 'CREDITS';

function priceParts(item: ShopItemDto): { type: PriceType; amount: number }[] {
  const parts: { type: PriceType; amount: number }[] = [];
  if (item.priceMetal > 0) parts.push({ type: 'METAL', amount: item.priceMetal });
  if (item.priceCrystal > 0) parts.push({ type: 'CRYSTAL', amount: item.priceCrystal });
  if (item.priceCredits > 0) parts.push({ type: 'CREDITS', amount: item.priceCredits });
  return parts;
}

// The web's Shop (apps/web/src/app/(player)/[locale]/shop/page.tsx), as on a phone — in-game
// purchases only. Real-money offers stay on the web: in the store apps they must go through
// Google Play / App Store billing (see the Payments plan in OPEN_DECISIONS.md).
export default function ShopScreen() {
  const { refresh: refreshProfile } = useSession();
  const [data, setData] = useState<ShopResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<EquipmentSlot | 'ALL' | 'CONSUMABLE'>('ALL');
  const [tierFilter, setTierFilter] = useState<ItemTier | 'ALL'>('ALL');
  const [detailsKey, setDetailsKey] = useState<string | null>(null);

  async function load() {
    try {
      setData(await getShop());
    } catch {
      setError(t('shop.loadError'));
    }
  }
  useLive(load);

  async function handleBuy(item: ShopItemDto) {
    setError(null);
    setSuccessMessage(null);
    try {
      await buyItem(item.itemDefinitionKey);
      refreshProfile();
      setSuccessMessage(t('shop.bought', { name: t(item.nameKey) }));
      await load();
    } catch (err) {
      const map: Record<string, string> = { NOT_ENOUGH_RESOURCES: t('shop.notEnoughResources'), INVENTORY_FULL: t('shop.inventoryFull') };
      setError(err instanceof ApiError && err.code && map[err.code] ? map[err.code] : t('shop.actionError'));
    }
  }

  const visibleItems = useMemo(
    () =>
      (data?.items ?? []).filter((item) => {
        const matchesType = typeFilter === 'ALL' || (typeFilter === 'CONSUMABLE' ? item.category === 'CONSUMABLE' : item.slot === typeFilter);
        return matchesType && (tierFilter === 'ALL' || item.tier === tierFilter);
      }),
    [data, typeFilter, tierFilter],
  );
  const details = data?.items.find((item) => item.itemDefinitionKey === detailsKey) ?? null;

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <ScreenTitle title={t('shop.title')} subtitle={t('shop.subtitle')} />
      {error && <Text style={{ marginBottom: 16, color: '#f87171' }}>{error}</Text>}
      {successMessage && <Text style={{ marginBottom: 16, color: colors.positive }}>{successMessage}</Text>}

      <View style={{ marginBottom: 12 }}>
        <PillRow>
          <FilterPill label={t('robot.all')} active={typeFilter === 'ALL'} onPress={() => setTypeFilter('ALL')} />
          {SLOTS.map((slot) => (
            <FilterPill key={slot} label={t(`equipmentSlot.${slot}`)} active={typeFilter === slot} onPress={() => setTypeFilter(slot)} />
          ))}
          <FilterPill label={t('robot.consumables')} active={typeFilter === 'CONSUMABLE'} onPress={() => setTypeFilter('CONSUMABLE')} />
        </PillRow>
      </View>
      <View style={{ marginBottom: 24 }}>
        <PillRow>
          <FilterPill label={t('shop.allSets')} active={tierFilter === 'ALL'} onPress={() => setTierFilter('ALL')} />
          {TIERS.map((tier) => (
            <FilterPill key={tier} label={t(`shop.tier.${tier}`)} active={tierFilter === tier} onPress={() => setTierFilter(tier)} />
          ))}
        </PillRow>
      </View>

      <View style={{ gap: 8 }}>
        {visibleItems.map((item) => (
          <View key={item.itemDefinitionKey} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 12 }}>
            <Pressable onPress={() => setDetailsKey(item.itemDefinitionKey)} style={{ width: 56, height: 56, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <AssetImage assetId={item.iconAssetId} size={48} label={t(item.nameKey)} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                {t(item.nameKey)}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 10, color: colors.textFaint }}>
                {t(item.descriptionKey)}
              </Text>
              <StatLine item={item} />
              <RaceLockLine item={item} size={9} />
              <View style={{ marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {priceParts(item).map((part) => (
                  <View key={part.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 12, color: colors.text }}>{formatNumber(part.amount)}</Text>
                    <ResourceIcon type={part.type} size={14} />
                  </View>
                ))}
              </View>
            </View>
            <ConfirmButton
              label={t('shop.buy')}
              size="sm"
              message={t('shop.buyConfirm', { price: priceParts(item).map((p) => `${formatNumber(p.amount)} ${t(`resource.${p.type}`)}`).join(', ') })}
              onConfirm={() => handleBuy(item)}
            />
          </View>
        ))}
      </View>

      {/* Tapping the picture shows the details — the web's hover tooltip. */}
      <Sheet open={!!details} onClose={() => setDetailsKey(null)}>
        {details && (
          <>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t(details.nameKey)}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>{t(details.descriptionKey)}</Text>
            {details.baseStats && <StatsBox stats={details.baseStats} />}
            <RaceLockLine item={details} size={12} />
            <CloseLink onPress={() => setDetailsKey(null)} />
          </>
        )}
      </Sheet>
    </ScrollView>
  );
}

function StatLine({ item }: { item: ShopItemDto }) {
  const stats = (['attack', 'defense', 'hp'] as const).filter((key) => item.baseStats?.[key] !== undefined);
  if (stats.length === 0) return null;
  return (
    <Text style={{ marginTop: 2, fontSize: 10, color: colors.textFaint }}>
      {stats.map((key, index) => (
        <Text key={key}>
          {index > 0 ? '  ' : ''}
          {t(`robot.stat.${key === 'attack' ? 'damage' : key}`)} <Text style={{ color: colors.text }}>{item.baseStats?.[key]}</Text>
        </Text>
      ))}
    </Text>
  );
}

function RaceLockLine({ item, size }: { item: ShopItemDto; size: number }) {
  if (!item.raceLockInfo) return null;
  return (
    <Text style={{ marginTop: 2, fontSize: size, color: size > 9 ? colors.positive : colors.textFaint }}>
      {t('shop.raceLockOwnRace', { percent: Math.round(item.raceLockInfo.ownRaceChance * 100) })}
      {item.raceLockInfo.universalChance > 0 ? ` · ${t('shop.raceLockUniversal', { percent: Math.round(item.raceLockInfo.universalChance * 100) })}` : ''}
    </Text>
  );
}
