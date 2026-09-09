'use client';

import type { EquipmentSlot, InventoryItemDto, ItemOption, ItemQuality, MarketListingDto, PlayerProfileDto, Race } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { ConfirmButton } from '@/components/ConfirmButton';
import { GameLayout } from '@/components/GameLayout';
import { EquipmentTooltipDetails, ItemHoverTooltip, useItemHoverTooltip } from '@/components/ItemHoverTooltip';
import { PlayerLink } from '@/components/PlayerLink';
import { ResourceIcon } from '@/components/ResourceIcon';
import {
  ApiError,
  buyMarketListing,
  cancelMarketListing,
  createMarketListing,
  getInventory,
  getMarketListings,
  getMyClan,
  getMyMarketListings,
  getProfile,
} from '@/lib/api-client';
import { notifyProfileChanged } from '@/lib/profile-events';
import { RACE_BG_CLASS } from '@/lib/race-colors';
import { useRequireAuth } from '@/lib/use-require-auth';

const MAX_ACTIVE_LISTINGS = 5;
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

function QualityBorder(quality: ItemQuality): string {
  return quality === 'EPIC' ? 'border-epic' : quality === 'RARE' ? 'border-positive' : 'border-wellBorder';
}

function FilterBar({
  filters,
  onChange,
  showRaceQualityOptions,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  showRaceQualityOptions: boolean;
}) {
  const t = useTranslations();
  const pill = (active: boolean) =>
    `rounded px-2 py-1 text-[9px] uppercase ${active ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`;

  function toggleOption(option: ItemOption) {
    const has = filters.options.includes(option);
    onChange({ ...filters, options: has ? filters.options.filter((o) => o !== option) : [...filters.options, option] });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-panelBorder bg-panelHeader px-4 py-3">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onChange({ ...filters, slot: 'ALL' })} className={pill(filters.slot === 'ALL')}>
          {t('robot.all')}
        </button>
        {SLOTS.map((slot) => (
          <button key={slot} type="button" onClick={() => onChange({ ...filters, slot })} className={pill(filters.slot === slot)}>
            {t(`equipmentSlot.${slot}`)}
          </button>
        ))}
      </div>

      {showRaceQualityOptions && (
        <>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => onChange({ ...filters, race: 'ALL' })} className={pill(filters.race === 'ALL')}>
              {t('leaderboard.allRaces')}
            </button>
            <button type="button" onClick={() => onChange({ ...filters, race: 'UNIVERSAL' })} className={pill(filters.race === 'UNIVERSAL')}>
              {t('market.universal')}
            </button>
            {RACES.map((race) => (
              <button key={race} type="button" onClick={() => onChange({ ...filters, race })} className={pill(filters.race === race)}>
                {t(`race.${race}.name`)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => onChange({ ...filters, quality: 'ALL' })} className={pill(filters.quality === 'ALL')}>
              {t('robot.all')}
            </button>
            {QUALITIES.map((quality) => (
              <button key={quality} type="button" onClick={() => onChange({ ...filters, quality })} className={pill(filters.quality === quality)}>
                {t(`itemQuality.${quality}`)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {OPTIONS.map((option) => (
              <button key={option} type="button" onClick={() => toggleOption(option)} className={pill(filters.options.includes(option))}>
                {t(`itemOption.${option}`)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  isMine,
  playerRace,
  onBuy,
  onCancel,
}: {
  listing: MarketListingDto;
  isMine: boolean;
  playerRace: Race | undefined;
  onBuy?: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const tooltip = useItemHoverTooltip();

  return (
    <div
      onMouseEnter={tooltip.show}
      onMouseLeave={tooltip.hide}
      className={`relative flex items-center gap-3 rounded-md border p-3 ${QualityBorder(listing.quality)} ${listing.race ? RACE_BG_CLASS[listing.race] : 'bg-well'}`}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-wellBorder bg-ink">
        <AssetIcon
          assetId={listing.iconAssetId}
          alt={t(listing.nameKey)}
          className="h-full w-full object-contain p-1"
          fallback={<span className="text-sm font-semibold text-textMuted">{t(listing.nameKey).charAt(0)}</span>}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {t(listing.nameKey)} {listing.upgradeLevel > 0 && <span className="text-accent">+{listing.upgradeLevel}</span>}
        </p>
        <p className="text-[10px] text-textFaint">
          {t(`shop.tier.${listing.tier}`)} · {t(`equipmentSlot.${listing.slot}`)}
          {(listing.visibleToClanOnly || listing.visibleToFriendsOnly) && (
            <span className="ml-1.5 text-gold">
              ·{' '}
              {listing.visibleToClanOnly && listing.visibleToFriendsOnly
                ? t('market.visibilityClanAndFriends')
                : listing.visibleToClanOnly
                  ? t('market.visibilityClanOnly')
                  : t('market.visibilityFriendsOnly')}
            </span>
          )}
        </p>
        {!isMine && (
          <p className="mt-0.5 text-[10px] text-textFaint">
            {t('market.seller')}: <PlayerLink playerId={listing.sellerId} username={listing.sellerUsername} className="hover:text-accent" />
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          {listing.price.metal > 0 && (
            <span className="flex items-center gap-1">
              {listing.price.metal.toLocaleString()} <ResourceIcon type="METAL" className="h-3.5 w-3.5" />
            </span>
          )}
          {listing.price.crystal > 0 && (
            <span className="flex items-center gap-1">
              {listing.price.crystal.toLocaleString()} <ResourceIcon type="CRYSTAL" className="h-3.5 w-3.5" />
            </span>
          )}
          {listing.price.credits > 0 && (
            <span className="flex items-center gap-1">
              {listing.price.credits.toLocaleString()} <ResourceIcon type="CREDITS" className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
      {isMine ? (
        <ConfirmButton
          label={t('market.cancelListing')}
          confirmLabel={t('common.confirm')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => onCancel?.()}
          className="shrink-0 rounded-md border border-wellBorder px-3 py-1.5 text-[10px] uppercase text-textMuted hover:text-danger"
          confirmClassName="flex-1 rounded-md border border-panelBorderDanger bg-well px-3 py-1.5 text-[10px] uppercase text-danger hover:bg-accentBgHover"
          cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel px-3 py-1.5 text-[10px] uppercase text-textMuted hover:bg-accentBgHover"
          wrapperClassName="shrink-0"
        />
      ) : (
        <ConfirmButton
          label={t('market.buy')}
          confirmLabel={t('common.confirm')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => onBuy?.()}
          className="shrink-0 rounded-md border border-accent bg-accentBg px-3 py-1.5 text-[10px] uppercase hover:bg-accentBgHover"
          confirmClassName="flex-1 rounded-md border border-accent bg-accentBg px-3 py-1.5 text-[10px] uppercase hover:bg-accentBgHover"
          cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel px-3 py-1.5 text-[10px] uppercase text-textMuted hover:bg-accentBgHover"
          wrapperClassName="shrink-0"
        />
      )}

      {tooltip.rect && (
        <ItemHoverTooltip rect={tooltip.rect} name={t(listing.nameKey)}>
          <EquipmentTooltipDetails item={listing} playerRace={playerRace} />
        </ItemHoverTooltip>
      )}
    </div>
  );
}

function PickerItemButton({ item, onSelect }: { item: InventoryItemDto; onSelect: () => void }) {
  const t = useTranslations();
  const tooltip = useItemHoverTooltip();

  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={tooltip.show}
        onMouseLeave={tooltip.hide}
        className={`flex aspect-square items-center justify-center rounded-md border ${QualityBorder(item.quality)} ${item.race ? RACE_BG_CLASS[item.race] : 'bg-well'}`}
      >
        <AssetIcon
          assetId={item.iconAssetId}
          alt={t(item.nameKey)}
          className="h-full w-full object-contain p-1"
          fallback={<span className="text-sm font-semibold text-textMuted">{t(item.nameKey).charAt(0)}</span>}
        />
      </button>
      {tooltip.rect && (
        <ItemHoverTooltip rect={tooltip.rect} name={t(item.nameKey)}>
          <EquipmentTooltipDetails item={item} playerRace={undefined} />
        </ItemHoverTooltip>
      )}
    </>
  );
}

export default function MarketPage() {
  useRequireAuth();
  const t = useTranslations();
  const [listings, setListings] = useState<MarketListingDto[] | null>(null);
  const [myListings, setMyListings] = useState<MarketListingDto[] | null>(null);
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browseFilters, setBrowseFilters] = useState<Filters>(DEFAULT_FILTERS);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilters, setPickerFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [eligibleItems, setEligibleItems] = useState<InventoryItemDto[] | null>(null);
  const [itemToList, setItemToList] = useState<InventoryItemDto | null>(null);
  const [priceMetal, setPriceMetal] = useState('');
  const [priceCrystal, setPriceCrystal] = useState('');
  const [priceCredits, setPriceCredits] = useState('');
  const [visibleToClanOnly, setVisibleToClanOnly] = useState(false);
  const [visibleToFriendsOnly, setVisibleToFriendsOnly] = useState(false);
  const [inClan, setInClan] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);

  async function load() {
    try {
      const [all, mine, profileRes, myClanRes] = await Promise.all([getMarketListings(), getMyMarketListings(), getProfile(), getMyClan()]);
      setListings(all);
      setMyListings(mine);
      setProfile(profileRes);
      setInClan(myClanRes.clan !== null);
    } catch {
      setError(t('market.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      const map: Record<string, string> = {
        ONLY_EQUIPMENT_LISTABLE: t('market.errorOnlyEquipment'),
        ITEM_EQUIPPED: t('market.errorItemEquipped'),
        ITEM_ALREADY_LISTED: t('market.errorAlreadyListed'),
        TOO_MANY_LISTINGS: t('market.errorTooManyListings'),
        PRICE_REQUIRED: t('market.errorPriceRequired'),
        CANNOT_BUY_OWN_LISTING: t('market.errorCannotBuyOwn'),
        NOT_ENOUGH_RESOURCES: t('market.errorNotEnoughResources'),
        NOT_IN_CLAN: t('market.errorNotInClan'),
      };
      if (err.code && map[err.code]) return map[err.code];
    }
    return t('market.actionError');
  }

  async function openPicker() {
    setListingError(null);
    setItemToList(null);
    setPriceMetal('');
    setPriceCrystal('');
    setPriceCredits('');
    setVisibleToClanOnly(false);
    setVisibleToFriendsOnly(false);
    setPickerFilters(DEFAULT_FILTERS);
    setPickerOpen(true);
    try {
      const inventory = await getInventory();
      setEligibleItems(inventory.items.filter((item) => item.category === 'EQUIPMENT' && !item.equipped && !item.listedForSale));
    } catch {
      setEligibleItems([]);
    }
  }

  async function handleCreateListing(event: React.FormEvent) {
    event.preventDefault();
    if (!itemToList) return;
    setListingError(null);
    try {
      await createMarketListing(
        itemToList.id,
        { priceMetal: Number(priceMetal) || 0, priceCrystal: Number(priceCrystal) || 0, priceCredits: Number(priceCredits) || 0 },
        { visibleToClanOnly, visibleToFriendsOnly },
      );
      setPickerOpen(false);
      await load();
    } catch (err) {
      setListingError(errorMessage(err));
    }
  }

  async function handleCancel(listingId: string) {
    setError(null);
    try {
      await cancelMarketListing(listingId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleBuy(listingId: string) {
    setError(null);
    try {
      await buyMarketListing(listingId);
      notifyProfileChanged();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const otherListings = useMemo(
    () => (listings ?? []).filter((l) => l.sellerId !== profile?.id && matchesFilters(l, browseFilters)),
    [listings, profile?.id, browseFilters],
  );
  const filteredEligibleItems = useMemo(
    () => (eligibleItems ?? []).filter((item) => matchesFilters(item, pickerFilters)),
    [eligibleItems, pickerFilters],
  );

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('market.title')}</h1>
        <p className="text-xs text-textMuted">{t('market.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      <section className="mb-6 overflow-hidden rounded-lg border border-panelBorder bg-panel">
        <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-textFaint">
            {t('market.myListings')} ({myListings?.length ?? 0}/{MAX_ACTIVE_LISTINGS})
          </h2>
          <button
            type="button"
            onClick={openPicker}
            disabled={(myListings?.length ?? 0) >= MAX_ACTIVE_LISTINGS}
            className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-[10px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t('market.listItem')}
          </button>
        </div>
        <div className="flex flex-col gap-2 p-3">
          {myListings?.length === 0 && <p className="p-2 text-xs text-textFaint">{t('market.noMyListings')}</p>}
          {myListings?.map((listing) => (
            <ListingCard key={listing.id} listing={listing} isMine playerRace={profile?.race} onCancel={() => handleCancel(listing.id)} />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-panelBorder bg-panel">
        <div className="flex items-center justify-between border-b border-panelBorder bg-panelHeader px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-textFaint">{t('market.browse')}</h2>
        </div>
        <FilterBar filters={browseFilters} onChange={setBrowseFilters} showRaceQualityOptions />
        <div className="flex flex-col gap-2 p-3">
          {otherListings.length === 0 && <p className="p-2 text-xs text-textFaint">{t('market.noListings')}</p>}
          {otherListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} isMine={false} playerRace={profile?.race} onBuy={() => handleBuy(listing.id)} />
          ))}
        </div>
      </section>

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{itemToList ? t('market.setPrice') : t('market.pickItem')}</h3>
          <button type="button" onClick={() => setPickerOpen(false)} aria-label={t('common.close')} className="text-textFaint hover:text-text">
            ✕
          </button>
        </div>

        {!itemToList ? (
          <>
            <div className="-mx-5 mb-2">
              <FilterBar filters={pickerFilters} onChange={setPickerFilters} showRaceQualityOptions={false} />
            </div>
            <div className="grid max-h-[280px] grid-cols-5 gap-1.5 overflow-y-auto">
              {filteredEligibleItems.length === 0 && <p className="col-span-5 text-xs text-textFaint">{t('market.noEligibleItems')}</p>}
              {filteredEligibleItems.map((item) => (
                <PickerItemButton key={item.id} item={item} onSelect={() => setItemToList(item)} />
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={handleCreateListing} className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-md border border-wellBorder bg-well p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-wellBorder bg-ink">
                <AssetIcon
                  assetId={itemToList.iconAssetId}
                  alt={t(itemToList.nameKey)}
                  className="h-full w-full object-contain p-1"
                  fallback={<span className="text-sm font-semibold text-textMuted">{t(itemToList.nameKey).charAt(0)}</span>}
                />
              </div>
              <p className="text-sm font-semibold">{t(itemToList.nameKey)}</p>
            </div>

            <p className="text-[10px] uppercase tracking-wide text-textFaint">{t('market.desiredPrice')}</p>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col items-center gap-1 text-[10px] text-textMuted">
                <ResourceIcon type="METAL" className="h-4 w-4" />
                <input
                  type="number"
                  min={0}
                  value={priceMetal}
                  onChange={(e) => setPriceMetal(e.target.value)}
                  className="w-full rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-center text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col items-center gap-1 text-[10px] text-textMuted">
                <ResourceIcon type="CRYSTAL" className="h-4 w-4" />
                <input
                  type="number"
                  min={0}
                  value={priceCrystal}
                  onChange={(e) => setPriceCrystal(e.target.value)}
                  className="w-full rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-center text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col items-center gap-1 text-[10px] text-textMuted">
                <ResourceIcon type="CREDITS" className="h-4 w-4" />
                <input
                  type="number"
                  min={0}
                  value={priceCredits}
                  onChange={(e) => setPriceCredits(e.target.value)}
                  className="w-full rounded-md border border-wellBorder bg-ink px-2 py-1.5 text-center text-sm text-text outline-none focus:border-accent"
                />
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={`flex items-center gap-2 text-xs ${inClan ? 'text-textMuted' : 'cursor-not-allowed text-textFaint opacity-50'}`}>
                <input
                  type="checkbox"
                  checked={visibleToClanOnly}
                  disabled={!inClan}
                  onChange={(e) => setVisibleToClanOnly(e.target.checked)}
                  className="accent-accent"
                />
                {t('market.clanOnly')}
              </label>
              <label className="flex items-center gap-2 text-xs text-textMuted">
                <input
                  type="checkbox"
                  checked={visibleToFriendsOnly}
                  onChange={(e) => setVisibleToFriendsOnly(e.target.checked)}
                  className="accent-accent"
                />
                {t('market.friendsOnly')}
              </label>
            </div>

            {listingError && <p className="text-xs text-danger">{listingError}</p>}

            <div className="flex gap-2">
              <button type="submit" className="flex-1 rounded-md border border-accent bg-accentBg py-2 text-xs uppercase hover:bg-accentBgHover">
                {t('market.confirmListing')}
              </button>
              <button
                type="button"
                onClick={() => setItemToList(null)}
                className="rounded-md border border-wellBorder px-4 py-2 text-xs uppercase text-textMuted hover:text-text"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        )}
      </BottomSheet>
    </GameLayout>
  );
}
