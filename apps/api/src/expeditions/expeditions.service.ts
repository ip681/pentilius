import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActiveExpeditionDto, ExpeditionClaimResultDto, ExpeditionsResponseDto, ExpeditionTypeDto } from '@pentilius/shared';
import { equipmentItemKey, EQUIPMENT_SLOTS, SetTier } from '../config/equipment-balance';
import { ExpeditionBalanceConfig, expeditionRewards, ExpeditionRewards, loadExpeditionBalance } from '../config/expedition-balance';
import { loadPentiliBalance, PentiliBalanceConfig } from '../config/pentili-balance';
import { grantItem } from '../inventory/inventory-capacity';
import { EconomyService } from '../player/economy.service';
import { AchievementsService } from '../achievements/achievements.service';
import { DailyTasksService } from '../daily-tasks/daily-tasks.service';
import { Prisma, ResearchBonusType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpeditionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly dailyTasks: DailyTasksService,
    private readonly achievements: AchievementsService,
  ) {}

  async getExpeditions(playerId: string): Promise<ExpeditionsResponseDto> {
    const [types, active, navigationLevel, player, balance] = await Promise.all([
      this.prisma.expeditionType.findMany({ orderBy: { durationMinutes: 'asc' } }),
      this.prisma.playerExpedition.findFirst({
        where: { playerId, claimedAt: null },
        include: { expeditionType: true },
      }),
      this.navigationLevel(playerId),
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId }, select: { level: true } }),
      this.loadBalance(),
    ]);
    const bonusTier = await this.bonusTier(player.level, balance.pentili);

    return {
      types: types.map((type) => toExpeditionTypeDto(type, navigationLevel, this.rewardsFor(type.key, player.level, balance), bonusTier)),
      earlyCancelPercentage: balance.expeditions.earlyCancelPercentage,
      active: active
        ? {
            expeditionKey: active.expeditionType.key,
            expeditionNameKey: active.expeditionType.nameKey,
            startedAt: active.startedAt.toISOString(),
            endsAt: active.endsAt.toISOString(),
            completed: active.endsAt.getTime() <= Date.now(),
          }
        : null,
    };
  }

  /**
   * Navigation research level (owner decision, 2026-10-14: it unlocks the
   * longer expeditions). A level whose time is already up counts, even if the
   * research screen hasn't been opened to finalize it yet.
   */
  private async navigationLevel(playerId: string): Promise<number> {
    const research = await this.prisma.playerResearch.findFirst({
      where: { playerId, researchType: { bonusType: ResearchBonusType.EXPEDITION_REWARDS } },
      select: { level: true, researchEndsAt: true },
    });
    if (!research) return 0;
    return research.level + (research.researchEndsAt && research.researchEndsAt <= new Date() ? 1 : 0);
  }

  // Rewards and the bonus set follow the balance in godmaster (owner decision, 2026-10-19).
  private async loadBalance(db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<{ expeditions: ExpeditionBalanceConfig; pentili: PentiliBalanceConfig }> {
    const [expeditions, pentili] = await Promise.all([loadExpeditionBalance(db), loadPentiliBalance(db)]);
    return { expeditions, pentili };
  }

  /** What this expedition pays a player of this level, before the Navigation research. */
  private rewardsFor(key: string, level: number, balance: { expeditions: ExpeditionBalanceConfig; pentili: PentiliBalanceConfig }): ExpeditionRewards {
    const expedition = balance.expeditions.expeditions[key];
    return expedition ? expeditionRewards(expedition, balance.pentili, level) : { metal: 0, crystal: 0, xp: 0 };
  }

  /** The set of the highest zone this level has unlocked — the bonus item comes from it. */
  private async bonusTier(level: number, pentili: PentiliBalanceConfig, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<SetTier | null> {
    const zone = await db.zone.findFirst({ where: { unlockLevel: { lte: level } }, orderBy: { order: 'desc' }, select: { key: true } });
    return zone ? ((pentili.zones[zone.key]?.itemTier as SetTier | undefined) ?? null) : null;
  }

  async start(playerId: string, key: string): Promise<ActiveExpeditionDto> {
    const existing = await this.prisma.playerExpedition.findFirst({ where: { playerId, claimedAt: null } });
    if (existing) {
      throw new BadRequestException('An expedition is already in progress. Claim it before starting another.');
    }

    const expeditionType = await this.prisma.expeditionType.findUnique({ where: { key } });
    if (!expeditionType) {
      throw new NotFoundException('Unknown expedition');
    }
    // Longer expeditions unlock with the Navigation research (owner decision, 2026-10-14).
    if (expeditionType.requiredNavigationLevel > (await this.navigationLevel(playerId))) {
      throw new BadRequestException('NAVIGATION_LEVEL_REQUIRED');
    }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + expeditionType.durationMinutes * 60_000);
    await this.prisma.playerExpedition.create({
      data: { playerId, expeditionTypeId: expeditionType.id, startedAt, endsAt },
    });

    return {
      expeditionKey: expeditionType.key,
      expeditionNameKey: expeditionType.nameKey,
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
      completed: false,
    };
  }

  async claim(playerId: string): Promise<ExpeditionClaimResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.playerExpedition.findFirst({
        where: { playerId, claimedAt: null },
        include: { expeditionType: true },
      });
      if (!active) {
        throw new NotFoundException('No expedition in progress');
      }
      if (active.endsAt.getTime() > Date.now()) {
        throw new BadRequestException('Expedition has not finished yet');
      }

      const { expeditionType } = active;
      // Rewards at the player's level when collecting (owner decision, 2026-10-19).
      const balance = await this.loadBalance(tx);
      const { level } = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { level: true } });
      const earned = this.rewardsFor(expeditionType.key, level, balance);
      // Navigation research raises the resource rewards (owner decision, 2026-10-14).
      const navigation = await this.economy.getResearchMultiplier(playerId, ResearchBonusType.EXPEDITION_REWARDS, tx);
      const resources = {
        metal: Math.floor(earned.metal * navigation),
        crystal: Math.floor(earned.crystal * navigation),
        credits: 0,
      };
      await tx.player.update({
        where: { id: playerId },
        data: { metal: { increment: resources.metal }, crystal: { increment: resources.crystal } },
      });

      const { leveledUp, player } = await this.economy.applyXp(playerId, earned.xp, tx);

      // A random item of the set of the player's highest unlocked zone (owner decision, 2026-10-19).
      let bonusItem: ExpeditionClaimResultDto['bonusItem'] = null;
      const tier = await this.bonusTier(level, balance.pentili, tx);
      if (tier && expeditionType.bonusItemChance && Math.random() < expeditionType.bonusItemChance) {
        const slot = EQUIPMENT_SLOTS[Math.floor(Math.random() * EQUIPMENT_SLOTS.length)];
        const definition = await tx.itemDefinition.findUnique({ where: { key: equipmentItemKey(tier, slot) } });
        if (definition && (await grantItem(playerId, definition.id, tx))) {
          bonusItem = { itemDefinitionKey: definition.key, itemNameKey: definition.nameKey, itemIconAssetId: definition.iconAssetId };
        }
      }

      await tx.playerExpedition.update({ where: { id: active.id }, data: { claimedAt: new Date() } });
      // Only a finished, collected expedition counts — not a cancelled one (owner decision).
      await this.dailyTasks.record(playerId, 'EXPEDITION_COMPLETED', 1, tx);
      await this.achievements.record(playerId, 'EXPEDITION_COMPLETED', 1, tx);

      return {
        rewards: { ...resources, xp: earned.xp },
        bonusItem,
        leveledUp,
        playerLevel: player.level,
      };
    });
  }

  /** Ends an in-progress expedition early, paying out earlyCancelPercentage of the reward earned proportionally to elapsed time. No bonus item roll. */
  async cancel(playerId: string): Promise<ExpeditionClaimResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.playerExpedition.findFirst({
        where: { playerId, claimedAt: null },
        include: { expeditionType: true },
      });
      if (!active) {
        throw new NotFoundException('No expedition in progress');
      }
      if (active.endsAt.getTime() <= Date.now()) {
        throw new BadRequestException('Expedition has already finished — claim it instead of cancelling');
      }

      const { expeditionType } = active;
      const balance = await this.loadBalance(tx);
      const { level } = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { level: true } });
      const earned = this.rewardsFor(expeditionType.key, level, balance);
      const totalMs = active.endsAt.getTime() - active.startedAt.getTime();
      const elapsedMs = Date.now() - active.startedAt.getTime();
      const proportion = Math.min(1, elapsedMs / totalMs) * balance.expeditions.earlyCancelPercentage;

      const rewards = {
        metal: Math.floor(earned.metal * proportion),
        crystal: Math.floor(earned.crystal * proportion),
        credits: 0,
        xp: Math.floor(earned.xp * proportion),
      };

      await tx.player.update({
        where: { id: playerId },
        data: { metal: { increment: rewards.metal }, crystal: { increment: rewards.crystal } },
      });

      const { leveledUp, player } = await this.economy.applyXp(playerId, rewards.xp, tx);

      await tx.playerExpedition.update({ where: { id: active.id }, data: { claimedAt: new Date(), cancelled: true } });

      return { rewards, bonusItem: null, leveledUp, playerLevel: player.level };
    });
  }
}

function toExpeditionTypeDto(
  type: { requiredNavigationLevel: number; key: string; nameKey: string; durationMinutes: number; bonusItemChance: number | null },
  navigationLevel: number,
  rewards: ExpeditionRewards,
  bonusTier: SetTier | null,
): ExpeditionTypeDto {
  return {
    key: type.key,
    nameKey: type.nameKey,
    durationMinutes: type.durationMinutes,
    rewards: { metal: rewards.metal, crystal: rewards.crystal, credits: 0, xp: rewards.xp },
    bonusItemTier: bonusTier ? (bonusTier.toUpperCase() as ExpeditionTypeDto['bonusItemTier']) : null,
    bonusItemChance: type.bonusItemChance,
    requiredNavigationLevel: type.requiredNavigationLevel,
    locked: type.requiredNavigationLevel > navigationLevel,
  };
}
