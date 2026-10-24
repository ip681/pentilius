'use client';

import type { PaymentProductDto, PaymentsCatalogDto, PlayerProfileDto, PurchaseDto } from '@pentilius/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ResourceIcon } from '@/components/ResourceIcon';
import { getCheckoutStatus, startCheckout } from '@/lib/api-client';
import { formatPrice } from '@/lib/format-price';
import { notifyProfileChanged } from '@/lib/profile-events';
import { formatNumber } from '@/lib/format-number';
import { Link } from '@/i18n/navigation';

type Translate = (key: string, values?: Record<string, string | number>) => string;

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
 * Real-money offers at the top of the Shop (owner decisions, 2026-10-17): one
 * VIP card with its perks folded into a single line (expandable) and the VIP
 * durations as side-by-side options, the cheapest per day marked "best
 * value"; then compact Credits tiles with their bonus over the smallest pack.
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
    <section id="offers" className="mb-6 scroll-mt-20 rounded-lg border border-accent bg-accentBg p-3 sm:p-4">
      <h2 className="mb-3 text-sm font-semibold">{t('payments.offersTitle')}</h2>
      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {vip.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-vipGold bg-panel p-3 lg:w-[26rem] lg:shrink-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-vipGold">{t('payments.vipTitle')}</p>
              {vipDaysLeft > 0 && <span className="text-[11px] text-vipGold">{t('payments.vipActiveFor', { days: vipDaysLeft })}</span>}
            </div>
            {perksOpen ? (
              <ul className="flex flex-col gap-1 text-[11px] text-textMuted">
                <li>• {t('settings.vip.perks.multiAttack', { count: profile?.vipMultiAttackCount ?? 3 })}</li>
                <li>• {t('settings.vip.perks.buildQueue')}</li>
                <li>• {t('settings.vip.perks.maxEnergy', { amount: profile?.vipMaxEnergyBonus ?? 3 })}</li>
                <li>• {t('settings.vip.perks.autoClaim')}</li>
                <li>• {t('settings.vip.perks.goldName')}</li>
              </ul>
            ) : (
              <p className="text-[11px] text-textMuted">
                {t('payments.perksSummary', { count: profile?.vipMultiAttackCount ?? 3, amount: profile?.vipMaxEnergyBonus ?? 3 })}
              </p>
            )}
            <button type="button" onClick={() => setPerksOpen((v) => !v)} className="self-start text-[11px] text-textFaint hover:text-text">
              {perksOpen ? `${t('payments.hidePerks')} ▴` : `${t('payments.showPerks')} ▾`}
            </button>
            <div className={`grid gap-2 ${vip.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {vip.map((product) => (
                <button
                  key={product.key}
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => handleBuy(product.key)}
                  className={`relative flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 hover:bg-accentBgHover disabled:opacity-50 ${product.key === bestVipKey ? 'border-vipGold' : 'border-wellBorder'}`}
                >
                  {product.key === bestVipKey && (
                    <span className="absolute -top-2 rounded bg-vipGold px-1.5 text-[9px] font-semibold uppercase text-ink">{t('payments.bestValue')}</span>
                  )}
                  <span className="text-xs text-text">{t('payments.days', { days: product.vipDays ?? 0 })}</span>
                  <span className="text-sm font-semibold text-vipGold">{busyKey === product.key ? t('payments.redirecting') : price(product)}</span>
                  <span className="text-[10px] text-textFaint">
                    {t('payments.perDay', { price: formatPrice(Math.round(perDay(product)), product.currency, locale) })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {credits.length > 0 && (
          <div className="grid flex-1 grid-cols-3 gap-2">
            {credits.map((product) => {
              const bonus = bonusOf(product);
              return (
                <button
                  key={product.key}
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => handleBuy(product.key)}
                  className="relative flex flex-col items-center gap-1 rounded-md border border-wellBorder bg-panel px-1 py-3 hover:border-accent disabled:opacity-50"
                >
                  {bonus > 0 && (
                    <span className="absolute right-1 top-1 rounded bg-accent px-1 text-[9px] font-semibold text-ink">{t('payments.bonus', { percent: bonus })}</span>
                  )}
                  <ResourceIcon type="CREDITS" className="h-7 w-7" />
                  <span className="text-base font-semibold tabular-nums">{(product.credits != null ? formatNumber(product.credits) : undefined)}</span>
                  <span className="mt-1 w-full rounded border border-accent px-1 py-1 text-center text-[11px] uppercase">
                    {busyKey === product.key ? t('payments.redirecting') : price(product)}
                  </span>
                </button>
              );
            })}
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
