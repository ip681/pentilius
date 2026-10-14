import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DailyStreakDto, DailyTaskDto, DailyTaskRewardDto, DailyTasksDto } from '@pentilius/shared';
import { Player, Prisma } from '@prisma/client';
import { DailyTaskConfig, DailyTaskType, GAME_BALANCE } from '../config/game-config';
import { grantItem } from '../inventory/inventory-capacity';
import { EconomyService } from '../player/economy.service';
import { AchievementsService } from '../achievements/achievements.service';
import { PrismaService } from '../prisma/prisma.service';
import { isVip } from '../vip/vip';

type Tx = PrismaService | Prisma.TransactionClient;

const ALL_DONE_KEY = 'ALL_DONE';
const STREAK_KEY = 'STREAK';
const STREAK = GAME_BALANCE.dailyTasks.streak;
const TASKS = GAME_BALANCE.dailyTasks.tasks;

/** Calendar day ("2026-10-13") in the daily-task time zone. */
export function dailyTaskDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: GAME_BALANCE.dailyTasks.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** The next 00:00 in the daily-task time zone, as an absolute instant (DST-safe). */
function nextReset(now: Date = new Date()): Date {
  const today = dailyTaskDay(now);
  // Step forward in 15-minute increments until the local day changes — cheap
  // (at most ~96 steps) and correct across DST switches without tz math.
  let probe = new Date(Math.floor(now.getTime() / 900_000) * 900_000);
  while (dailyTaskDay(probe) === today) probe = new Date(probe.getTime() + 900_000);
  return probe;
}

/**
 * Daily tasks (owner decision, 2026-10-13). The list is GAME_BALANCE.dailyTasks;
 * actions call record() to bump today's counter; players claim rewards from
 * the Command Center. Unclaimed completed rewards from earlier days are granted
 * automatically the next time the player's tasks are read (settlePastDays).
 */
@Injectable()
export class DailyTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly achievements: AchievementsService,
  ) {}

  /** Counts an action toward today's tasks. Pass the caller's transaction so it commits with the action. */
  async record(playerId: string, type: DailyTaskType, amount = 1, tx: Tx = this.prisma): Promise<void> {
    if (amount <= 0) return;
    const day = dailyTaskDay();
    const row = await tx.dailyTaskProgress.upsert({
      where: { playerId_day_type: { playerId, day, type } },
      update: { count: { increment: amount } },
      create: { playerId, day, type, count: amount },
    });
    // Only when this action just finished a task can the whole day have
    // become complete — so the streak check runs a few times a day, not on
    // every action.
    const before = row.count - amount;
    if (TASKS.some((t) => t.type === type && before < t.target && row.count >= t.target)) {
      await this.checkStreak(playerId, day, tx);
    }
  }

  /** Counts today toward the streak once every visible task is done. */
  private async checkStreak(playerId: string, day: string, tx: Tx): Promise<void> {
    const view = await this.buildDay(playerId, day, tx);
    if (!view.allDone.completed) return;
    const player = await tx.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { dailyStreakDays: true, dailyStreakMisses: true, dailyStreakLastDay: true, dailyStreakReady: true },
    });
    if (player.dailyStreakLastDay === day) return;
    const next = advanceStreak(player, day);
    await tx.player.update({ where: { id: playerId }, data: next });
  }

  async getTasks(playerId: string): Promise<DailyTasksDto> {
    await this.settlePastDays(playerId);
    const day = dailyTaskDay();
    const view = await this.buildDay(playerId, day, this.prisma);
    return { day, resetAt: nextReset().toISOString(), tasks: view.tasks, allDone: view.allDone, streak: view.streak };
  }

  /** True if anything can be claimed right now — drives the nav dot. */
  async hasClaimable(playerId: string): Promise<boolean> {
    const view = await this.buildDay(playerId, dailyTaskDay(), this.prisma);
    return view.tasks.some((t) => t.completed && !t.claimed) || (view.allDone.completed && !view.allDone.claimed) || view.streak.ready;
  }

  async claim(playerId: string, taskKey: string): Promise<DailyTasksDto> {
    const day = dailyTaskDay();
    await this.prisma.$transaction(async (tx) => {
      const view = await this.buildDay(playerId, day, tx);
      if (taskKey === STREAK_KEY) {
        if (!view.streak.ready) throw new BadRequestException('NOT_COMPLETED');
        await this.grantStreak(playerId, tx);
        return;
      }
      if (taskKey === ALL_DONE_KEY) {
        if (!view.allDone.completed) throw new BadRequestException('NOT_COMPLETED');
        if (view.allDone.claimed) throw new BadRequestException('ALREADY_CLAIMED');
        await this.grantBonus(playerId, day, false, tx);
        return;
      }
      const task = view.tasks.find((t) => t.key === taskKey);
      if (!task) throw new NotFoundException('TASK_NOT_AVAILABLE');
      if (!task.completed) throw new BadRequestException('NOT_COMPLETED');
      if (task.claimed) throw new BadRequestException('ALREADY_CLAIMED');
      await this.grantTask(playerId, day, task.key, task.reward, false, tx);
    });
    return this.getTasks(playerId);
  }

  /**
   * What the player sees for one day: tasks gated by level/clan (with only the
   * first unclaimed task of each chain), their progress, rewards and claims.
   */
  private async buildDay(
    playerId: string,
    day: string,
    tx: Tx,
  ): Promise<{ tasks: (DailyTaskDto & { reward: DailyTaskRewardDto })[]; allDone: DailyTasksDto['allDone']; streak: DailyStreakDto }> {
    const [player, membership, lowestBoss, progressRows, claims] = await Promise.all([
      tx.player.findUniqueOrThrow({
        where: { id: playerId },
        select: { level: true, dailyStreakDays: true, dailyStreakMisses: true, dailyStreakLastDay: true, dailyStreakReady: true },
      }),
      tx.clanMembership.findUnique({ where: { playerId }, select: { id: true } }),
      tx.boss.findFirst({ orderBy: { minLevel: 'asc' }, select: { minLevel: true } }),
      tx.dailyTaskProgress.findMany({ where: { playerId, day } }),
      tx.dailyTaskClaim.findMany({ where: { playerId, day } }),
    ]);
    const progress = new Map(progressRows.map((r) => [r.type, r.count]));
    const claimed = new Set(claims.map((c) => c.taskKey));

    const minLevelOf = (task: DailyTaskConfig): number =>
      task.minLevel === 'PVP' ? GAME_BALANCE.pvp.minLevel : task.minLevel === 'BOSS' ? (lowestBoss?.minLevel ?? Infinity) : (task.minLevel ?? 1);
    const visible = TASKS.filter((t) => player.level >= minLevelOf(t) && (!t.requiresClan || !!membership));

    const shownChains = new Set<string>();
    const tasks: (DailyTaskDto & { reward: DailyTaskRewardDto })[] = [];
    for (const task of visible) {
      if (task.chain) {
        if (shownChains.has(task.chain)) continue;
        // Skip tiers already claimed; show the first one that isn't.
        if (claimed.has(task.key) && visible.some((t) => t.chain === task.chain && !claimed.has(t.key))) continue;
        shownChains.add(task.chain);
      }
      const count = progress.get(task.type) ?? 0;
      tasks.push({
        key: task.key,
        type: task.type,
        target: task.target,
        progress: Math.min(count, task.target),
        completed: count >= task.target,
        claimed: claimed.has(task.key),
        reward: rewardFor(task, player.level),
      });
    }

    // All-tasks bonus: every visible task (every tier of every chain) completed.
    const allCompleted = visible.length > 0 && visible.every((t) => (progress.get(t.type) ?? 0) >= t.target);
    return {
      tasks,
      allDone: {
        completed: allCompleted,
        claimed: claimed.has(ALL_DONE_KEY),
        bonusItemKey: GAME_BALANCE.dailyTasks.allDoneBonusItemKey,
        progress: visible.filter((t) => (progress.get(t.type) ?? 0) >= t.target).length,
        target: visible.length,
      },
      streak: streakView(player, day),
    };
  }

  /**
   * Closes earlier days. Owner decision (2026-10-13): auto-granting unclaimed
   * completed rewards is a VIP perk — only if the player was VIP when that day
   * ended. Everyone else's unclaimed rewards expire with the day.
   */
  private async settlePastDays(playerId: string): Promise<void> {
    const today = dailyTaskDay();
    const pastDays = await this.prisma.dailyTaskProgress.findMany({
      where: { playerId, day: { lt: today } },
      distinct: ['day'],
      select: { day: true },
    });
    for (const { day } of pastDays) {
      await this.prisma.$transaction(async (tx) => {
        const player = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { level: true, vipUntil: true } });
        if (!isVip(player, dayEnd(day))) {
          await tx.dailyTaskProgress.deleteMany({ where: { playerId, day } });
          return;
        }
        const [progressRows, claims] = await Promise.all([
          tx.dailyTaskProgress.findMany({ where: { playerId, day } }),
          tx.dailyTaskClaim.findMany({ where: { playerId, day } }),
        ]);
        const progress = new Map(progressRows.map((r) => [r.type, r.count]));
        const claimed = new Set(claims.map((c) => c.taskKey));
        let allCompleted = true;
        for (const task of TASKS) {
          const done = (progress.get(task.type) ?? 0) >= task.target;
          if (!done) {
            // Tasks never touched that day don't block the bonus only if the
            // player couldn't see them — unknown in hindsight, so be strict.
            allCompleted = false;
            continue;
          }
          if (!claimed.has(task.key)) await this.grantTask(playerId, day, task.key, rewardFor(task, player.level), true, tx);
        }
        if (allCompleted && !claimed.has(ALL_DONE_KEY)) await this.grantBonus(playerId, day, true, tx);
        // Progress rows of a fully settled day are no longer needed.
        await tx.dailyTaskProgress.deleteMany({ where: { playerId, day } });
      });
    }
  }

  private async grantTask(playerId: string, day: string, taskKey: string, reward: DailyTaskRewardDto, auto: boolean, tx: Prisma.TransactionClient): Promise<void> {
    await tx.dailyTaskClaim.create({ data: { playerId, day, taskKey, auto } });
    await this.economy.settleAll(playerId, tx);
    await tx.player.update({ where: { id: playerId }, data: { metal: { increment: reward.metal }, crystal: { increment: reward.crystal } } });
    if (reward.energy > 0) await this.addEnergy(playerId, reward.energy, tx);
    if (reward.xp > 0) await this.economy.applyXp(playerId, reward.xp, tx);
  }

  /** The streak reward; the series then starts over. Refused (and kept) if the inventory is full. */
  private async grantStreak(playerId: string, tx: Prisma.TransactionClient): Promise<void> {
    const item = await tx.itemDefinition.findUnique({ where: { key: STREAK.rewardItemKey } });
    if (item && !(await grantItem(playerId, item.id, tx))) throw new BadRequestException('INVENTORY_FULL');
    await tx.player.update({
      where: { id: playerId },
      data: { dailyStreakDays: 0, dailyStreakMisses: 0, dailyStreakLastDay: null, dailyStreakReady: false },
    });
  }

  /** The all-tasks bonus item; if the inventory is full, its energy is given directly instead. */
  private async grantBonus(playerId: string, day: string, auto: boolean, tx: Prisma.TransactionClient): Promise<void> {
    await tx.dailyTaskClaim.create({ data: { playerId, day, taskKey: ALL_DONE_KEY, auto } });
    // Counts toward the "all daily tasks" achievement.
    await this.achievements.record(playerId, 'DAILY_ALL_DONE', 1, tx);
    const item = await tx.itemDefinition.findUnique({ where: { key: GAME_BALANCE.dailyTasks.allDoneBonusItemKey } });
    if (!item) return;
    const granted = await grantItem(playerId, item.id, tx);
    if (!granted) {
      const energy = (item.baseStats as { energy?: number }).energy ?? 0;
      await this.economy.settleAll(playerId, tx);
      await this.addEnergy(playerId, energy, tx);
    }
  }

  /** Same rule as using an energy pack: capped at the player's max. */
  private async addEnergy(playerId: string, amount: number, tx: Prisma.TransactionClient): Promise<void> {
    const player: Pick<Player, 'actionEnergy' | 'actionEnergyMax'> = await tx.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { actionEnergy: true, actionEnergyMax: true },
    });
    await tx.player.update({ where: { id: playerId }, data: { actionEnergy: Math.min(player.actionEnergyMax, player.actionEnergy + amount) } });
  }
}

type StreakState = { dailyStreakDays: number; dailyStreakMisses: number; dailyStreakLastDay: string | null; dailyStreakReady: boolean };

/** Whole days between two "YYYY-MM-DD" days. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Skipped days since the last completed day, not counting today (it can still be done). */
function pendingMisses(state: StreakState, today: string): number {
  return state.dailyStreakLastDay ? Math.max(0, daysBetween(state.dailyStreakLastDay, today) - 1) : 0;
}

/** The streak after `day` was fully completed. A waiting reward freezes it until claimed. */
function advanceStreak(state: StreakState, day: string): Partial<StreakState> {
  if (state.dailyStreakReady) return {};
  const misses = state.dailyStreakMisses + pendingMisses(state, day);
  if (misses > STREAK.allowedMisses) {
    return { dailyStreakDays: 1, dailyStreakMisses: 0, dailyStreakLastDay: day, dailyStreakReady: false };
  }
  const days = state.dailyStreakDays + 1;
  return { dailyStreakDays: days, dailyStreakMisses: misses, dailyStreakLastDay: day, dailyStreakReady: days >= STREAK.days };
}

/** What the player sees today; skipped days count as soon as they're over. */
function streakView(state: StreakState, today: string): DailyStreakDto {
  const base = { target: STREAK.days, allowedMisses: STREAK.allowedMisses, rewardItemKey: STREAK.rewardItemKey };
  if (state.dailyStreakReady) {
    return { ...base, days: STREAK.days, missesUsed: state.dailyStreakMisses, ready: true, restarted: false };
  }
  const misses = state.dailyStreakMisses + (state.dailyStreakLastDay === today ? 0 : pendingMisses(state, today));
  if (misses > STREAK.allowedMisses) {
    return { ...base, days: 0, missesUsed: 0, ready: false, restarted: true };
  }
  return { ...base, days: state.dailyStreakDays, missesUsed: misses, ready: false, restarted: false };
}

/** When a daily-task day ended (its next local midnight). Noon UTC always falls inside that local day. */
function dayEnd(day: string): Date {
  return nextReset(new Date(`${day}T12:00:00Z`));
}

function rewardFor(task: DailyTaskConfig, level: number): DailyTaskRewardDto {
  return {
    metal: task.reward.metalPerLevel * level,
    crystal: task.reward.crystalPerLevel * level,
    xp: task.reward.xpPerLevel * level,
    energy: task.reward.energy,
  };
}
