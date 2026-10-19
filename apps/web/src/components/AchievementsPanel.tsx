'use client';

import type { AchievementDto, AchievementRewardDto, AchievementsDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ClaimedSection } from '@/components/ClaimedSection';
import { ResourceIcon } from '@/components/ResourceIcon';
import { ApiError, claimAchievement, getAchievements } from '@/lib/api-client';
import { notifyProfileChanged } from '@/lib/profile-events';
import { formatNumber } from '@/lib/format-number';

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

  // Claimable first, then in progress; fully claimed chains fold away (owner decision, 2026-10-14).
  const achievements = data ? data.achievements.filter((a) => !a.finished).sort((a, b) => Number(b.completed) - Number(a.completed)) : [];
  const finished = data ? data.achievements.filter((a) => a.finished) : [];
  const row = (achievement: AchievementDto) => (
    <RewardRow
      key={achievement.key}
      label={t(`achievements.items.${achievement.key}`, {
        count: formatNumber(achievement.target),
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
  );

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">{t('achievements.title')}</h3>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      {!data && <p className="text-xs text-textFaint">…</p>}

      <div className="flex flex-col gap-2">
        {data?.levelReward && (
          <h4 className="text-[11px] uppercase tracking-wide text-textFaint">{t('achievements.levelHeading')}</h4>
        )}
        {data?.levelReward && (
          // Same layout as an achievement: progress = current level toward the reward's level.
          <RewardRow
            label={t('achievements.levelReward', { level: data.levelReward.level })}
            reward={data.levelReward.reward}
            // The bar is XP toward that level, shown as a percent (owner decision, 2026-10-14).
            progress={data.levelReward.xpPercent ?? 100}
            target={100}
            percentText
            completed={data.levelReward.reached}
            finished={false}
            busy={busyKey === data.levelReward.claimKey}
            onClaim={() => handleClaim(data.levelReward!.claimKey)}
          />
        )}
        {achievements.length + finished.length > 0 && (
          <h4 className={`text-[11px] uppercase tracking-wide text-textFaint ${data?.levelReward ? 'mt-2 border-t border-wellBorder pt-3' : ''}`}>
            {t('achievements.listHeading')}
          </h4>
        )}
        {achievements.map(row)}
        {data && achievements.length === 0 && finished.length > 0 && (
          <p className="rounded-md border border-accent bg-accentBg px-3 py-2 text-xs text-text">{t('achievements.allFinished')}</p>
        )}
        <ClaimedSection count={finished.length}>{finished.map(row)}</ClaimedSection>
      </div>
    </div>
  );
}

/** One reward row — achievements and the level reward share it, so every reward looks the same. */
function RewardRow({
  label,
  tierText,
  percentText = false,
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
  percentText?: boolean;
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
  // Same look as the daily missions (owner decision, 2026-10-14): a reward
  // waiting to be claimed stands out through the row itself, a finished one fades.
  const look = finished ? 'border-wellBorder bg-well opacity-60' : completed ? 'border-accent bg-accentBg' : 'border-wellBorder bg-well';
  return (
    <div className={`rounded-md border px-3 py-2 transition-colors ${look}`}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-text">
          {label} {tierText && <span className="text-[10px] text-textFaint">{tierText}</span>}
        </span>
        {/* Shown on claimed rows too, like the daily missions. */}
        <RewardLine reward={reward} />
      </div>
      {/* The bar until done, then Claim in its place (fixed height, no jumping). */}
      <div className="flex h-7 items-center gap-3">
        {finished ? (
          <span className="text-[11px] uppercase text-textFaint">✓ {t('dailyTasks.claimed')}</span>
        ) : completed ? (
          <ClaimButton disabled={busy} onClick={onClaim} />
        ) : (
          <>
            <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-wellBorder">
              <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
            </div>
            <span className="w-20 text-right text-[11px] tabular-nums text-textMuted">
              {percentText ? `${percent}%` : `${formatNumber(progress)}/${formatNumber(target)}`}
            </span>
          </>
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
      className="h-7 w-full rounded-md border border-accent bg-panel text-[11px] uppercase text-text hover:bg-accentBgHover disabled:opacity-50"
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
          {formatNumber(reward.metal)}
        </span>
      )}
      {reward.crystal > 0 && (
        <span className="flex items-center gap-0.5">
          <ResourceIcon type="CRYSTAL" className="h-3.5 w-3.5" />
          {formatNumber(reward.crystal)}
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
