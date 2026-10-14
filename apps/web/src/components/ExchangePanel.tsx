'use client';

import type { BaseResponseDto, ExchangeInfoDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ResourceIcon } from '@/components/ResourceIcon';
import { ApiError, exchangeResources } from '@/lib/api-client';
import { notifyProfileChanged } from '@/lib/profile-events';

/**
 * Exchange (owner decision, 2026-10-14): Metal <-> Crystal only, a small
 * Credits fee proportional to the amount, a daily limit. The preview mirrors
 * the server's formula; the server decides.
 */
export function ExchangePanel({ info, onDone }: { info: ExchangeInfoDto; onDone: (base: BaseResponseDto) => void }) {
  const t = useTranslations();
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

  async function handleExchange() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      onDone(await exchangeResources(from, value));
      notifyProfileChanged();
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
    <div className="mb-3 rounded border border-wellBorder bg-well p-2.5 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[8px] uppercase text-textFaint">{t('exchange.title')}</span>
        <span className="text-[10px] text-textFaint">{t('exchange.left', { left: left.toLocaleString(), limit: info.dailyLimit.toLocaleString() })}</span>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {(['METAL', 'CRYSTAL'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFrom(option)}
            className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] ${from === option ? 'border-accent bg-accentBg' : 'border-wellBorder text-textMuted hover:bg-accentBgHover'}`}
          >
            <ResourceIcon type={option} className="h-3.5 w-3.5" />→<ResourceIcon type={option === 'METAL' ? 'CRYSTAL' : 'METAL'} className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <input
        type="number"
        min={1}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={t('exchange.amount')}
        className="mb-2 w-full rounded-md border border-wellBorder bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {value > 0 && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-textMuted">
          <span className="flex items-center gap-1">
            {t('exchange.youGet')} <strong className="text-text">{received.toLocaleString()}</strong> <ResourceIcon type={to} className="h-3.5 w-3.5" />
          </span>
          <span className="flex items-center gap-1">
            {t('exchange.fee')} {fee.toLocaleString()} <ResourceIcon type="CREDITS" className="h-3.5 w-3.5" />
          </span>
        </div>
      )}
      <button
        type="button"
        disabled={busy || value < 1 || received < 1}
        onClick={handleExchange}
        className="w-full rounded-md border border-accent bg-accentBg py-2 text-xs uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
      >
        {t('exchange.submit')}
      </button>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      {done && <p className="mt-2 text-[11px] text-positive">{t('exchange.done')}</p>}
    </div>
  );
}
