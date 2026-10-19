'use client';

import type { DailyStreakDto, DailyTaskDto, DailyTasksDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AssetIcon } from '@/components/AssetIcon';
import { ClaimedSection } from '@/components/ClaimedSection';
import { ResourceIcon } from '@/components/ResourceIcon';
import { claimDailyTask, getDailyTasks } from '@/lib/api-client';
import { formatDuration } from '@/lib/format-duration';
import { notifyProfileChanged } from '@/lib/profile-events';
import { formatNumber } from '@/lib/format-number';

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

  const openTasks = (data?.tasks ?? []).filter((task) => !task.claimed).sort((a, b) => Number(b.completed) - Number(a.completed));
  const claimedTasks = (data?.tasks ?? []).filter((task) => task.claimed);

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
          {/* Ready to claim first, then in progress; claimed ones fold away (owner decision, 2026-10-14). */}
          {openTasks.map((task) => (
            <TaskRow key={task.key} task={task} busy={busyKey === task.key} onClaim={() => handleClaim(task.key)} />
          ))}
          {openTasks.length === 0 && <p className="rounded-md border border-accent bg-accentBg px-3 py-2 text-xs text-text">{t('dailyTasks.allClaimed')}</p>}
          <ClaimedSection count={claimedTasks.length}>
            {claimedTasks.map((task) => (
              <TaskRow key={task.key} task={task} busy={false} onClaim={() => undefined} />
            ))}
          </ClaimedSection>

          {/* The daily bonus, set apart from the missions (owner decision, 2026-10-14). */}
          <h4 className="mt-2 border-t border-wellBorder pt-3 text-[11px] uppercase tracking-wide text-textFaint">{t('dailyTasks.allDoneHeading')}</h4>
          <AllDoneRow allDone={data.allDone} busy={busyKey === 'ALL_DONE'} onClaim={() => handleClaim('ALL_DONE')} />

          {/* The weekly reward, set apart from the daily ones (owner decision, 2026-10-14). */}
          <h4 className="mt-2 border-t border-wellBorder pt-3 text-[11px] uppercase tracking-wide text-textFaint">{t('dailyTasks.streak.heading')}</h4>
          <StreakRow streak={data.streak} busy={busyKey === 'STREAK'} onClaim={() => handleClaim('STREAK')} />
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, busy, onClaim }: { task: DailyTaskDto; busy: boolean; onClaim: () => void }) {
  const t = useTranslations();
  const percent = Math.round((task.progress / task.target) * 100);
  return (
    <div className={rowClass(task.claimed ? 'claimed' : task.completed ? 'ready' : 'open')}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={task.claimed ? 'text-textFaint line-through' : 'text-text'}>{t(`dailyTasks.types.${task.type}`, { count: task.target })}</span>
        <span className="flex items-center gap-2 text-[11px] tabular-nums text-textMuted">
          {task.reward.metal > 0 && (
            <span className="flex items-center gap-0.5">
              <ResourceIcon type="METAL" className="h-3.5 w-3.5" />
              {formatNumber(task.reward.metal)}
            </span>
          )}
          {task.reward.crystal > 0 && (
            <span className="flex items-center gap-0.5">
              <ResourceIcon type="CRYSTAL" className="h-3.5 w-3.5" />
              {formatNumber(task.reward.crystal)}
            </span>
          )}
          {task.reward.xp > 0 && <span>+{formatNumber(task.reward.xp)} XP</span>}
          {task.reward.energy > 0 && <span>+{task.reward.energy} ⚡</span>}
        </span>
      </div>
      {/* Owner decision (2026-10-14): the bar until the task is done, then the
          Claim button in its place — no disabled button before. Fixed height,
          so the list doesn't jump on phones. */}
      <div className="flex h-7 items-center gap-3">
        {task.claimed ? (
          <span className="text-[11px] uppercase text-textFaint">✓ {t('dailyTasks.claimed')}</span>
        ) : task.completed ? (
          <ClaimButton busy={busy} onClick={onClaim} wide />
        ) : (
          <>
            <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-wellBorder">
              <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
            </div>
            <span className="w-14 text-right text-[11px] tabular-nums text-textMuted">
              {task.progress}/{task.target}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Row look by state (owner decision, 2026-10-14): a done-but-unclaimed row
 * stands out through its background and border in the game's own accent
 * colour, not a bright button; a claimed row fades back.
 */
function rowClass(state: 'open' | 'ready' | 'claimed'): string {
  const look = state === 'ready' ? 'border-accent bg-accentBg' : state === 'claimed' ? 'border-wellBorder bg-well opacity-60' : 'border-wellBorder bg-well';
  return `rounded-md border px-3 py-2 transition-colors ${look}`;
}

function ClaimButton({ busy, onClick, wide = false }: { busy: boolean; onClick: () => void; wide?: boolean }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`${wide ? 'w-full' : 'px-3'} h-7 rounded-md border border-accent bg-panel text-[11px] uppercase text-text hover:bg-accentBgHover disabled:opacity-50`}
    >
      {t('dailyTasks.claim')}
    </button>
  );
}

/** Dots, full = done: days in the series and skips still available (owner decision, 2026-10-14). */
function Dots({ filled, total, className }: { filled: number; total: number; className: string }) {
  return (
    <span className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full border ${i < filled ? className : 'border-wellBorder bg-transparent'}`} />
      ))}
    </span>
  );
}

/** Streak: 7 days with every task done, up to 2 skipped days allowed (owner decision, 2026-10-14). */
function StreakRow({ streak, busy, onClaim }: { streak: DailyStreakDto; busy: boolean; onClaim: () => void }) {
  const t = useTranslations();
  const itemName = t(`items.${streak.rewardItemKey}.name`);
  return (
    <div className={rowClass(streak.ready ? 'ready' : 'open')} title={t('dailyTasks.streak.hint', { days: streak.target, misses: streak.allowedMisses })}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5 text-[11px] text-text">
          <span className="flex items-center gap-2">
            <span className="w-16">{t('dailyTasks.streak.title')}</span>
            <Dots filled={streak.days} total={streak.target} className="border-accent bg-accent" />
            <span className="tabular-nums">
              {streak.days}/{streak.target}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-16">{t('dailyTasks.streak.misses')}</span>
            {/* Full = a skip still available. */}
            <Dots filled={streak.allowedMisses - streak.missesUsed} total={streak.allowedMisses} className="border-textMuted bg-textMuted" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AssetIcon
            assetId={`items.${streak.rewardItemKey}.icon`}
            alt={itemName}
            className="h-10 w-10 shrink-0 object-contain"
            fallback={null}
          />
          {streak.ready && <ClaimButton busy={busy} onClick={onClaim} />}
        </div>
      </div>
      <p className="mt-1.5 text-[10px] text-text">
        {streak.restarted ? t('dailyTasks.streak.restarted') + ' ' : ''}
        {t('dailyTasks.streak.hint', { days: streak.target, misses: streak.allowedMisses })}
      </p>
    </div>
  );
}

/** All-tasks bonus, styled like a task: progress bar, then Claim, reward picture on the right (owner, 2026-10-14). */
function AllDoneRow({ allDone, busy, onClaim }: { allDone: DailyTasksDto['allDone']; busy: boolean; onClaim: () => void }) {
  const t = useTranslations();
  const itemName = t(`items.${allDone.bonusItemKey}.name`);
  const percent = allDone.target > 0 ? Math.round((allDone.progress / allDone.target) * 100) : 0;
  return (
    <div className={rowClass(allDone.claimed ? 'claimed' : allDone.completed ? 'ready' : 'open')}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-xs text-text">{t('dailyTasks.allDoneBonus', { item: itemName })}</div>
          <div className="flex h-7 items-center gap-3">
            {allDone.claimed ? (
              <span className="text-[11px] uppercase text-textFaint">✓ {t('dailyTasks.claimed')}</span>
            ) : allDone.completed ? (
              <ClaimButton busy={busy} onClick={onClaim} wide />
            ) : (
              <>
                <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-wellBorder">
                  <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
                </div>
                <span className="w-14 text-right text-[11px] tabular-nums text-textMuted">
                  {allDone.progress}/{allDone.target}
                </span>
              </>
            )}
          </div>
        </div>
        <AssetIcon assetId={`items.${allDone.bonusItemKey}.icon`} alt={itemName} className="h-10 w-10 shrink-0 object-contain" fallback={null} />
      </div>
    </div>
  );
}
