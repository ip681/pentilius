import { Injectable } from '@nestjs/common';
import { Player, Prisma } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

/**
 * Elapsed-time resource/energy recalculation and XP/level-up application.
 * Prefers computing on read over background jobs, per instructions/ARCHITECTURE.md.
 * Shared by every module that reads or spends player state, so there is one
 * place that knows how these placeholder formulas work (see game-config.ts).
 */
@Injectable()
export class EconomyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Applies accrued building production since the last settlement and returns the up-to-date player. */
  async settleResources(playerId: string, tx: Tx = this.prisma): Promise<Player> {
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    const buildings = await tx.playerBuilding.findMany({
      where: { playerId, level: { gt: 0 } },
      include: { buildingType: { include: { levelCosts: true } } },
    });

    const elapsedHours = (Date.now() - player.resourcesUpdatedAt.getTime()) / 3_600_000;
    if (elapsedHours <= 0) {
      return player;
    }

    const gains: Record<string, number> = { METAL: 0, CRYSTAL: 0, OXYGEN: 0, CREDITS: 0 };
    for (const building of buildings) {
      const currentLevelCost = building.buildingType.levelCosts.find((cost) => cost.level === building.level);
      if (currentLevelCost?.producesResourceType && currentLevelCost.producesPerHour) {
        gains[currentLevelCost.producesResourceType] += currentLevelCost.producesPerHour * elapsedHours;
      }
    }

    const hasWholeUnitGain = Object.values(gains).some((amount) => Math.floor(amount) > 0);
    if (!hasWholeUnitGain) {
      return player;
    }

    return tx.player.update({
      where: { id: playerId },
      data: {
        metal: { increment: Math.floor(gains.METAL) },
        crystal: { increment: Math.floor(gains.CRYSTAL) },
        oxygen: { increment: Math.floor(gains.OXYGEN) },
        credits: { increment: Math.floor(gains.CREDITS) },
        resourcesUpdatedAt: new Date(),
      },
    });
  }

  /** Applies accrued Action Energy regeneration since the last settlement and returns the up-to-date player. */
  async settleEnergy(playerId: string, tx: Tx = this.prisma): Promise<Player> {
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.actionEnergy >= player.actionEnergyMax) {
      return player;
    }

    const intervalMs = GAME_BALANCE.actionEnergy.regenIntervalMinutes * 60_000;
    const elapsedMs = Date.now() - player.energyUpdatedAt.getTime();
    const pointsGained = Math.floor(elapsedMs / intervalMs);
    if (pointsGained <= 0) {
      return player;
    }

    const newEnergy = Math.min(player.actionEnergyMax, player.actionEnergy + pointsGained);
    return tx.player.update({
      where: { id: playerId },
      data: {
        actionEnergy: newEnergy,
        energyUpdatedAt: new Date(player.energyUpdatedAt.getTime() + pointsGained * intervalMs),
      },
    });
  }

  /** Settles both resources and energy; the common entry point for "load current player state". */
  async settleAll(playerId: string, tx: Tx = this.prisma): Promise<Player> {
    await this.settleResources(playerId, tx);
    return this.settleEnergy(playerId, tx);
  }

  /** Adds XP, cascading through as many level-ups as the gain covers. Returns the final player and whether it leveled up. */
  async applyXp(playerId: string, xpGained: number, tx: Tx = this.prisma): Promise<{ player: Player; leveledUp: boolean }> {
    let player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    let xp = player.xp + xpGained;
    let level = player.level;
    let leveledUp = false;

    for (;;) {
      const threshold = await tx.levelThreshold.findUnique({ where: { level } });
      if (!threshold || xp < threshold.xpRequired) {
        break;
      }
      xp -= threshold.xpRequired;
      level += 1;
      leveledUp = true;
    }

    player = await tx.player.update({ where: { id: playerId }, data: { xp, level } });
    return { player, leveledUp };
  }

  async getXpForNextLevel(level: number, tx: Tx = this.prisma): Promise<number | null> {
    const threshold = await tx.levelThreshold.findUnique({ where: { level } });
    return threshold?.xpRequired ?? null;
  }
}
