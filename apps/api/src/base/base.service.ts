import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseResponseDto, BuildingProductionDto, BuildingStateDto, BuildQueueDto, ResourcesDto } from '@pentilius/shared';
import { BuildingLevelCost, BuildingType, Player, PlayerBuilding } from '@prisma/client';
import { EconomyService } from '../player/economy.service';
import { PushService } from '../notifications/push.service';
import { PrismaService } from '../prisma/prisma.service';
import { isVip } from '../vip/vip';

type BuildingWithType = PlayerBuilding & { buildingType: BuildingType & { levelCosts: BuildingLevelCost[] } };

@Injectable()
export class BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly push: PushService,
  ) {}

  async getBase(playerId: string): Promise<BaseResponseDto> {
    await this.economy.settleResources(playerId);
    await this.ensurePlayerBuildingsExist(playerId);
    await this.finalizeCompletedBuildings(playerId);

    const buildings = await this.loadBuildings(playerId);
    const fresh = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    return {
      resources: toResourcesDto(fresh),
      buildings: buildings.map(toBuildingStateDto),
      buildQueue: toBuildQueueDto(fresh, buildings),
      isVip: isVip(fresh),
    };
  }

  /**
   * VIP build queue (owner decision, 2026-10-13): while a building is under
   * construction, queue one more — the next level of any building, the one
   * under construction included. Paid now; starts by itself, no faster.
   */
  async queueBuilding(playerId: string, buildingKey: string): Promise<BaseResponseDto> {
    await this.economy.settleResources(playerId);
    await this.ensurePlayerBuildingsExist(playerId);
    await this.finalizeCompletedBuildings(playerId);

    await this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      if (!isVip(player)) {
        throw new ForbiddenException('VIP_REQUIRED');
      }
      if (player.buildQueueBuildingTypeId) {
        throw new BadRequestException('BUILD_QUEUE_FULL');
      }
      const buildingType = await tx.buildingType.findUnique({ where: { key: buildingKey } });
      if (!buildingType) {
        throw new NotFoundException('Unknown building');
      }
      const underConstruction = await tx.playerBuilding.findFirst({ where: { playerId, constructionEndsAt: { not: null } } });
      if (!underConstruction) {
        throw new BadRequestException('NOTHING_UNDER_CONSTRUCTION');
      }
      const playerBuilding = await tx.playerBuilding.findUniqueOrThrow({
        where: { playerId_buildingTypeId: { playerId, buildingTypeId: buildingType.id } },
      });
      const targetLevel = playerBuilding.level + (playerBuilding.constructionEndsAt ? 2 : 1);
      const cost = await tx.buildingLevelCost.findUnique({
        where: { buildingTypeId_level: { buildingTypeId: buildingType.id, level: targetLevel } },
      });
      if (!cost) {
        throw new BadRequestException('Building is already at max level');
      }
      if (player.metal < cost.metalCost || player.crystal < cost.crystalCost) {
        throw new BadRequestException('Not enough resources');
      }
      await tx.player.update({
        where: { id: playerId },
        data: {
          metal: { decrement: cost.metalCost },
          crystal: { decrement: cost.crystalCost },
          buildQueueBuildingTypeId: buildingType.id,
          buildQueueMetal: cost.metalCost,
          buildQueueCrystal: cost.crystalCost,
        },
      });
    });
    return this.getBase(playerId);
  }

  /** Cancels the queued building and refunds exactly what was paid. */
  async cancelQueue(playerId: string): Promise<BaseResponseDto> {
    await this.economy.settleResources(playerId);
    await this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      if (!player.buildQueueBuildingTypeId) {
        throw new BadRequestException('BUILD_QUEUE_EMPTY');
      }
      // Guarded on the queued id so a concurrent auto-start can't also refund.
      const cleared = await tx.player.updateMany({
        where: { id: playerId, buildQueueBuildingTypeId: player.buildQueueBuildingTypeId },
        data: {
          metal: { increment: player.buildQueueMetal },
          crystal: { increment: player.buildQueueCrystal },
          buildQueueBuildingTypeId: null,
          buildQueueMetal: 0,
          buildQueueCrystal: 0,
        },
      });
      if (cleared.count !== 1) {
        throw new BadRequestException('BUILD_QUEUE_EMPTY');
      }
    });
    return this.getBase(playerId);
  }

  async upgradeBuilding(playerId: string, buildingKey: string): Promise<BuildingStateDto> {
    await this.economy.settleResources(playerId);
    await this.ensurePlayerBuildingsExist(playerId);
    await this.finalizeCompletedBuildings(playerId);

    return this.prisma.$transaction(async (tx) => {
      const buildingType = await tx.buildingType.findUnique({ where: { key: buildingKey } });
      if (!buildingType) {
        throw new NotFoundException('Unknown building');
      }

      const playerBuilding = await tx.playerBuilding.findUniqueOrThrow({
        where: { playerId_buildingTypeId: { playerId, buildingTypeId: buildingType.id } },
      });

      if (playerBuilding.constructionEndsAt) {
        throw new BadRequestException('Building is already under construction');
      }

      // Owner decision (2026-09-11): only one construction in progress at a
      // time, base-wide — not per-building. Serializing gives players a real
      // priority choice and stretches base progression across the season,
      // instead of finishing every building in parallel.
      const anyUnderConstruction = await tx.playerBuilding.findFirst({
        where: { playerId, constructionEndsAt: { not: null } },
      });
      if (anyUnderConstruction) {
        throw new BadRequestException('ANOTHER_BUILDING_UNDER_CONSTRUCTION');
      }

      const nextLevelCost = await tx.buildingLevelCost.findUnique({
        where: { buildingTypeId_level: { buildingTypeId: buildingType.id, level: playerBuilding.level + 1 } },
      });
      if (!nextLevelCost) {
        throw new BadRequestException('Building is already at max level');
      }

      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      if (player.metal < nextLevelCost.metalCost || player.crystal < nextLevelCost.crystalCost) {
        throw new BadRequestException('Not enough resources');
      }

      await tx.player.update({
        where: { id: playerId },
        data: { metal: { decrement: nextLevelCost.metalCost }, crystal: { decrement: nextLevelCost.crystalCost } },
      });

      const updated = await tx.playerBuilding.update({
        where: { id: playerBuilding.id },
        data: { constructionEndsAt: new Date(Date.now() + nextLevelCost.constructionSeconds * 1000) },
        include: { buildingType: { include: { levelCosts: true } } },
      });

      return toBuildingStateDto(updated);
    });
  }

  private async ensurePlayerBuildingsExist(playerId: string): Promise<void> {
    const buildingTypes = await this.prisma.buildingType.findMany();
    for (const buildingType of buildingTypes) {
      await this.prisma.playerBuilding.upsert({
        where: { playerId_buildingTypeId: { playerId, buildingTypeId: buildingType.id } },
        update: {},
        create: { playerId, buildingTypeId: buildingType.id, level: 0 },
      });
    }
  }

  private async finalizeCompletedBuildings(playerId: string): Promise<void> {
    // Loops because a queued building may itself have finished while the player was away.
    for (let pass = 0; pass < 3; pass++) {
      const due = await this.prisma.playerBuilding.findMany({
        where: { playerId, constructionEndsAt: { lte: new Date() } },
      });
      let lastEnd: Date | null = null;
      for (const building of due) {
        await this.prisma.playerBuilding.update({
          where: { id: building.id },
          data: { level: building.level + 1, constructionEndsAt: null },
        });
        if (!lastEnd || building.constructionEndsAt! > lastEnd) lastEnd = building.constructionEndsAt;
        // Same key as the minute scan, so it goes out once whichever sees it first.
        void this.push
          .sendOnce(playerId, 'CONSTRUCTION_DONE', `${building.id}:${building.constructionEndsAt!.toISOString()}`)
          .catch(() => undefined);
      }
      if (!(await this.startQueuedBuilding(playerId, lastEnd))) return;
    }
  }

  /**
   * Starts the VIP-queued building once nothing is under construction. It
   * starts when the previous one ended (not when the player came back), so
   * offline time is respected. Returns true if it started.
   */
  private async startQueuedBuilding(playerId: string, previousEnd: Date | null): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      const buildingTypeId = player.buildQueueBuildingTypeId;
      if (!buildingTypeId) return false;
      const busy = await tx.playerBuilding.findFirst({ where: { playerId, constructionEndsAt: { not: null } } });
      if (busy) return false;

      const claimed = await tx.player.updateMany({
        where: { id: playerId, buildQueueBuildingTypeId: buildingTypeId },
        data: { buildQueueBuildingTypeId: null, buildQueueMetal: 0, buildQueueCrystal: 0 },
      });
      if (claimed.count !== 1) return false;

      const building = await tx.playerBuilding.findUniqueOrThrow({ where: { playerId_buildingTypeId: { playerId, buildingTypeId } } });
      const cost = await tx.buildingLevelCost.findUnique({ where: { buildingTypeId_level: { buildingTypeId, level: building.level + 1 } } });
      if (!cost) {
        // Can't happen in normal play (the level was checked when queued) — refund rather than lose it.
        await tx.player.update({
          where: { id: playerId },
          data: { metal: { increment: player.buildQueueMetal }, crystal: { increment: player.buildQueueCrystal } },
        });
        return false;
      }
      const start = previousEnd ?? new Date();
      await tx.playerBuilding.update({
        where: { id: building.id },
        data: { constructionEndsAt: new Date(start.getTime() + cost.constructionSeconds * 1000) },
      });
      return true;
    });
  }

  private loadBuildings(playerId: string): Promise<BuildingWithType[]> {
    return this.prisma.playerBuilding.findMany({
      where: { playerId },
      include: { buildingType: { include: { levelCosts: true } } },
    });
  }
}

function toBuildQueueDto(player: Player, buildings: BuildingWithType[]): BuildQueueDto | null {
  if (!player.buildQueueBuildingTypeId) return null;
  const building = buildings.find((b) => b.buildingTypeId === player.buildQueueBuildingTypeId);
  if (!building) return null;
  return {
    buildingKey: building.buildingType.key,
    targetLevel: building.level + (building.constructionEndsAt ? 2 : 1),
    metalPaid: player.buildQueueMetal,
    crystalPaid: player.buildQueueCrystal,
  };
}

function toResourcesDto(player: Player): ResourcesDto {
  return {
    metal: player.metal,
    crystal: player.crystal,
    credits: player.credits,
  };
}

function toBuildingStateDto(building: BuildingWithType): BuildingStateDto {
  const currentLevelCost = building.buildingType.levelCosts.find((cost) => cost.level === building.level);
  const nextLevelCost = building.buildingType.levelCosts.find((cost) => cost.level === building.level + 1);
  const afterNextLevelCost = building.buildingType.levelCosts.find((cost) => cost.level === building.level + 2);
  return {
    key: building.buildingType.key,
    nameKey: building.buildingType.nameKey,
    iconAssetId: building.buildingType.iconAssetId,
    level: building.level,
    maxLevel: building.buildingType.maxLevel,
    constructionEndsAt: building.constructionEndsAt?.toISOString() ?? null,
    nextLevelCost: nextLevelCost
      ? {
          metalCost: nextLevelCost.metalCost,
          crystalCost: nextLevelCost.crystalCost,
          constructionSeconds: nextLevelCost.constructionSeconds,
        }
      : null,
    afterNextLevelCost: afterNextLevelCost
      ? {
          metalCost: afterNextLevelCost.metalCost,
          crystalCost: afterNextLevelCost.crystalCost,
          constructionSeconds: afterNextLevelCost.constructionSeconds,
        }
      : null,
    currentProduction: toProductionDto(currentLevelCost),
    nextLevelProduction: toProductionDto(nextLevelCost),
    currentCapacityBonus: toBonusDto(building.level, building.buildingType.capacityBonusPerLevel),
    nextLevelCapacityBonus: nextLevelCost ? toBonusDto(building.level + 1, building.buildingType.capacityBonusPerLevel) : null,
    currentMarketSlotBonus: toBonusDto(building.level, building.buildingType.marketSlotBonusPerLevel),
    nextLevelMarketSlotBonus: nextLevelCost ? toBonusDto(building.level + 1, building.buildingType.marketSlotBonusPerLevel) : null,
    currentDefenseBonusPercent: toPercentDto(building.level, building.buildingType.defenseBonusPerLevel),
    nextLevelDefenseBonusPercent: nextLevelCost ? toPercentDto(building.level + 1, building.buildingType.defenseBonusPerLevel) : null,
    currentPvpProtectionMinutes: toBonusDto(building.level, building.buildingType.pvpProtectionMinutesPerLevel),
    nextLevelPvpProtectionMinutes: nextLevelCost ? toBonusDto(building.level + 1, building.buildingType.pvpProtectionMinutesPerLevel) : null,
    currentProtectedResources: toProtectedDto(building.level, building.buildingType),
    nextLevelProtectedResources: nextLevelCost ? toProtectedDto(building.level + 1, building.buildingType) : null,
  };
}

function toProductionDto(levelCost: BuildingLevelCost | undefined): BuildingProductionDto | null {
  if (!levelCost?.producesResourceType || !levelCost.producesPerHour) {
    return null;
  }
  return { resourceType: levelCost.producesResourceType, perHour: levelCost.producesPerHour };
}

function toProtectedDto(level: number, type: BuildingType): ResourcesDto | null {
  if (!type.protectedMetalPerLevel || level <= 0) {
    return null;
  }
  return {
    metal: level * (type.protectedMetalPerLevel ?? 0),
    crystal: level * (type.protectedCrystalPerLevel ?? 0),
    credits: level * (type.protectedCreditsPerLevel ?? 0),
  };
}

function toPercentDto(level: number, fractionPerLevel: number | null): number | null {
  if (!fractionPerLevel || level <= 0) {
    return null;
  }
  return Math.round(level * fractionPerLevel * 1000) / 10;
}

function toBonusDto(level: number, bonusPerLevel: number | null): number | null {
  if (!bonusPerLevel || level <= 0) {
    return null;
  }
  return level * bonusPerLevel;
}
