import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActiveResearchDto, BaseResponseDto, BuildingProductionDto, BuildingStateDto, BuildQueueDto, ExchangeInfoDto, ResourcesDto, SpecialLevelDto } from '@pentilius/shared';
import { BuildingLevelCost, BuildingType, Player, PlayerBuilding, ResearchBonusType } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { hideoutProtection, marketSlots, productionScaled } from './building-effects';
import { dailyTaskDay } from '../daily-tasks/daily-tasks.service';
import { constructionMs, finalizeDueBuildings } from './building-finalizer';
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

    const [buildings, fresh, activeResearch] = await Promise.all([
      this.loadBuildings(playerId),
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.loadActiveResearch(playerId),
    ]);
    const exchangeBuilding = buildings.find((b) => b.buildingType.key === GAME_BALANCE.buildingKeys.exchange);
    return {
      resources: toResourcesDto(fresh),
      buildings: buildings.map(toBuildingStateDto),
      buildQueue: toBuildQueueDto(fresh, buildings),
      isVip: isVip(fresh),
      exchange: exchangeBuilding && exchangeBuilding.level > 0 ? toExchangeInfo(fresh, exchangeBuilding) : null,
      activeResearch,
    };
  }

  /** The research in progress, for the Research Center tile's timer. */
  private async loadActiveResearch(playerId: string): Promise<ActiveResearchDto | null> {
    const research = await this.prisma.playerResearch.findFirst({
      where: { playerId, researchEndsAt: { gt: new Date() } },
      include: { researchType: { include: { levelCosts: true } } },
    });
    if (!research) return null;
    const level = research.level + 1;
    const cost = research.researchType.levelCosts.find((c) => c.level === level);
    // Same speed-up as when it started; the bar is only a visual aid.
    const speedBonus = (await this.economy.getResearchMultiplier(playerId, ResearchBonusType.RESEARCH_SPEED)) - 1;
    const endsAt = research.researchEndsAt!;
    return {
      nameKey: research.researchType.nameKey,
      level,
      endsAt: endsAt.toISOString(),
      // Exact when the start is known; otherwise estimated from the level's time.
      totalSeconds: research.researchStartedAt
        ? Math.max(1, Math.round((endsAt.getTime() - research.researchStartedAt.getTime()) / 1000))
        : Math.max(1, Math.round((cost?.researchSeconds ?? 1) * (1 - Math.min(0.9, speedBonus)))),
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

      // Construction Technologies research shortens it (owner decision, 2026-10-14).
      const speedBonus = (await this.economy.getResearchMultiplier(playerId, ResearchBonusType.CONSTRUCTION_SPEED, tx)) - 1;
      const updated = await tx.playerBuilding.update({
        where: { id: playerBuilding.id },
        data: { constructionStartedAt: new Date(), constructionEndsAt: new Date(Date.now() + constructionMs(nextLevelCost.constructionSeconds, speedBonus)) },
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

  /**
   * Exchange (owner decision, 2026-10-14): Metal <-> Crystal only (never
   * Credits -> resources, that would be pay-to-win). A small Credits fee,
   * proportional to the amount; a daily limit and the rate grow with the level.
   */
  async exchange(playerId: string, from: 'METAL' | 'CRYSTAL', amount: number): Promise<BaseResponseDto> {
    await this.economy.settleResources(playerId);
    await this.ensurePlayerBuildingsExist(playerId);
    await this.prisma.$transaction(async (tx) => {
      const building = await tx.playerBuilding.findFirst({
        where: { playerId, buildingType: { key: GAME_BALANCE.buildingKeys.exchange } },
        include: { buildingType: true },
      });
      if (!building || building.level < 1) throw new BadRequestException('EXCHANGE_NOT_BUILT');
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      const info = toExchangeInfo(player, building);
      if (info.usedToday + amount > info.dailyLimit) throw new BadRequestException('EXCHANGE_DAILY_LIMIT');
      const fee = exchangeFee(amount);
      const received = exchangeOutput(from, amount, info.rateFactor);
      if (received < 1) throw new BadRequestException('EXCHANGE_AMOUNT_TOO_SMALL');
      const balance = from === 'METAL' ? player.metal : player.crystal;
      if (balance < amount) throw new BadRequestException('Not enough resources');
      if (player.credits < fee) throw new BadRequestException('NOT_ENOUGH_CREDITS');
      const day = dailyTaskDay();
      await tx.player.update({
        where: { id: playerId },
        data: {
          ...(from === 'METAL' ? { metal: { decrement: amount }, crystal: { increment: received } } : { crystal: { decrement: amount }, metal: { increment: received } }),
          credits: { decrement: fee },
          exchangeDay: day,
          exchangeUsedToday: info.usedToday + amount,
        },
      });
    });
    return this.getBase(playerId);
  }

  private finalizeCompletedBuildings(playerId: string): Promise<void> {
    return finalizeDueBuildings({ prisma: this.prisma, economy: this.economy, push: this.push }, playerId, { checkQueue: true });
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

/** What the Exchange allows today — the day is the daily-task day (Europe/Sofia). */
function toExchangeInfo(player: Player, building: PlayerBuilding & { buildingType: BuildingType }): ExchangeInfoDto {
  const config = GAME_BALANCE.exchange;
  return {
    level: building.level,
    dailyLimit: productionScaled(building.level, building.buildingType.exchangeLimitPerLevel),
    usedToday: player.exchangeDay === dailyTaskDay() ? player.exchangeUsedToday : 0,
    rateFactor: Math.min(1, config.baseRateFactor + config.rateFactorPerLevel * building.level),
    metalPerCrystal: config.metalPerCrystal,
    creditsPer100: config.creditsPer100,
  };
}

export function exchangeFee(amount: number): number {
  return Math.ceil((amount * GAME_BALANCE.exchange.creditsPer100) / 100);
}

export function exchangeOutput(from: 'METAL' | 'CRYSTAL', amount: number, rateFactor: number): number {
  const { metalPerCrystal } = GAME_BALANCE.exchange;
  return Math.floor(from === 'METAL' ? (amount / metalPerCrystal) * rateFactor : amount * metalPerCrystal * rateFactor);
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
    constructionStartedAt: building.constructionEndsAt ? (building.constructionStartedAt?.toISOString() ?? null) : null,
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
    currentMarketSlotBonus: orNull(marketSlots(building.level, building.buildingType.marketSlotBonusPerLevel)),
    nextLevelMarketSlotBonus: nextLevelCost ? orNull(marketSlots(building.level + 1, building.buildingType.marketSlotBonusPerLevel)) : null,
    currentDefenseBonusPercent: toPercentDto(building.level, building.buildingType.defenseBonusPerLevel),
    nextLevelDefenseBonusPercent: nextLevelCost ? toPercentDto(building.level + 1, building.buildingType.defenseBonusPerLevel) : null,
    currentPvpProtectionMinutes: toBonusDto(building.level, building.buildingType.pvpProtectionMinutesPerLevel),
    nextLevelPvpProtectionMinutes: nextLevelCost ? toBonusDto(building.level + 1, building.buildingType.pvpProtectionMinutesPerLevel) : null,
    currentProtectedResources: toProtectedDto(building.level, building.buildingType),
    nextLevelProtectedResources: nextLevelCost ? toProtectedDto(building.level + 1, building.buildingType) : null,
    currentResearchCap: toBonusDto(building.level, building.buildingType.researchCapPerLevel),
    nextResearchCap: nextLevelCost ? toBonusDto(building.level + 1, building.buildingType.researchCapPerLevel) : null,
    currentEnergyRegenPercent: toPercentDto(building.level, building.buildingType.energyRegenBonusPerLevel),
    nextEnergyRegenPercent: nextLevelCost ? toPercentDto(building.level + 1, building.buildingType.energyRegenBonusPerLevel) : null,
    currentMaxEnergyBonus: maxEnergyBonus(building.level, building.buildingType.maxEnergyBonusEvery),
    nextMaxEnergyBonus: nextLevelCost ? maxEnergyBonus(building.level + 1, building.buildingType.maxEnergyBonusEvery) : null,
    currentExchangeLimit: orNull(productionScaled(building.level, building.buildingType.exchangeLimitPerLevel)),
    nextExchangeLimit: nextLevelCost ? orNull(productionScaled(building.level + 1, building.buildingType.exchangeLimitPerLevel)) : null,
    specialLevels: buildingSpecialLevels(building),
  };
}

function maxEnergyBonus(level: number, every: number | null): number | null {
  if (!every || level <= 0) return null;
  return Math.floor(level / every);
}

/** Reactor: +1 max energy levels. (Expedition unlocks moved to the Navigation research, 2026-10-14.) */
function buildingSpecialLevels(building: BuildingWithType): SpecialLevelDto[] {
  const every = building.buildingType.maxEnergyBonusEvery;
  if (every) {
    const levels: SpecialLevelDto[] = [];
    for (let level = every; level <= building.buildingType.maxLevel; level += every) {
      levels.push({ level, reached: building.level >= level, kind: 'MAX_ENERGY', nameKey: null });
    }
    return levels;
  }
  return [];
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
  return hideoutProtection(level, type);
}

function orNull(value: number): number | null {
  return value > 0 ? value : null;
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
