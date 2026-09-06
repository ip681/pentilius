import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseResponseDto, BuildingProductionDto, BuildingStateDto, ResourcesDto } from '@pentilius/shared';
import { BuildingLevelCost, BuildingType, Player, PlayerBuilding } from '@prisma/client';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

type BuildingWithType = PlayerBuilding & { buildingType: BuildingType & { levelCosts: BuildingLevelCost[] } };

@Injectable()
export class BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  async getBase(playerId: string): Promise<BaseResponseDto> {
    const player = await this.economy.settleResources(playerId);
    await this.ensurePlayerBuildingsExist(playerId);
    await this.finalizeCompletedBuildings(playerId);

    const buildings = await this.loadBuildings(playerId);
    return { resources: toResourcesDto(player), buildings: buildings.map(toBuildingStateDto) };
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
    const due = await this.prisma.playerBuilding.findMany({
      where: { playerId, constructionEndsAt: { lte: new Date() } },
    });
    for (const building of due) {
      await this.prisma.playerBuilding.update({
        where: { id: building.id },
        data: { level: building.level + 1, constructionEndsAt: null },
      });
    }
  }

  private loadBuildings(playerId: string): Promise<BuildingWithType[]> {
    return this.prisma.playerBuilding.findMany({
      where: { playerId },
      include: { buildingType: { include: { levelCosts: true } } },
    });
  }
}

function toResourcesDto(player: Player): ResourcesDto {
  return {
    metal: player.metal,
    crystal: player.crystal,
    oxygen: player.oxygen,
    credits: player.credits,
    upgradeStones: player.upgradeStones,
  };
}

function toBuildingStateDto(building: BuildingWithType): BuildingStateDto {
  const currentLevelCost = building.buildingType.levelCosts.find((cost) => cost.level === building.level);
  const nextLevelCost = building.buildingType.levelCosts.find((cost) => cost.level === building.level + 1);
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
    currentProduction: toProductionDto(currentLevelCost),
    nextLevelProduction: toProductionDto(nextLevelCost),
    currentCapacityBonus: toCapacityBonusDto(building.level, building.buildingType.capacityBonusPerLevel),
    nextLevelCapacityBonus: nextLevelCost ? toCapacityBonusDto(building.level + 1, building.buildingType.capacityBonusPerLevel) : null,
  };
}

function toProductionDto(levelCost: BuildingLevelCost | undefined): BuildingProductionDto | null {
  if (!levelCost?.producesResourceType || !levelCost.producesPerHour) {
    return null;
  }
  return { resourceType: levelCost.producesResourceType, perHour: levelCost.producesPerHour };
}

function toCapacityBonusDto(level: number, capacityBonusPerLevel: number | null): number | null {
  if (!capacityBonusPerLevel || level <= 0) {
    return null;
  }
  return level * capacityBonusPerLevel;
}
