'use client';

import type { AchievementDto, AchievementRewardDto, AchievementsDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ResourceIcon } from '@/components/ResourceIcon';
import { ApiError, claimAchievement, getAchievements } from '@/lib/api-client';
import { notifyProfileChanged } from '@/lib/profile-events';

/**
 * Season achievements and level rewards (owner decision, 2026-10-13), shown in
 * a popup from the Command Center tile. Every reward is claimed by hand; the
 * next one of the same kind then takes its place.
 */
export function AchievementsPanel({ onChanged }: { onChanged?: () => void }) {
  const t = useTranslations();
  const [data, setData] = useState<AchievementsDto | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    getAchievements()
      .then(setData)
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleClaim(claimKey: string) {
    setBusyKey(claimKey);
    setError(null);
    try {
      setData(await claimAchievement(claimKey));
      notifyProfileChanged();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'INVENTORY_FULL' ? t('achievements.inventoryFull') : t('achievements.claimError'));
      load();
    } finally {
      setBusyKey(null);
    }
  }

  // Claimable first, finished last; otherwise the configured order.
  const rank = (a: AchievementDto) => (a.finished ? 2 : a.completed ? 0 : 1);
  const achievements = data ? [...data.achievements].sort((a, b) => rank(a) - rank(b)) : [];

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">{t('achievements.title')}</h3>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      {!data && <p className="text-xs text-textFaint">…</p>}

      <div className="flex flex-col gap-2">
        {data?.levelReward && (
          // Same layout as an achievement: progress = current level toward the reward's level.
          <RewardRow
            label={t('achievements.levelReward', { level: data.levelReward.level })}
            reward={data.levelReward.reward}
            progress={Math.min(data.levelReward.currentLevel, data.levelReward.level)}
            target={data.levelReward.level}
            completed={data.levelReward.reached}
            finished={false}
            busy={busyKey === data.levelReward.claimKey}
            onClaim={() => handleClaim(data.levelReward!.claimKey)}
          />
        )}
        {achievements.map((achievement) => (
          <RewardRow
            key={achievement.key}
            label={t(`achievements.items.${achievement.key}`, {
              count: achievement.target.toLocaleString(),
              set: achievement.setTier ? t(`achievements.sets.${achievement.setTier}`) : '',
            })}
            tierText={`(${achievement.tier}/${achievement.tierCount})`}
            reward={achievement.reward}
            progress={achievement.progress}
            target={achievement.target}
            completed={achievement.completed}
            finished={achievement.finished}
            busy={busyKey === achievement.tierKey}
            onClaim={() => handleClaim(achievement.tierKey)}
          />
        ))}
      </div>
    </div>
  );
}

/** One reward row — achievements and the level reward share it, so every reward looks the same. */
function RewardRow({
  label,
  tierText,
  reward,
  progress,
  target,
  completed,
  finished,
  busy,
  onClaim,
}: {
  label: string;
  tierText?: string;
  reward: AchievementRewardDto;
  progress: number;
  target: number;
  completed: boolean;
  finished: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const t = useTranslations();
  const percent = Math.round((progress / target) * 100);
  return (
    <div className={`rounded-md border border-wellBorder bg-well px-3 py-2 ${finished ? 'opacity-50' : ''}`}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-text">
          {label} {tierText && <span className="text-[10px] text-textFaint">{tierText}</span>}
        </span>
        {!finished && <RewardLine reward={reward} />}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-wellBorder">
          <div className={`h-full transition-all ${completed ? 'bg-positive' : 'bg-accent'}`} style={{ width: `${percent}%` }} />
        </div>
        <span className="w-20 text-right text-[11px] tabular-nums text-textMuted">
          {progress.toLocaleString()}/{target.toLocaleString()}
        </span>
        {finished ? (
          <span className="w-16 text-center text-[11px] uppercase text-textFaint">{t('achievements.done')}</span>
        ) : (
          <ClaimButton disabled={!completed || busy} onClick={onClaim} />
        )}
      </div>
    </div>
  );
}

function ClaimButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-16 rounded-md border border-accent bg-accentBg py-1 text-[11px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
    >
      {t('achievements.claim')}
    </button>
  );
}

function RewardLine({ reward }: { reward: AchievementRewardDto }) {
  const t = useTranslations();
  return (
    <span className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums text-textMuted">
      {reward.metal > 0 && (
        <span className="flex items-center gap-0.5">
          <ResourceIcon type="METAL" className="h-3.5 w-3.5" />
          {reward.metal.toLocaleString()}
        </span>
      )}
      {reward.crystal > 0 && (
        <span className="flex items-center gap-0.5">
          <ResourceIcon type="CRYSTAL" className="h-3.5 w-3.5" />
          {reward.crystal.toLocaleString()}
        </span>
      )}
      {reward.itemKey && (
        <span className="flex items-center gap-1">
          <AssetIcon assetId={`items.${reward.itemKey}.icon`} alt={t(`items.${reward.itemKey}.name`)} className="h-4 w-4 object-contain" fallback={null} />
          {t(`items.${reward.itemKey}.name`)}
        </span>
      )}
    </span>
  );
}
