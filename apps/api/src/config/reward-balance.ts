import { Prisma, PrismaClient } from '@prisma/client';
import { GAME_BALANCE } from './game-config';

/**
 * Rewards balance (owner decision, 2026-10-19): edited in godmaster → Balance
 * → Rewards. Only the numbers and items of what exists — targets and rewards
 * of the daily tasks, the all-done bonus and the streak, each achievement
 * tier, and the level rewards. Adding or removing tasks/achievements stays in
 * code for now (owner: "only change at this stage"). Saved values replace the
 * ones in game-config.ts in place, at start-up and on save, so every place
 * reading GAME_BALANCE sees them at once.
 */

export interface DailyTaskReward {
  metalPerLevel: number;
  crystalPerLevel: number;
  xpPerLevel: number;
  energy: number;
}

export interface RewardBalanceConfig {
  levelRewards: {
    metalPerLevel: number;
    crystalPerLevel: number;
    boxEveryLevels: number;
    boxes: { upToLevel: number; itemKey: string }[];
    vip: { level: number; days: number }[];
  };
  dailyTasks: {
    tasks: Record<string, { target: number; reward: DailyTaskReward }>;
    allDoneBonusItemKey: string;
    allDoneBonusCredits: number;
    streak: { days: number; allowedMisses: number; rewardItemKey: string; rewardCredits: number };
  };
  // Per achievement, its tiers in order (the count is fixed).
  achievements: Record<string, { target: number; reward: { metal: number; crystal: number; credits: number; itemKey: string | null } }[]>;
}

export const REWARD_BALANCE_KEY = 'rewards';

function snapshot(): RewardBalanceConfig {
  const lr = GAME_BALANCE.levelRewards;
  const dt = GAME_BALANCE.dailyTasks;
  return {
    levelRewards: {
      metalPerLevel: lr.metalPerLevel,
      crystalPerLevel: lr.crystalPerLevel,
      boxEveryLevels: lr.boxEveryLevels,
      boxes: lr.boxes.map((b) => ({ upToLevel: b.upToLevel, itemKey: b.itemKey })),
      vip: lr.vip.map((v) => ({ level: v.level, days: v.days })),
    },
    dailyTasks: {
      tasks: Object.fromEntries(dt.tasks.map((t) => [t.key, { target: t.target, reward: { ...t.reward } }])),
      allDoneBonusItemKey: dt.allDoneBonusItemKey,
      allDoneBonusCredits: dt.allDoneBonusCredits,
      streak: { days: dt.streak.days, allowedMisses: dt.streak.allowedMisses, rewardItemKey: dt.streak.rewardItemKey, rewardCredits: dt.streak.rewardCredits },
    },
    achievements: Object.fromEntries(
      GAME_BALANCE.achievements.map((a) => [
        a.key,
        a.tiers.map((t) => ({
          target: t.target,
          reward: { metal: t.reward.metal, crystal: t.reward.crystal, credits: t.reward.credits ?? 0, itemKey: t.reward.itemKey ?? null },
        })),
      ]),
    ),
  };
}

// The values in game-config.ts, captured before any override.
export const DEFAULT_REWARD_BALANCE: RewardBalanceConfig = snapshot();

type Db = PrismaClient | Prisma.TransactionClient;

/** The saved config over the defaults — only for tasks/achievements/tiers that still exist. */
export async function loadRewardBalance(db: Db): Promise<RewardBalanceConfig> {
  const row = await db.balanceConfig.findUnique({ where: { key: REWARD_BALANCE_KEY } });
  const saved = (row?.data ?? {}) as Partial<RewardBalanceConfig>;
  const d = DEFAULT_REWARD_BALANCE;
  const boxes = saved.levelRewards?.boxes?.length === d.levelRewards.boxes.length ? saved.levelRewards.boxes : d.levelRewards.boxes;
  return {
    levelRewards: { ...d.levelRewards, ...(saved.levelRewards ?? {}), boxes },
    dailyTasks: {
      tasks: Object.fromEntries(
        Object.entries(d.dailyTasks.tasks).map(([key, def]) => {
          const s = saved.dailyTasks?.tasks?.[key];
          return [key, { target: s?.target ?? def.target, reward: { ...def.reward, ...(s?.reward ?? {}) } }];
        }),
      ),
      allDoneBonusItemKey: saved.dailyTasks?.allDoneBonusItemKey ?? d.dailyTasks.allDoneBonusItemKey,
      allDoneBonusCredits: saved.dailyTasks?.allDoneBonusCredits ?? d.dailyTasks.allDoneBonusCredits,
      streak: { ...d.dailyTasks.streak, ...(saved.dailyTasks?.streak ?? {}) },
    },
    achievements: Object.fromEntries(
      Object.entries(d.achievements).map(([key, tiers]) => {
        const s = saved.achievements?.[key];
        // Saved before Credits existed: keep the default Credits of each tier.
        return [key, s && s.length === tiers.length ? s.map((t, i) => ({ ...t, reward: { ...tiers[i].reward, ...t.reward } })) : tiers];
      }),
    ),
  };
}

/** Writes the config into GAME_BALANCE, changing the existing objects in place. */
export function applyRewardBalance(config: RewardBalanceConfig): void {
  const lr = GAME_BALANCE.levelRewards as unknown as RewardBalanceConfig['levelRewards'];
  lr.metalPerLevel = config.levelRewards.metalPerLevel;
  lr.crystalPerLevel = config.levelRewards.crystalPerLevel;
  lr.boxEveryLevels = config.levelRewards.boxEveryLevels;
  config.levelRewards.boxes.forEach((b, i) => Object.assign(lr.boxes[i], b));
  lr.vip = config.levelRewards.vip.map((v) => ({ ...v }));

  const dt = GAME_BALANCE.dailyTasks as unknown as {
    tasks: { key: string; target: number; reward: DailyTaskReward }[];
    allDoneBonusItemKey: string;
    allDoneBonusCredits: number;
    streak: RewardBalanceConfig['dailyTasks']['streak'];
  };
  for (const task of dt.tasks) {
    const c = config.dailyTasks.tasks[task.key];
    if (!c) continue;
    task.target = c.target;
    Object.assign(task.reward, c.reward);
  }
  dt.allDoneBonusItemKey = config.dailyTasks.allDoneBonusItemKey;
  dt.allDoneBonusCredits = config.dailyTasks.allDoneBonusCredits;
  Object.assign(dt.streak, config.dailyTasks.streak);

  for (const achievement of GAME_BALANCE.achievements as unknown as {
    key: string;
    tiers: { target: number; reward: { metal: number; crystal: number; credits?: number; itemKey?: string } }[];
  }[]) {
    const tiers = config.achievements[achievement.key];
    if (!tiers || tiers.length !== achievement.tiers.length) continue;
    achievement.tiers.forEach((tier, i) => {
      tier.target = tiers[i].target;
      tier.reward.metal = tiers[i].reward.metal;
      tier.reward.crystal = tiers[i].reward.crystal;
      tier.reward.credits = tiers[i].reward.credits;
      if (tiers[i].reward.itemKey) tier.reward.itemKey = tiers[i].reward.itemKey!;
      else delete tier.reward.itemKey;
    });
  }
}
