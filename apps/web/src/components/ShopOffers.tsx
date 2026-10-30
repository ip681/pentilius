'use client';

import type { PaymentProductDto, PaymentsCatalogDto, PlayerProfileDto, PurchaseDto } from '@pentilius/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { ResourceIcon } from '@/components/ResourceIcon';
import { getCheckoutStatus, startCheckout } from '@/lib/api-client';
import { formatPrice } from '@/lib/format-price';
import { notifyProfileChanged } from '@/lib/profile-events';
import { formatNumber } from '@/lib/format-number';
import { Link } from '@/i18n/navigation';

type Translate = (key: string, values?: Record<string, string | number>) => string;

// One look for every offer tile (owner decision, 2026-10-30): the badge in the corner, the price as a button at the bottom.
// Backgrounds instead of borders (owner decision, 2026-10-30): only the best VIP offer has a ring.
const OFFER_TILE = 'relative flex flex-col items-center gap-1 rounded-md bg-well px-2 pb-2 pt-5 hover:bg-accentBgHover disabled:opacity-50';
const OFFER_BADGE = 'absolute right-1 top-1 rounded px-1 text-[9px] font-semibold uppercase';
const OFFER_PRICE = 'mt-auto w-full rounded px-1 py-1 text-center text-[11px] font-semibold uppercase';

/**
 * A product's name in the player's language (owner decision, 2026-10-18): a
 * custom name from godmaster if set (English is the fallback), otherwise the
 * translated template — "VIP for {days} days" / "{count} Credits" — so new
 * products need no typing in any language.
 */
export function productName(
  product: { kind: 'CREDITS' | 'VIP'; nameBg: string | null; nameEn: string | null; credits: number | null; vipDays: number | null },
  locale: string,
  t: Translate,
): string {
  const custom = locale === 'bg' ? product.nameBg || product.nameEn : product.nameEn;
  if (custom) return custom;
  return product.kind === 'VIP' ? t('payments.productNames.VIP', { days: product.vipDays ?? 0 }) : t('payments.productNames.CREDITS', { count: product.credits ?? 0 });
}

/**
 * Real-money offers at the top of the Shop (owner decisions, 2026-10-17,
 * reworked 2026-10-30): a VIP block and a Credits block that look alike — the
 * VIP durations side by side, the cheapest per day marked "best value", its
 * perks behind "What does it give?"; the Credits packs with their bonus over
 * the smallest pack.
 * No horizontal scrolling — on phones the VIP card takes the full width and
 * the tiles sit three in a row under it. "Buy" goes to Stripe's payment page;
 * the reward is granted only after Stripe confirms.
 */
export function ShopOffers({ catalog, profile }: { catalog: PaymentsCatalogDto; profile: PlayerProfileDto | null }) {
  const t = useTranslations();
  const locale = useLocale();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perksOpen, setPerksOpen] = useState(false);

  const vip = catalog.products.filter((p) => p.kind === 'VIP' && p.vipDays);
  const credits = catalog.products.filter((p) => p.kind === 'CREDITS' && p.credits);

  // VIP: the option with the lowest price per day is "best value" (only when there's a choice).
  const perDay = (p: PaymentProductDto) => p.priceCents / (p.vipDays ?? 1);
  const bestVipKey = vip.length > 1 ? vip.reduce((best, p) => (perDay(p) < perDay(best) ? p : best)).key : null;
  // Credits: the bonus over the smallest pack's rate, computed from the real prices.
  const baseRate = credits.length > 0 ? Math.min(...credits.map((p) => (p.credits ?? 0) / p.priceCents)) : 0;
  const bonusOf = (p: PaymentProductDto) => (baseRate > 0 ? Math.round((((p.credits ?? 0) / p.priceCents) / baseRate - 1) * 100) : 0);

  const vipUntil = profile?.vipUntil ? new Date(profile.vipUntil).getTime() : 0;
  const vipDaysLeft = vipUntil > Date.now() ? Math.ceil((vipUntil - Date.now()) / 86_400_000) : 0;

  async function handleBuy(productKey: string) {
    setBusyKey(productKey);
    setError(null);
    try {
      const { url } = await startCheckout(productKey, locale === 'en' ? 'en' : 'bg');
      window.location.href = url;
    } catch {
      setError(t('payments.startError'));
      setBusyKey(null);
    }
  }

  const price = (p: PaymentProductDto) => formatPrice(p.priceCents, p.currency, locale);

  return (
    <section id="offers" className="mb-6 scroll-mt-20 rounded-lg bg-panel p-3 sm:p-4">
      <h2 className="mb-3 text-sm font-semibold">{t('payments.offersTitle')}</h2>
      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      {/* VIP and Credits as two matching blocks (owner decision, 2026-10-30): a title each, the same tiles —
          amount, then the price as a button, the deal badge in the corner. VIP's perks fold behind "What does it give?". */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        {vip.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md bg-vipGold/[0.07] p-3 lg:w-[26rem] lg:shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-vipGold">{t('payments.vipTitle')}</p>
                <button type="button" onClick={() => setPerksOpen(true)} className="text-[11px] text-textFaint underline hover:text-text">
                  {t('payments.whatVipGives')}
                </button>
              </div>
              {vipDaysLeft > 0 && <span className="text-[11px] text-vipGold">{t('payments.vipActiveFor', { days: vipDaysLeft })}</span>}
            </div>
            {/* What VIP gives, in a popup (owner decision, 2026-10-30) — the block stays the same height. */}
            <BottomSheet open={perksOpen} onClose={() => setPerksOpen(false)}>
              <h2 className="mb-1 text-sm font-semibold text-vipGold">{t('payments.vipTitle')}</h2>
              {vipDaysLeft > 0 && <p className="mb-3 text-[11px] text-vipGold">{t('payments.vipActiveFor', { days: vipDaysLeft })}</p>}
              <h3 className="mb-2 mt-2 text-[11px] uppercase tracking-wide text-textFaint">{t('settings.vip.perksTitle')}</h3>
              <ul className="flex flex-col gap-1.5 text-xs text-text">
                <li>• {t('settings.vip.perks.multiAttack', { count: profile?.vipMultiAttackCount ?? 3 })}</li>
                <li>• {t('settings.vip.perks.buildQueue')}</li>
                <li>• {t('settings.vip.perks.maxEnergy', { amount: profile?.vipMaxEnergyBonus ?? 3 })}</li>
                <li>• {t('settings.vip.perks.autoClaim')}</li>
                <li>• {t('settings.vip.perks.goldName')}</li>
              </ul>
              <button type="button" onClick={() => setPerksOpen(false)} className="mt-4 w-full text-center text-xs text-textFaint underline">
                {t('common.close')}
              </button>
            </BottomSheet>
            <div className={`grid flex-1 gap-2 ${vip.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {vip.map((product) => (
                <button
                  key={product.key}
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => handleBuy(product.key)}
                  className={`${OFFER_TILE} ${product.key === bestVipKey ? 'ring-1 ring-vipGold' : ''}`}
                >
                  {product.key === bestVipKey && <span className={`${OFFER_BADGE} bg-vipGold text-ink`}>{t('payments.bestValue')}</span>}
                  <AssetIcon
                    assetId="interface.vip.icon"
                    alt="VIP"
                    className="h-7 w-7 object-contain"
                    fallback={<span className="rounded border border-vipGold px-1 text-[10px] font-semibold text-vipGold">VIP</span>}
                  />
                  <span className="text-base font-semibold tabular-nums">{t('payments.days', { days: product.vipDays ?? 0 })}</span>
                  <span className="text-[10px] text-textFaint">
                    {t('payments.perDay', { price: formatPrice(Math.round(perDay(product)), product.currency, locale) })}
                  </span>
                  <span className={`${OFFER_PRICE} bg-vipGold/15 text-vipGold`}>{busyKey === product.key ? t('payments.redirecting') : price(product)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {credits.length > 0 && (
          <div className="flex flex-1 flex-col gap-2 rounded-md bg-accent/[0.12] p-3">
            <p className="text-sm font-semibold">{t('payments.creditsTitle')}</p>
            <div className="grid flex-1 grid-cols-3 gap-2">
              {credits.map((product) => {
                const bonus = bonusOf(product);
                return (
                  <button
                    key={product.key}
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => handleBuy(product.key)}
                    className={OFFER_TILE}
                  >
                    {bonus > 0 && <span className={`${OFFER_BADGE} bg-accent text-ink`}>{t('payments.bonus', { percent: bonus })}</span>}
                    <ResourceIcon type="CREDITS" className="h-7 w-7" />
                    <span className="text-base font-semibold tabular-nums">{product.credits != null ? formatNumber(product.credits) : undefined}</span>
                    <span className={`${OFFER_PRICE} bg-accent/30 text-text`}>{busyKey === product.key ? t('payments.redirecting') : price(product)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * After returning from Stripe (?checkout=<session id> or "canceled"): shows
 * "processing…" until Stripe's confirmation reaches the server, then the result.
 */
export function CheckoutResult({ checkout, onDone }: { checkout: string; onDone: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [purchase, setPurchase] = useState<PurchaseDto | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const canceled = checkout === 'canceled';

  useEffect(() => {
    if (canceled) {
      onDone();
      return;
    }
    let stopped = false;
    const started = Date.now();
    async function poll() {
      try {
        const result = await getCheckoutStatus(checkout);
        if (stopped) return;
        setPurchase(result);
        if (result.status !== 'PENDING') {
          if (result.status === 'COMPLETED') notifyProfileChanged();
          onDone();
          return;
        }
      } catch {
        // Not saved yet or a hiccup — keep waiting a little.
      }
      // Usually a few seconds; stop asking after two minutes.
      if (Date.now() - started > 120_000) setTimedOut(true);
      else setTimeout(poll, 2000);
    }
    poll();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout]);

  let text: string;
  let tone = 'border-accent bg-accentBg text-text';
  if (canceled) {
    text = t('payments.canceled');
    tone = 'border-wellBorder bg-well text-textMuted';
  } else if (purchase?.status === 'COMPLETED') {
    text = t('payments.completed', { name: productName(purchase, locale, t) });
  } else if (purchase?.status === 'CANCELED') {
    text = t('payments.failed');
    tone = 'border-wellBorder bg-well text-textMuted';
  } else if (timedOut) {
    text = t('payments.slow');
  } else {
    text = t('payments.processing');
  }
  return (
    <p className={`mb-4 rounded-md border px-3 py-2 text-xs ${tone}`}>
      {text}
      {purchase?.status === 'COMPLETED' && purchase.saleDocumentId && (
        <>
          {' '}
          <Link href={`/documents/${purchase.saleDocumentId}`} className="text-accent underline">
            {t('payments.viewDocument')}
          </Link>
        </>
      )}
    </p>
  );
}
