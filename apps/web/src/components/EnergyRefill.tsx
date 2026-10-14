'use client';

import type { InventoryItemDto, PlayerProfileDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { consumeItem, getInventory } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { notifyProfileChanged } from '@/lib/profile-events';

/**
 * Shown under an energy-gated attack button when energy runs out (owner
 * decision, 2026-10-14) — the energy packs the player owns, usable right
 * there, like construction speed-ups in the Base. Without packs it shows when
 * the next point regenerates.
 */
export function EnergyRefill({
  profile,
  needed = 1,
  onRefilled,
}: {
  profile: PlayerProfileDto | null;
  needed?: number;
  onRefilled: () => void | Promise<void>;
}) {
  const t = useTranslations();
  const [packs, setPacks] = useState<InventoryItemDto[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const outOfEnergy = !!profile && profile.energy.current < needed;

  function loadPacks() {
    getInventory()
      .then((inventory) => setPacks(inventory.items.filter((item) => (item.energyGain ?? 0) > 0).sort((a, b) => (a.energyGain ?? 0) - (b.energyGain ?? 0))))
      .catch(() => setPacks([]));
  }

  // Only while it's needed — no inventory request otherwise.
  useEffect(() => {
    if (!outOfEnergy) return;
    loadPacks();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [outOfEnergy]);

  async function handleUse(item: InventoryItemDto) {
    setBusyId(item.id);
    try {
      await consumeItem(item.id);
      notifyProfileChanged();
      await onRefilled();
      loadPacks();
    } catch {
      loadPacks();
    } finally {
      setBusyId(null);
    }
  }

  if (!outOfEnergy || !profile) return null;
  const secondsToNext = profile.energy.nextRegenAt ? Math.max(0, Math.ceil((new Date(profile.energy.nextRegenAt).getTime() - now) / 1000)) : null;

  return (
    <div className="mt-2 flex flex-col items-center gap-1.5 text-center text-xs">
      {packs === null ? null : packs.length > 0 ? (
        <>
          <span className="text-textMuted">{t('energyRefill.usePack')}</span>
          <div className="flex flex-wrap justify-center gap-2">
            {packs.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busyId !== null}
                onClick={() => handleUse(item)}
                className="flex items-center gap-1.5 rounded-md border border-accent bg-accentBg px-3 py-1.5 text-[11px] uppercase hover:bg-accentBgHover disabled:opacity-30"
              >
                <AssetIcon assetId={item.iconAssetId} alt={t(item.nameKey)} className="h-4 w-4 object-contain" fallback={null} />
                {t(item.nameKey)} +{item.energyGain} (×{item.quantity})
              </button>
            ))}
          </div>
        </>
      ) : (
        <span className="text-textMuted">
          {secondsToNext !== null ? t('energyRefill.noPacksNext', { time: formatDuration(secondsToNext) }) : t('energyRefill.noPacks')}
        </span>
      )}
    </div>
  );
}
