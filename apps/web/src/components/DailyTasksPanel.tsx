'use client';

import type { DailyTaskDto, DailyTasksDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ResourceIcon } from '@/components/ResourceIcon';
import { claimDailyTask, getDailyTasks } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { notifyProfileChanged } from '@/lib/profile-events';

/**
 * Daily tasks (owner decision, 2026-10-13), shown in a popup from the Command
 * Center tile: progress bars, a "Claim" button per completed task, the
 * all-tasks bonus, and the time left until the 00:00 (Bulgarian time) reset.
 */
export function DailyTasksPanel({ onChanged }: { onChanged?: () => void }) {
  const t = useTranslations();
  const [data, setData] = useState<DailyTasksDto | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  function load() {
    getDailyTasks()
      .then(setData)
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  // A new day started — load the fresh tasks.
  const secondsToReset = data ? Math.max(0, Math.ceil((new Date(data.resetAt).getTime() - now) / 1000)) : null;
  useEffect(() => {
    if (secondsToReset === 0) setTimeout(load, 1500);
  }, [secondsToReset === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleClaim(key: string) {
    setBusyKey(key);
    try {
      setData(await claimDailyTask(key));
      notifyProfileChanged();
      onChanged?.();
    } catch {
      load();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('dailyTasks.title')}</h3>
        {secondsToReset !== null && (
          <span className="text-[11px] tabular-nums text-textFaint">{t('dailyTasks.resetsIn', { time: formatDuration(secondsToReset) })}</span>
        )}
      </div>
      {!data && <p className="text-xs text-textFaint">…</p>}
      {data && (
        <div className="flex flex-col gap-2">
          {data.tasks.map((task) => (
            <TaskRow key={task.key} task={task} busy={busyKey === task.key} onClaim={() => handleClaim(task.key)} />
          ))}

          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-wellBorder pt-3 text-xs">
            <span className="flex items-center gap-2">
              <AssetIcon
                assetId={`items.${data.allDone.bonusItemKey}.icon`}
                alt={t(`items.${data.allDone.bonusItemKey}.name`)}
                className="h-6 w-6 object-contain"
                fallback={null}
              />
              <span className={data.allDone.completed ? 'text-text' : 'text-textMuted'}>
                {t('dailyTasks.allDoneBonus', { item: t(`items.${data.allDone.bonusItemKey}.name`) })}
              </span>
            </span>
            {data.allDone.claimed ? (
              <span className="text-[11px] uppercase text-textFaint">{t('dailyTasks.claimed')}</span>
            ) : (
              <button
                type="button"
                disabled={!data.allDone.completed || busyKey === 'ALL_DONE'}
                onClick={() => handleClaim('ALL_DONE')}
                className="rounded-md border border-accent bg-accentBg px-3 py-1 text-[11px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
              >
                {t('dailyTasks.claim')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, busy, onClaim }: { task: DailyTaskDto; busy: boolean; onClaim: () => void }) {
  const t = useTranslations();
  const percent = Math.round((task.progress / task.target) * 100);
  return (
    <div className="rounded-md border border-wellBorder bg-well px-3 py-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={task.claimed ? 'text-textFaint line-through' : 'text-text'}>{t(`dailyTasks.types.${task.type}`, { count: task.target })}</span>
        <span className="flex items-center gap-2 text-[11px] tabular-nums text-textMuted">
          {task.reward.metal > 0 && (
            <span className="flex items-center gap-0.5">
              <ResourceIcon type="METAL" className="h-3.5 w-3.5" />
              {task.reward.metal.toLocaleString()}
            </span>
          )}
          {task.reward.crystal > 0 && (
            <span className="flex items-center gap-0.5">
              <ResourceIcon type="CRYSTAL" className="h-3.5 w-3.5" />
              {task.reward.crystal.toLocaleString()}
            </span>
          )}
          {task.reward.xp > 0 && <span>+{task.reward.xp.toLocaleString()} XP</span>}
          {task.reward.energy > 0 && <span>+{task.reward.energy} ⚡</span>}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-wellBorder">
          <div className={`h-full transition-all ${task.completed ? 'bg-positive' : 'bg-accent'}`} style={{ width: `${percent}%` }} />
        </div>
        <span className="w-14 text-right text-[11px] tabular-nums text-textMuted">
          {task.progress}/{task.target}
        </span>
        {task.claimed ? (
          <span className="w-16 text-center text-[11px] uppercase text-textFaint">{t('dailyTasks.claimed')}</span>
        ) : (
          <button
            type="button"
            disabled={!task.completed || busy}
            onClick={onClaim}
            className="w-16 rounded-md border border-accent bg-accentBg py-1 text-[11px] uppercase hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t('dailyTasks.claim')}
          </button>
        )}
      </div>
    </div>
  );
}
