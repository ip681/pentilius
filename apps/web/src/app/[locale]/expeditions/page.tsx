'use client';

import type { ExpeditionClaimResultDto, ExpeditionsResponseDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ConfirmButton } from '@/components/ConfirmButton';
import { GameLayout } from '@/components/GameLayout';
import { cancelExpedition, claimExpedition, getExpeditions, startExpedition } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { notifyProfileChanged } from '@/lib/profile-events';
import { useRequireAuth } from '@/lib/use-require-auth';

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

  useEffect(() => {
    load();
    const dataInterval = setInterval(load, 5000);
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(clockInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart(key: string) {
    setError(null);
    try {
      await startExpedition(key);
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
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {result && (
        <div className="mb-6 rounded-lg border border-panelBorder bg-panel p-5">
          <div className="mb-2 font-medium">{t('expeditions.claimedTitle')}</div>
          <p className="text-xs text-textMuted">
            +{result.rewards.metal} {t('resource.METAL')} · +{result.rewards.crystal} {t('resource.CRYSTAL')} · +
            {result.rewards.credits} {t('resource.CREDITS')} · +{result.rewards.xp} {t('pve.xpGained')}
          </p>
          {result.bonusItem && (
            <p className="mt-1 text-xs text-positive">
              {t('expeditions.bonusItemFound')}: {t(result.bonusItem.itemNameKey)}
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
                message={t('expeditions.cancelConfirm')}
                onConfirm={handleCancel}
                className="rounded-md border border-panelBorderDanger bg-well px-5 py-2 text-[11px] uppercase text-danger hover:bg-accentBgHover"
                confirmClassName="flex-1 rounded-md border border-panelBorderDanger bg-well px-5 py-2 text-[11px] uppercase text-danger hover:bg-accentBgHover"
                cancelClassName="flex-1 rounded-md border border-panelBorder bg-panel px-5 py-2 text-[11px] uppercase text-textMuted hover:bg-accentBgHover"
              />
              <p className="mt-2 text-[10px] text-textFaint">{t('expeditions.cancelHint')}</p>
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
                <span>+{type.rewards.metal} {t('resource.METAL')}</span>
                <span>+{type.rewards.crystal} {t('resource.CRYSTAL')}</span>
                <span>+{type.rewards.credits} {t('resource.CREDITS')}</span>
                <span>+{type.rewards.xp} {t('pve.xpGained')}</span>
                {type.bonusItemNameKey && (
                  <span className="text-textFaint">
                    {t('expeditions.bonusChance', { percent: Math.round((type.bonusItemChance ?? 0) * 100) })}: {t(type.bonusItemNameKey)}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleStart(type.key)}
                className="w-full rounded-md border border-accent bg-accentBg py-2.5 text-xs uppercase hover:bg-accentBgHover"
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
