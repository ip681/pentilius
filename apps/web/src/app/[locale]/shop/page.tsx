'use client';

import type { EquipmentSlot, ItemTier, ResourceType, ShopItemDto, ShopResponseDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ConfirmButton } from '@/components/ConfirmButton';
import { GameLayout } from '@/components/GameLayout';
import { ResourceIcon } from '@/components/ResourceIcon';
import { ApiError, buyItem, getShop } from '@/lib/api-client';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';

const SLOTS: EquipmentSlot[] = ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'ARMOR', 'CORE', 'LEFT_LEG', 'RIGHT_LEG'];
const TIERS: ItemTier[] = ['PIONEER', 'ASCENDANT', 'COREFORGED'];

export default function ShopPage() {
  useRequireAuth();
  const t = useTranslations();
  const [data, setData] = useState<ShopResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<EquipmentSlot | 'ALL' | 'CONSUMABLE'>('ALL');
  const [tierFilter, setTierFilter] = useState<ItemTier | 'ALL'>('ALL');

  async function load() {
    try {
      setData(await getShop());
    } catch {
      setError(t('shop.loadError'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      const map: Record<string, string> = {
        NOT_ENOUGH_RESOURCES: t('shop.notEnoughResources'),
        INVENTORY_FULL: t('shop.inventoryFull'),
      };
      if (err.code && map[err.code]) return map[err.code];
    }
    return t('shop.actionError');
  }

  async function handleBuy(key: string, nameKey: string) {
    setError(null);
    setSuccessMessage(null);
    try {
      await buyItem(key);
      notifyProfileChanged();
      setSuccessMessage(t('shop.bought', { name: t(nameKey) }));
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function priceLabel(item: ShopItemDto): string {
    const parts: string[] = [];
    if (item.priceMetal > 0) parts.push(`${item.priceMetal} ${t('resource.METAL')}`);
    if (item.priceCrystal > 0) parts.push(`${item.priceCrystal} ${t('resource.CRYSTAL')}`);
    if (item.priceCredits > 0) parts.push(`${item.priceCredits} ${t('resource.CREDITS')}`);
    return parts.join(', ');
  }

  function priceParts(item: ShopItemDto): { type: ResourceType; amount: number }[] {
    const parts: { type: ResourceType; amount: number }[] = [];
    if (item.priceMetal > 0) parts.push({ type: 'METAL', amount: item.priceMetal });
    if (item.priceCrystal > 0) parts.push({ type: 'CRYSTAL', amount: item.priceCrystal });
    if (item.priceCredits > 0) parts.push({ type: 'CREDITS', amount: item.priceCredits });
    return parts;
  }

  const visibleItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter((item) => {
      const matchesType = typeFilter === 'ALL' || (typeFilter === 'CONSUMABLE' ? item.category === 'CONSUMABLE' : item.slot === typeFilter);
      const matchesTier = tierFilter === 'ALL' || item.tier === tierFilter;
      return matchesType && matchesTier;
    });
  }, [data, typeFilter, tierFilter]);

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('shop.title')}</h1>
        <p className="text-xs text-textMuted">{t('shop.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}
      {successMessage && <p className="mb-4 text-positive">{successMessage}</p>}

      <div className="mb-3 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setTypeFilter('ALL')}
          className={`rounded px-2 py-1.5 text-[9px] uppercase ${typeFilter === 'ALL' ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`}
        >
          {t('robot.all')}
        </button>
        {SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => setTypeFilter(slot)}
            className={`rounded px-2 py-1.5 text-[9px] uppercase ${typeFilter === slot ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`}
          >
            {t(`equipmentSlot.${slot}`)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTypeFilter('CONSUMABLE')}
          className={`rounded px-2 py-1.5 text-[9px] uppercase ${typeFilter === 'CONSUMABLE' ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`}
        >
          {t('robot.consumables')}
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setTierFilter('ALL')}
          className={`rounded px-2 py-1.5 text-[9px] uppercase ${tierFilter === 'ALL' ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`}
        >
          {t('shop.allSets')}
        </button>
        {TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            onClick={() => setTierFilter(tier)}
            className={`rounded px-2 py-1.5 text-[9px] uppercase ${tierFilter === tier ? 'border border-textFaint bg-accentBgHover' : 'border border-accent bg-accentBg'}`}
          >
            {t(`shop.tier.${tier}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4">
        {visibleItems.map((item) => (
          <div key={item.itemDefinitionKey} className="flex flex-col rounded-lg border border-panelBorder bg-panel p-5">
            <div className="flex-1">
              <div className="mx-auto mb-3 h-16 w-16">
                <AssetIcon
                  assetId={item.iconAssetId}
                  alt={t(item.nameKey)}
                  className="h-full w-full object-contain"
                  fallback={<span className="text-lg font-semibold text-textMuted">{t(item.nameKey).charAt(0)}</span>}
                />
              </div>
              <h2 className="mb-1 text-center text-sm font-semibold">{t(item.nameKey)}</h2>
              <p className="mb-2 text-center text-[10px] text-textMuted">{t(item.descriptionKey)}</p>

              {item.baseStats && (item.baseStats.attack !== undefined || item.baseStats.defense !== undefined || item.baseStats.hp !== undefined) && (
                <div className="mb-2 rounded border border-wellBorder bg-ink p-2">
                  {(['attack', 'defense', 'hp'] as const).map((key) => {
                    const value = item.baseStats?.[key];
                    if (value === undefined) return null;
                    return (
                      <div key={key} className="flex justify-between text-[10px] text-textFaint last:mb-0">
                        <span>{t(`robot.stat.${key === 'attack' ? 'damage' : key}`)}</span>
                        <span className="text-text">{value}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {item.raceLockInfo && (
                <div className="mb-3 text-center text-[10px] text-textFaint">
                  <p>{t('shop.raceLockOwnRace', { percent: Math.round(item.raceLockInfo.ownRaceChance * 100) })}</p>
                  {item.raceLockInfo.universalChance > 0 && (
                    <p>{t('shop.raceLockUniversal', { percent: Math.round(item.raceLockInfo.universalChance * 100) })}</p>
                  )}
                </div>
              )}

              <p className="mb-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-textMuted">
                {priceParts(item).map((part) => (
                  <span key={part.type} className="flex items-center gap-1">
                    {part.amount} <ResourceIcon type={part.type} className="h-3.5 w-3.5" />
                  </span>
                ))}
              </p>
            </div>

            <ConfirmButton
              label={t('shop.buy')}
              confirmLabel={t('common.confirm')}
              cancelLabel={t('common.cancel')}
              message={t('shop.buyConfirm', { price: priceLabel(item) })}
              onConfirm={() => handleBuy(item.itemDefinitionKey, item.nameKey)}
              className="w-full rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover"
              confirmClassName="flex-1 rounded-md border border-accent bg-accentBg py-2.5 text-[10px] uppercase hover:bg-accentBgHover"
              cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel py-2.5 text-[10px] uppercase text-textMuted hover:bg-accentBgHover"
            />
          </div>
        ))}
      </div>
    </GameLayout>
  );
}
