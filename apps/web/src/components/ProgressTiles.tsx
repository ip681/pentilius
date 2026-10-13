'use client';

import type { AchievementsDto, DailyTasksDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AchievementsPanel } from '@/components/AchievementsPanel';
import { AssetIcon } from '@/components/AssetIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { DailyTasksPanel } from '@/components/DailyTasksPanel';
import { getAchievements, getDailyTasks } from '@/lib/api-client';

type Open = 'daily' | 'achievements' | null;

/**
 * The two Command Center tiles (owner decision, 2026-10-13): "Daily tasks" and
 * "Achievements", side by side, each with its own dot when a reward can be
 * claimed. A click opens the list in a popup.
 */
export function ProgressTiles() {
  const t = useTranslations();
  const [daily, setDaily] = useState<DailyTasksDto | null>(null);
  const [achievements, setAchievements] = useState<AchievementsDto | null>(null);
  const [open, setOpen] = useState<Open>(null);

  function load() {
    getDailyTasks()
      .then(setDaily)
      .catch(() => undefined);
    getAchievements()
      .then(setAchievements)
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    const refresh = setInterval(load, 30_000);
    return () => clearInterval(refresh);
  }, []);

  const dailyDone = daily ? daily.tasks.filter((task) => task.completed).length : 0;
  const dailyClaimable = !!daily && (daily.tasks.some((task) => task.completed && !task.claimed) || (daily.allDone.completed && !daily.allDone.claimed));
  const achievementsClaimableCount = achievements
    ? achievements.achievements.filter((a) => a.completed && !a.finished).length + (achievements.levelReward?.reached ? 1 : 0)
    : 0;

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
        <Tile
          iconKey="daily_tasks"
          title={t('dailyTasks.title')}
          subtitle={daily ? t('dashboard.dailyTasksProgress', { done: dailyDone, total: daily.tasks.length }) : ''}
          dot={dailyClaimable}
          onClick={() => setOpen('daily')}
        />
        <Tile
          iconKey="achievements"
          title={t('achievements.title')}
          subtitle={achievementsClaimableCount > 0 ? t('dashboard.achievementsClaimable', { count: achievementsClaimableCount }) : t('dashboard.achievementsView')}
          dot={achievementsClaimableCount > 0}
          onClick={() => setOpen('achievements')}
        />
      </div>

      <BottomSheet open={open !== null} onClose={() => setOpen(null)} wide>
        {open === 'daily' && <DailyTasksPanel onChanged={load} />}
        {open === 'achievements' && <AchievementsPanel onChanged={load} />}
        <button type="button" onClick={() => setOpen(null)} className="mt-4 w-full text-center text-xs text-textFaint underline">
          {t('common.close')}
        </button>
      </BottomSheet>
    </>
  );
}

function Tile({ iconKey, title, subtitle, dot, onClick }: { iconKey: string; title: string; subtitle: string; dot: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex items-center gap-3 rounded-lg border border-panelBorder bg-panel p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent sm:p-4"
    >
      {dot && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-positive" />}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-wellBorder/50 to-transparent sm:h-14 sm:w-14">
        <AssetIcon
          assetId={`dashboard.${iconKey}.icon`}
          alt={title}
          className="h-10 w-10 object-contain sm:h-12 sm:w-12"
          fallback={<span className="text-lg font-semibold text-textMuted">{title.charAt(0)}</span>}
        />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-textMuted">{subtitle}</p>
      </div>
    </button>
  );
}
