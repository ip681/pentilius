import { ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { EquipmentSlot, InventoryItemDto, ItemOption, ItemQuality, MarketListingDto, Race } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { CheckRow, ConfirmButton } from '@/components/ConfirmButton';
import { EquipmentDetails, FilterPill, PillRow } from '@/components/EquipmentDetails';
import { PlayerLink } from '@/components/PlayerLink';
import { CloseLink } from '@/components/ReportSheet';
import { ScreenTitle } from '@/components/ScreenTitle';
import { Sheet } from '@/components/ui';
import { ApiError, buyMarketListing, cancelMarketListing, createMarketListing, getInventory, getMarketListings, getMyClan, getMyMarketListings } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/use-live';
import { colors, RACE_TINT } from '@/theme';

const SLOTS: EquipmentSlot[] = ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'ARMOR', 'CORE', 'LEFT_LEG', 'RIGHT_LEG'];
const RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];
const QUALITIES: ItemQuality[] = ['NORMAL', 'RARE', 'EPIC'];
const OPTIONS: ItemOption[] = ['INCREASE_DAMAGE', 'CRITICAL_DAMAGE', 'INCREASE_MAX_HP', 'DAMAGE_DECREASE', 'DAMAGE_REFLECT'];

interface Filters {
  slot: EquipmentSlot | 'ALL';
  race: Race | 'ALL' | 'UNIVERSAL';
  quality: ItemQuality | 'ALL';
  options: ItemOption[];
}
const DEFAULT_FILTERS: Filters = { slot: 'ALL', race: 'ALL', quality: 'ALL', options: [] };

function matchesFilters(item: { slot: EquipmentSlot | null; quality: ItemQuality; race: Race | null; rolledOptions: ItemOption[] }, filters: Filters): boolean {
  if (filters.slot !== 'ALL' && item.slot !== filters.slot) return false;
  if (filters.quality !== 'ALL' && item.quality !== filters.quality) return false;
  if (filters.race === 'UNIVERSAL' && item.race !== null) return false;
  if (filters.race !== 'ALL' && filters.race !== 'UNIVERSAL' && item.race !== filters.race) return false;
  if (filters.options.length > 0 && !filters.options.some((o) => item.rolledOptions.includes(o))) return false;
  return true;
}

const qualityBorder = (quality: ItemQuality) => (quality === 'EPIC' ? colors.epic : quality === 'RARE' ? colors.positive : colors.wellBorder);
const itemBackground = (race: Race | null, fallback: string) => (race ? RACE_TINT[race] : fallback);

// The web's Market (apps/web/src/app/(player)/[locale]/market/page.tsx), as on a phone.
export default function MarketScreen() {
  const { profile, refresh: refreshProfile } = useSession();
  const [listings, setListings] = useState<MarketListingDto[] | null>(null);
  const [myListings, setMyListings] = useState<MarketListingDto[] | null>(null);
  const [capacity, setCapacity] = useState(0);
  const [inClan, setInClan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseFilters, setBrowseFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [details, setDetails] = useState<MarketListingDto | InventoryItemDto | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilters, setPickerFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [eligibleItems, setEligibleItems] = useState<InventoryItemDto[] | null>(null);
  const [itemToList, setItemToList] = useState<InventoryItemDto | null>(null);
  const [price, setPrice] = useState({ metal: '', crystal: '', credits: '' });
  const [clanOnly, setClanOnly] = useState(false);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);

  async function load() {
    try {
      const [all, mine, myClan] = await Promise.all([getMarketListings(), getMyMarketListings(), getMyClan()]);
      setListings(all);
      setMyListings(mine.listings);
      setCapacity(mine.capacity);
      setInClan(myClan.clan !== null);
    } catch {
      setError(t('market.loadError'));
    }
  }
  useLive(load);

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError && err.code) {
      const map: Record<string, string> = {
        ONLY_EQUIPMENT_LISTABLE: t('market.errorOnlyEquipment'),
        ITEM_EQUIPPED: t('market.errorItemEquipped'),
        ITEM_ALREADY_LISTED: t('market.errorAlreadyListed'),
        TOO_MANY_LISTINGS: t('market.errorTooManyListings'),
        TRADING_POST_REQUIRED: t('market.errorTradingPostRequired'),
        PRICE_REQUIRED: t('market.errorPriceRequired'),
        CANNOT_BUY_OWN_LISTING: t('market.errorCannotBuyOwn'),
        NOT_ENOUGH_RESOURCES: t('market.errorNotEnoughResources'),
        NOT_IN_CLAN: t('market.errorNotInClan'),
      };
      if (map[err.code]) return map[err.code];
    }
    return t('market.actionError');
  }

  async function openPicker() {
    setError(null);
    if (capacity === 0) return setError(t('market.errorTradingPostRequired'));
    if ((myListings?.length ?? 0) >= capacity) return setError(t('market.errorTooManyListings'));
    setListingError(null);
    setItemToList(null);
    setPrice({ metal: '', crystal: '', credits: '' });
    setClanOnly(false);
    setFriendsOnly(false);
    setPickerFilters(DEFAULT_FILTERS);
    setEligibleItems(null);
    setPickerOpen(true);
    try {
      const inventory = await getInventory();
      setEligibleItems(inventory.items.filter((item) => item.category === 'EQUIPMENT' && !item.equipped && !item.listedForSale));
    } catch {
      setEligibleItems([]);
    }
  }

  async function createListing() {
    if (!itemToList) return;
    setListingError(null);
    try {
      await createMarketListing(
        itemToList.id,
        { priceMetal: Number(price.metal) || 0, priceCrystal: Number(price.crystal) || 0, priceCredits: Number(price.credits) || 0 },
        { visibleToClanOnly: clanOnly, visibleToFriendsOnly: friendsOnly },
      );
      setPickerOpen(false);
      await load();
    } catch (err) {
      setListingError(errorMessage(err));
    }
  }

  async function run(action: () => Promise<void>, refreshResources = false) {
    setError(null);
    try {
      await action();
      if (refreshResources) refreshProfile();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const otherListings = useMemo(() => (listings ?? []).filter((l) => l.sellerId !== profile?.id && matchesFilters(l, browseFilters)), [listings, profile?.id, browseFilters]);
  const filteredEligible = useMemo(() => (eligibleItems ?? []).filter((item) => matchesFilters(item, pickerFilters)), [eligibleItems, pickerFilters]);
  const full = (myListings?.length ?? 0) >= capacity;

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <ScreenTitle title={t('market.title')} subtitle={t('market.subtitle')} />
      {error && <Text style={{ marginBottom: 16, color: '#f87171' }}>{error}</Text>}

      <Section
        title={`${t('market.myListings')} (${myListings?.length ?? 0}/${capacity})`}
        action={
          <Pressable onPress={openPicker} style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentBg, paddingHorizontal: 12, paddingVertical: 6, opacity: full ? 0.3 : 1 }}>
            <Text style={{ fontSize: 10, textTransform: 'uppercase', color: colors.text }}>{t('market.listItem')}</Text>
          </Pressable>
        }
      >
        <View style={{ padding: 12, gap: 8 }}>
          {myListings?.length === 0 && <Text style={{ padding: 8, fontSize: 12, color: colors.textFaint }}>{t('market.noMyListings')}</Text>}
          {myListings?.map((listing) => (
            <ListingCard key={listing.id} listing={listing} isMine onDetails={() => setDetails(listing)} onAction={() => run(() => cancelMarketListing(listing.id))} />
          ))}
        </View>
      </Section>

      <View style={{ height: 24 }} />

      <Section title={t('market.browse')}>
        <FilterBar filters={browseFilters} onChange={setBrowseFilters} showRaceQualityOptions />
        <View style={{ padding: 12, gap: 8 }}>
          {otherListings.length === 0 && <Text style={{ padding: 8, fontSize: 12, color: colors.textFaint }}>{t('market.noListings')}</Text>}
          {otherListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} isMine={false} onDetails={() => setDetails(listing)} onAction={() => run(() => buyMarketListing(listing.id), true)} />
          ))}
        </View>
      </Section>

      {/* Tapping an item shows its details — the web's hover tooltip. */}
      <Sheet open={!!details && !pickerOpen} onClose={() => setDetails(null)}>
        {details && (
          <>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t(details.nameKey)}</Text>
            <EquipmentDetails item={details} playerRace={profile?.race} />
            <CloseLink onPress={() => setDetails(null)} />
          </>
        )}
      </Sheet>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{itemToList ? t('market.setPrice') : t('market.pickItem')}</Text>
          <Text onPress={() => setPickerOpen(false)} style={{ fontSize: 16, color: colors.textFaint, paddingHorizontal: 4 }}>
            ✕
          </Text>
        </View>
        {!itemToList ? (
          <>
            <FilterBar filters={pickerFilters} onChange={setPickerFilters} showRaceQualityOptions={false} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {eligibleItems && filteredEligible.length === 0 && <Text style={{ fontSize: 12, color: colors.textFaint }}>{t('market.noEligibleItems')}</Text>}
              {filteredEligible.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setItemToList(item)}
                  style={{ width: '18%', aspectRatio: 1, borderRadius: 6, borderWidth: 1, borderColor: qualityBorder(item.quality), backgroundColor: itemBackground(item.race, colors.well), alignItems: 'center', justifyContent: 'center' }}
                >
                  <AssetImage assetId={item.iconAssetId} size={48} label={t(item.nameKey)} />
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, padding: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 6, borderWidth: 1, borderColor: qualityBorder(itemToList.quality), backgroundColor: itemBackground(itemToList.race, colors.ink), alignItems: 'center', justifyContent: 'center' }}>
                <AssetImage assetId={itemToList.iconAssetId} size={44} label={t(itemToList.nameKey)} />
              </View>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.text }}>{t(itemToList.nameKey)}</Text>
            </View>
            <EquipmentDetails item={itemToList} playerRace={undefined} />
            <Text style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{t('market.desiredPrice')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['METAL', 'CRYSTAL', 'CREDITS'] as const).map((type) => {
                const field = type.toLowerCase() as 'metal' | 'crystal' | 'credits';
                return (
                  <View key={type} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <ResourceIcon type={type} />
                    <TextInput
                      value={price[field]}
                      onChangeText={(v) => setPrice((prev) => ({ ...prev, [field]: v.replace(/[^0-9]/g, '') }))}
                      keyboardType="number-pad"
                      style={{ alignSelf: 'stretch', textAlign: 'center', borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.ink, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, color: colors.text }}
                    />
                  </View>
                );
              })}
            </View>
            <CheckRow label={t('market.clanOnly')} checked={clanOnly} disabled={!inClan} onChange={setClanOnly} />
            <CheckRow label={t('market.friendsOnly')} checked={friendsOnly} onChange={setFriendsOnly} />
            {listingError && <Text style={{ fontSize: 12, color: colors.danger }}>{listingError}</Text>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={createListing} style={{ flex: 1, borderRadius: 6, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentBg, paddingVertical: 9, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, textTransform: 'uppercase', color: colors.text }}>{t('market.confirmListing')}</Text>
              </Pressable>
              <Pressable onPress={() => setItemToList(null)} style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, paddingHorizontal: 16, paddingVertical: 9, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, textTransform: 'uppercase', color: colors.textMuted }}>{t('common.cancel')}</Text>
              </Pressable>
            </View>
          </>
        )}
      </Sheet>
    </ScrollView>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.panelBorder, backgroundColor: colors.panelHeader, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function FilterBar({ filters, onChange, showRaceQualityOptions }: { filters: Filters; onChange: (filters: Filters) => void; showRaceQualityOptions: boolean }) {
  const toggleOption = (option: ItemOption) =>
    onChange({ ...filters, options: filters.options.includes(option) ? filters.options.filter((o) => o !== option) : [...filters.options, option] });
  return (
    <View style={{ gap: 8, borderBottomWidth: 1, borderBottomColor: colors.panelBorder, backgroundColor: colors.panelHeader, paddingHorizontal: 16, paddingVertical: 12 }}>
      <PillRow>
        <FilterPill label={t('robot.all')} active={filters.slot === 'ALL'} onPress={() => onChange({ ...filters, slot: 'ALL' })} />
        {SLOTS.map((slot) => (
          <FilterPill key={slot} label={t(`equipmentSlot.${slot}`)} active={filters.slot === slot} onPress={() => onChange({ ...filters, slot })} />
        ))}
      </PillRow>
      {showRaceQualityOptions && (
        <>
          <PillRow>
            <FilterPill label={t('leaderboard.allRaces')} active={filters.race === 'ALL'} onPress={() => onChange({ ...filters, race: 'ALL' })} />
            <FilterPill label={t('market.universal')} active={filters.race === 'UNIVERSAL'} onPress={() => onChange({ ...filters, race: 'UNIVERSAL' })} />
            {RACES.map((race) => (
              <FilterPill key={race} label={t(`race.${race}.name`)} active={filters.race === race} onPress={() => onChange({ ...filters, race })} />
            ))}
          </PillRow>
          <PillRow>
            <FilterPill label={t('robot.all')} active={filters.quality === 'ALL'} onPress={() => onChange({ ...filters, quality: 'ALL' })} />
            {QUALITIES.map((quality) => (
              <FilterPill key={quality} label={t(`itemQuality.${quality}`)} active={filters.quality === quality} onPress={() => onChange({ ...filters, quality })} />
            ))}
          </PillRow>
          <PillRow>
            {OPTIONS.map((option) => (
              <FilterPill key={option} label={t(`itemOption.${option}`)} active={filters.options.includes(option)} onPress={() => toggleOption(option)} />
            ))}
          </PillRow>
        </>
      )}
    </View>
  );
}

function ListingCard({ listing, isMine, onDetails, onAction }: { listing: MarketListingDto; isMine: boolean; onDetails: () => void; onAction: () => void }) {
  const visibility =
    listing.visibleToClanOnly && listing.visibleToFriendsOnly
      ? t('market.visibilityClanAndFriends')
      : listing.visibleToClanOnly
        ? t('market.visibilityClanOnly')
        : listing.visibleToFriendsOnly
          ? t('market.visibilityFriendsOnly')
          : null;
  const prices = (
    [
      ['METAL', listing.price.metal],
      ['CRYSTAL', listing.price.crystal],
      ['CREDITS', listing.price.credits],
    ] as const
  ).filter(([, amount]) => amount > 0);
  return (
    <Pressable
      onPress={onDetails}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 6, borderWidth: 1, borderColor: qualityBorder(listing.quality), backgroundColor: itemBackground(listing.race, colors.well), padding: 12 }}
    >
      <View style={{ width: 56, height: 56, borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <AssetImage assetId={listing.iconAssetId} size={48} label={t(listing.nameKey)} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
          {t(listing.nameKey)} {listing.upgradeLevel > 0 ? <Text style={{ color: colors.accent }}>+{listing.upgradeLevel}</Text> : null}
        </Text>
        <Text style={{ fontSize: 10, color: colors.textFaint }}>
          {t(`shop.tier.${listing.tier}`)} · {t(`equipmentSlot.${listing.slot}`)}
          {visibility ? <Text style={{ color: colors.gold }}> · {visibility}</Text> : null}
        </Text>
        {!isMine && (
          <Text style={{ marginTop: 2, fontSize: 10, color: colors.textFaint }}>
            {t('market.seller')}: <PlayerLink playerId={listing.sellerId} username={listing.sellerUsername} isVip={listing.sellerIsVip} />
          </Text>
        )}
        <View style={{ marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {prices.map(([type, amount]) => (
            <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 12, color: colors.text }}>{formatNumber(amount)}</Text>
              <ResourceIcon type={type} size={14} />
            </View>
          ))}
        </View>
      </View>
      <ConfirmButton label={isMine ? t('market.cancelListing') : t('market.buy')} tone={isMine ? 'plain' : 'accent'} size="sm" onConfirm={onAction} />
    </Pressable>
  );
}
