import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AchievementDto, AchievementRewardDto, AchievementsDto, LevelRewardDto } from '@pentilius/shared';
import { ItemTier, Prisma } from '@prisma/client';
import { AchievementConfig, AchievementMetric, AchievementRewardConfig, GAME_BALANCE } from '../config/game-config';
import { grantItem } from '../inventory/inventory-capacity';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

const LEVEL_KEY_PREFIX = 'level_';
const TIER_ORDER: ItemTier[] = ['PIONEER', 'ASCENDANT', 'COREFORGED'];
const EQUIPMENT_SLOT_COUNT = 7;

/** Metrics counted by record(); the others are read from the player's current state. */
const COUNTED_METRICS: AchievementMetric[] = ['PVE_WIN', 'EXPEDITION_COMPLETED', 'PVP_WIN', 'BOSS_WIN', 'CLAN_DONATION', 'CORE_ATTACK', 'DAILY_ALL_DONE'];

/**
 * Season achievements and level rewards (owner decision, 2026-10-13). Both
 * reset with the season. Nothing is granted automatically — the player claims
 * each reward, and the next one of the same kind then appears (like the daily
 * task chain). Lists and rewards: GAME_BALANCE.levelRewards / .achievements.
 */
@Injectable()
export class AchievementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Counts an action. Pass the caller's transaction so it commits with the action. */
  async record(playerId: string, metric: AchievementMetric, amount = 1, tx: Tx = this.prisma): Promise<void> {
    if (amount <= 0) return;
    await tx.achievementProgress.upsert({
      where: { playerId_metric: { playerId, metric } },
      update: { count: { increment: amount } },
      create: { playerId, metric, count: amount },
    });
  }

  getAchievements(playerId: string): Promise<AchievementsDto> {
    return this.buildView(playerId, this.prisma);
  }

  /** True if anything can be claimed — the tile dot and (with daily tasks) the nav dot. */
  async hasClaimable(playerId: string): Promise<boolean> {
    const view = await this.buildView(playerId, this.prisma);
    return (view.levelReward?.reached ?? false) || view.achievements.some((a) => a.completed && !a.finished);
  }

  async claim(playerId: string, claimKey: string): Promise<AchievementsDto> {
    await this.prisma.$transaction(async (tx) => {
      const view = await this.buildView(playerId, tx);
      let reward: AchievementRewardDto;
      if (claimKey.startsWith(LEVEL_KEY_PREFIX)) {
        const level = view.levelReward;
        if (!level || `${LEVEL_KEY_PREFIX}${level.level}` !== claimKey) throw new NotFoundException('REWARD_NOT_AVAILABLE');
        if (!level.reached) throw new BadRequestException('NOT_COMPLETED');
        reward = level.reward;
      } else {
        const achievement = view.achievements.find((a) => a.tierKey === claimKey);
        if (!achievement || achievement.finished) throw new NotFoundException('REWARD_NOT_AVAILABLE');
        if (!achievement.completed) throw new BadRequestException('NOT_COMPLETED');
        reward = achievement.reward;
      }
      await tx.achievementClaim.create({ data: { playerId, key: claimKey } });
      await tx.player.update({
        where: { id: playerId },
        data: { metal: { increment: reward.metal }, crystal: { increment: reward.crystal }, credits: { increment: reward.credits } },
      });
      if (reward.itemKey) {
        const item = await tx.itemDefinition.findUnique({ where: { key: reward.itemKey } });
        // A full inventory rolls the whole claim back, so nothing is lost.
        if (item && !(await grantItem(playerId, item.id, tx))) throw new BadRequestException('INVENTORY_FULL');
      }
    });
    return this.getAchievements(playerId);
  }

  private async buildView(playerId: string, tx: Tx): Promise<AchievementsDto> {
    const [player, progressRows, claims] = await Promise.all([
      tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { level: true, xp: true } }),
      tx.achievementProgress.findMany({ where: { playerId } }),
      tx.achievementClaim.findMany({ where: { playerId }, select: { key: true } }),
    ]);
    const claimed = new Set(claims.map((c) => c.key));
    const counters = new Map(progressRows.map((r) => [r.metric, r.count]));
    const state = await this.readState(playerId, tx);

    const achievements: AchievementDto[] = GAME_BALANCE.achievements.map((achievement) => {
      const tierCount = achievement.tiers.length;
      let tierIndex = achievement.tiers.findIndex((_, i) => !claimed.has(tierKeyOf(achievement, i)));
      const finished = tierIndex === -1;
      if (finished) tierIndex = tierCount - 1;
      const tier = achievement.tiers[tierIndex];
      const value = COUNTED_METRICS.includes(achievement.metric) ? (counters.get(achievement.metric) ?? 0) : stateValue(achievement.metric, tier.setTier, state);
      return {
        key: achievement.key,
        tierKey: tierKeyOf(achievement, tierIndex),
        tier: tierIndex + 1,
        tierCount,
        target: tier.target,
        progress: Math.min(value, tier.target),
        completed: value >= tier.target,
        finished,
        setTier: tier.setTier ?? null,
        reward: toRewardDto(tier.reward),
      };
    });

    // Rewards are claimed in order, so an unreached one is always the next level: its bar is this level's XP.
    const threshold = await tx.levelThreshold.findUnique({ where: { level: player.level } });
    const xpPercent = threshold && threshold.xpRequired > 0 ? Math.min(100, Math.floor((player.xp / threshold.xpRequired) * 100)) : null;
    return { levelReward: this.nextLevelReward(player.level, claimed, xpPercent), achievements };
  }

  /** The lowest level from 2 up whose reward is unclaimed — reached or the next one to reach. */
  private nextLevelReward(currentLevel: number, claimed: Set<string>, xpPercent: number | null): LevelRewardDto | null {
    const { maxLevel } = GAME_BALANCE.levelRewards;
    for (let level = 2; level <= maxLevel; level++) {
      if (claimed.has(`${LEVEL_KEY_PREFIX}${level}`)) continue;
      const reached = currentLevel >= level;
      return { level, claimKey: `${LEVEL_KEY_PREFIX}${level}`, currentLevel, reached, reward: levelReward(level), xpPercent: reached ? null : xpPercent };
    }
    return null;
  }

  /** Current-state metrics: best item upgrade, equipped slots per set tier, lowest base building level. */
  private async readState(playerId: string, tx: Tx): Promise<PlayerState> {
    const [bestUpgrade, equipped, buildings] = await Promise.all([
      tx.itemInstance.aggregate({ where: { playerId }, _max: { upgradeLevel: true } }),
      tx.itemInstance.findMany({ where: { playerId, equippedSlot: { not: null } }, select: { itemDefinition: { select: { tier: true } } } }),
      tx.playerBuilding.findMany({ where: { playerId }, select: { level: true } }),
    ]);
    return {
      maxItemUpgrade: bestUpgrade._max.upgradeLevel ?? 0,
      equippedTiers: equipped.map((e) => e.itemDefinition.tier),
      minBuildingLevel: buildings.length > 0 ? Math.min(...buildings.map((b) => b.level)) : 0,
    };
  }
}

interface PlayerState {
  maxItemUpgrade: number;
  equippedTiers: (ItemTier | null)[];
  minBuildingLevel: number;
}

function stateValue(metric: AchievementMetric, setTier: ItemTier | undefined, state: PlayerState): number {
  switch (metric) {
    case 'MAX_ITEM_UPGRADE':
      return state.maxItemUpgrade;
    case 'MIN_BUILDING_LEVEL':
      return state.minBuildingLevel;
    case 'FULL_SET': {
      // Slots equipped with this set or a stronger one.
      const minIndex = TIER_ORDER.indexOf(setTier ?? 'PIONEER');
      return Math.min(EQUIPMENT_SLOT_COUNT, state.equippedTiers.filter((t) => t !== null && TIER_ORDER.indexOf(t) >= minIndex).length);
    }
    default:
      return 0;
  }
}

function tierKeyOf(achievement: AchievementConfig, tierIndex: number): string {
  return `${achievement.key}_${tierIndex + 1}`;
}

function toRewardDto(reward: AchievementRewardConfig): AchievementRewardDto {
  return { metal: reward.metal, crystal: reward.crystal, credits: reward.credits ?? 0, itemKey: reward.itemKey ?? null };
}

/** Resources grow with the level; every Nth level adds a box of the set of the zone being entered. */
function levelReward(level: number): AchievementRewardDto {
  const config = GAME_BALANCE.levelRewards;
  const box = level % config.boxEveryLevels === 0 ? (config.boxes.find((b) => level <= b.upToLevel)?.itemKey ?? null) : null;
  return { metal: config.metalPerLevel * level, crystal: config.crystalPerLevel * level, credits: 0, itemKey: box };
}
