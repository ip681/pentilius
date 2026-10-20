'use client';

import type { ExpeditionClaimResultDto, ExpeditionsResponseDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ConfirmButton } from '@/components/ConfirmButton';
import { GameLayout } from '@/components/GameLayout';
import { ResourceIcon } from '@/components/ResourceIcon';
import { cancelExpedition, claimExpedition, getExpeditions, startExpedition } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { notifyProfileChanged } from '@/lib/profile-events';
import { notifyNotificationsChanged } from '@/lib/notifications-events';
import { useRefresh } from '@/lib/use-refresh';
import { useRequireAuth } from '@/lib/use-require-auth';
import { formatNumber } from '@/lib/format-number';

function formatDurationMinutes(minutes: number): string {
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

export default function ExpeditionsPage() {
  useRequireAuth();
  const t = useTranslations();
  const [data, setData] = useState<ExpeditionsResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExpeditionClaimResultDto | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    try {
      setData(await getExpeditions());
    } catch {
      setError(t('expeditions.loadError'));
    }
  }

  // No polling (owner decision, 2026-10-13): refresh when the expedition ends.
  useRefresh(load, { refreshAt: [data?.active?.endsAt] });

  useEffect(() => {
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  async function handleStart(key: string) {
    setError(null);
    try {
      await startExpedition(key);
      notifyNotificationsChanged();
      await load();
    } catch {
      setError(t('expeditions.startError'));
    }
  }

  async function handleClaim() {
    setError(null);
    try {
      setResult(await claimExpedition());
      notifyProfileChanged();
      await load();
    } catch {
      setError(t('expeditions.claimError'));
    }
  }

  async function handleCancel() {
    setError(null);
    try {
      setResult(await cancelExpedition());
      notifyNotificationsChanged();
      notifyProfileChanged();
      await load();
    } catch {
      setError(t('expeditions.cancelError'));
    }
  }

  const active = data?.active;
  const remainingMs = active ? new Date(active.endsAt).getTime() - now : 0;
  const completed = active ? remainingMs <= 0 : false;

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('expeditions.title')}</h1>
        <p className="text-xs text-textMuted">{t('expeditions.subtitle')}</p>
        <p className="text-[11px] text-textFaint">{t('expeditions.rewardsHint')}</p>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {result && (
        <div className="mb-6 rounded-lg border border-panelBorder bg-panel p-5">
          <div className="mb-2 font-medium">{t('expeditions.claimedTitle')}</div>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-textMuted">
            <span className="flex items-center gap-1">
              +{formatNumber(result.rewards.metal)} <ResourceIcon type="METAL" className="h-4 w-4" />
            </span>
            ·
            <span className="flex items-center gap-1">
              +{formatNumber(result.rewards.crystal)} <ResourceIcon type="CRYSTAL" className="h-4 w-4" />
            </span>
            · +{formatNumber(result.rewards.xp)} {t('pve.xpGained')}
          </p>
          {result.bonusItem && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-positive">
              <span>{t('expeditions.bonusItemFound')}:</span>
              <AssetIcon
                assetId={result.bonusItem.itemIconAssetId}
                alt={t(result.bonusItem.itemNameKey)}
                className="h-4 w-4 object-contain"
                fallback={<span className="text-[9px] font-semibold">{t(result.bonusItem.itemNameKey).charAt(0)}</span>}
              />
              {t(result.bonusItem.itemNameKey)}
            </p>
          )}
          {result.bonusItemLost && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-textMuted">{t('expeditions.bonusItemFound')}:</span>
              <span className="inline-flex items-center gap-1 line-through opacity-40">
                <AssetIcon
                  assetId={result.bonusItemLost.itemIconAssetId}
                  alt={t(result.bonusItemLost.itemNameKey)}
                  className="h-4 w-4 object-contain"
                  fallback={<span className="text-[9px] font-semibold">{t(result.bonusItemLost.itemNameKey).charAt(0)}</span>}
                />
                {t(result.bonusItemLost.itemNameKey)}
              </span>
              <span className="text-danger">{t('pve.lootNotGranted')}</span>
            </p>
          )}
          {result.leveledUp && <p className="mt-1 text-xs font-medium">{t('pve.leveledUp', { level: result.playerLevel })}</p>}
        </div>
      )}

      {active ? (
        <div className="rounded-lg border border-panelBorder bg-panel p-6 text-center">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-textFaint">{t('expeditions.inProgress')}</div>
          <h2 className="mb-4 text-lg font-semibold">{t(active.expeditionNameKey)}</h2>
          {completed ? (
            <>
              <p className="mb-4 text-sm text-positive">{t('expeditions.readyToClaim')}</p>
              <button
                type="button"
                onClick={handleClaim}
                className="rounded-md border border-accent bg-accentBg px-6 py-2.5 text-xs uppercase hover:bg-accentBgHover"
              >
                {t('expeditions.claim')}
              </button>
            </>
          ) : (
            <>
              <p className="mb-4 text-3xl font-semibold tabular-nums">{formatDuration(remainingMs / 1000)}</p>
              <ConfirmButton
                label={t('expeditions.cancel')}
                confirmLabel={t('common.confirm')}
                cancelLabel={t('common.cancel')}
                message={t('expeditions.cancelConfirm', { percent: Math.round((data?.earlyCancelPercentage ?? 0) * 100) })}
                onConfirm={handleCancel}
                className="rounded-md border border-panelBorderDanger bg-well px-5 py-2 text-[11px] uppercase text-danger hover:bg-accentBgHover"
                confirmClassName="flex-1 rounded-md border border-panelBorderDanger bg-well px-5 py-2 text-[11px] uppercase text-danger hover:bg-accentBgHover"
                cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel px-5 py-2 text-[11px] uppercase text-textMuted hover:bg-accentBgHover"
              />
              <p className="mt-2 text-[10px] text-textFaint">{t('expeditions.cancelHint', { percent: Math.round((data?.earlyCancelPercentage ?? 0) * 100) })}</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {data?.types.map((type) => (
            <div key={type.key} className="rounded-lg border border-panelBorder bg-panel p-5">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-textFaint">{formatDurationMinutes(type.durationMinutes)}</div>
              <h2 className="mb-4 text-base font-semibold">{t(type.nameKey)}</h2>

              <div className="mb-4 flex flex-col gap-1 text-xs text-textMuted">
                <span className="flex items-center gap-1.5">+{formatNumber(type.rewards.metal)} <ResourceIcon type="METAL" className="h-4 w-4" /></span>
                <span className="flex items-center gap-1.5">+{formatNumber(type.rewards.crystal)} <ResourceIcon type="CRYSTAL" className="h-4 w-4" /></span>
                <span>+{formatNumber(type.rewards.xp)} {t('pve.xpGained')}</span>
                {type.bonusItemTier && !!type.bonusItemChance && (
                  <span className="text-textFaint">
                    {t('expeditions.bonusSetItem', { percent: Math.round(type.bonusItemChance * 100), set: t(`shop.tier.${type.bonusItemTier}`) })}
                  </span>
                )}
              </div>

              {/* Longer expeditions unlock with the Research Center (owner decision, 2026-10-14). */}
              {type.locked && <p className="mb-2 text-center text-[11px] text-textMuted">{t('research.needsNavigation', { level: type.requiredNavigationLevel })}</p>}
              <button
                type="button"
                disabled={type.locked}
                onClick={() => handleStart(type.key)}
                className="w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
              >
                {t('expeditions.start')}
              </button>
            </div>
          ))}
        </div>
      )}
    </GameLayout>
  );
}
