import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryItemDto, InventoryResponseDto, ItemStatsDto, SellValueDto, UpgradeCostDto } from '@pentilius/shared';
import { ItemQuality, ItemTier, Prisma } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { getEffectiveInventoryCapacity, getUsedInventorySlots } from './inventory-capacity';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  async getInventory(playerId: string, tx: Tx = this.prisma): Promise<InventoryResponseDto> {
    const [items, used, capacity] = await Promise.all([
      tx.itemInstance.findMany({
        where: { playerId },
        include: { itemDefinition: true },
        orderBy: { acquiredAt: 'asc' },
      }),
      getUsedInventorySlots(playerId, tx),
      getEffectiveInventoryCapacity(playerId, tx),
    ]);

    return { items: items.map(toInventoryItemDto), capacity, used };
  }

  async upgradeItem(playerId: string, itemInstanceId: string): Promise<InventoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.itemInstance.findUnique({
        where: { id: itemInstanceId },
        include: { itemDefinition: true },
      });
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      if (item.playerId !== playerId) {
        throw new ForbiddenException('Item does not belong to this player');
      }
      if (item.itemDefinition.category !== 'EQUIPMENT') {
        throw new BadRequestException('ITEM_NOT_EQUIPMENT');
      }
      if (item.upgradeLevel >= item.itemDefinition.maxUpgradeLevel) {
        throw new BadRequestException('Item is already at max upgrade level');
      }

      // Each set has its own upgrade material (e.g. Coreforged gear needs coreforged_upgrade).
      const tier = item.itemDefinition.tier!;
      const materialKey = `${tier.toLowerCase()}_upgrade`;
      const cost = GAME_BALANCE.itemUpgrade.materialsPerLevel * (item.upgradeLevel + 1);

      const material = await tx.itemDefinition.findUniqueOrThrow({ where: { key: materialKey } });
      const materialStack = await tx.itemInstance.findFirst({
        where: { playerId, itemDefinitionId: material.id, equippedSlot: null },
      });
      if (!materialStack || materialStack.quantity < cost) {
        throw new BadRequestException('NOT_ENOUGH_MATERIALS');
      }

      if (materialStack.quantity === cost) {
        await tx.itemInstance.delete({ where: { id: materialStack.id } });
      } else {
        await tx.itemInstance.update({ where: { id: materialStack.id }, data: { quantity: { decrement: cost } } });
      }
      await tx.itemInstance.update({ where: { id: itemInstanceId }, data: { upgradeLevel: { increment: 1 } } });

      return this.getInventory(playerId, tx);
    });
  }

  async sellItem(playerId: string, itemInstanceId: string): Promise<InventoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.itemInstance.findUnique({
        where: { id: itemInstanceId },
        include: { itemDefinition: true },
      });
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      if (item.playerId !== playerId) {
        throw new ForbiddenException('Item does not belong to this player');
      }
      if (item.itemDefinition.category !== 'EQUIPMENT') {
        throw new BadRequestException('ITEM_NOT_SELLABLE');
      }
      if (item.equippedSlot !== null) {
        throw new BadRequestException('ITEM_EQUIPPED');
      }

      const { metal, crystal } = computeSellValue(item.itemDefinition.tier!, item.quality);
      await tx.player.update({ where: { id: playerId }, data: { metal: { increment: metal }, crystal: { increment: crystal } } });
      await tx.itemInstance.delete({ where: { id: itemInstanceId } });

      return this.getInventory(playerId, tx);
    });
  }

  async useConsumable(playerId: string, itemInstanceId: string, buildingKey?: string): Promise<InventoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.itemInstance.findUnique({
        where: { id: itemInstanceId },
        include: { itemDefinition: true },
      });
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      if (item.playerId !== playerId) {
        throw new ForbiddenException('Item does not belong to this player');
      }
      if (item.itemDefinition.category !== 'CONSUMABLE') {
        throw new BadRequestException('ITEM_NOT_USABLE');
      }

      const baseStats = item.itemDefinition.baseStats as { energy?: number; buildTimeReductionMinutes?: number };

      const energyGain = baseStats.energy ?? 0;
      if (energyGain > 0) {
        const player = await this.economy.settleEnergy(playerId, tx);
        await tx.player.update({
          where: { id: playerId },
          data: { actionEnergy: Math.min(player.actionEnergyMax, player.actionEnergy + energyGain) },
        });
      }

      const buildTimeReductionMinutes = baseStats.buildTimeReductionMinutes ?? 0;
      if (buildTimeReductionMinutes > 0) {
        if (!buildingKey) {
          throw new BadRequestException('BUILDING_KEY_REQUIRED');
        }
        const buildingType = await tx.buildingType.findUnique({ where: { key: buildingKey } });
        if (!buildingType) {
          throw new NotFoundException('Unknown building');
        }
        const playerBuilding = await tx.playerBuilding.findUniqueOrThrow({
          where: { playerId_buildingTypeId: { playerId, buildingTypeId: buildingType.id } },
        });
        if (!playerBuilding.constructionEndsAt) {
          throw new BadRequestException('BUILDING_NOT_UNDER_CONSTRUCTION');
        }
        await tx.playerBuilding.update({
          where: { id: playerBuilding.id },
          data: { constructionEndsAt: new Date(playerBuilding.constructionEndsAt.getTime() - buildTimeReductionMinutes * 60_000) },
        });
      }

      if (item.quantity <= 1) {
        await tx.itemInstance.delete({ where: { id: itemInstanceId } });
      } else {
        await tx.itemInstance.update({ where: { id: itemInstanceId }, data: { quantity: { decrement: 1 } } });
      }

      return this.getInventory(playerId, tx);
    });
  }
}

function toInventoryItemDto(item: Prisma.ItemInstanceGetPayload<{ include: { itemDefinition: true } }>): InventoryItemDto {
  const isEquipment = item.itemDefinition.category === 'EQUIPMENT';
  const baseStats = item.itemDefinition.baseStats as { attack?: number; defense?: number; hp?: number };
  const atMaxLevel = item.upgradeLevel >= item.itemDefinition.maxUpgradeLevel;

  return {
    id: item.id,
    itemDefinitionKey: item.itemDefinition.key,
    nameKey: item.itemDefinition.nameKey,
    descriptionKey: item.itemDefinition.descriptionKey,
    category: item.itemDefinition.category,
    slot: item.itemDefinition.slot,
    tier: item.itemDefinition.tier,
    iconAssetId: item.itemDefinition.iconAssetId,
    upgradeLevel: item.upgradeLevel,
    maxUpgradeLevel: item.itemDefinition.maxUpgradeLevel,
    quantity: item.quantity,
    equipped: item.equippedSlot !== null,
    quality: item.quality,
    rolledOptions: item.rolledOptions,
    race: item.race,
    currentStats: isEquipment ? computeItemStats(baseStats, item.upgradeLevel) : null,
    nextLevelStats: isEquipment && !atMaxLevel ? computeItemStats(baseStats, item.upgradeLevel + 1) : null,
    upgradeCost: isEquipment && !atMaxLevel && item.itemDefinition.tier ? computeUpgradeCost(item.itemDefinition.tier, item.upgradeLevel) : null,
    sellValue: isEquipment && item.itemDefinition.tier ? computeSellValue(item.itemDefinition.tier, item.quality) : null,
  };
}

/** This item's own effective attack/defense/hp contribution at the given upgrade level. */
function computeItemStats(baseStats: { attack?: number; defense?: number; hp?: number }, upgradeLevel: number): ItemStatsDto {
  const multiplier = 1 + upgradeLevel * GAME_BALANCE.combat.bonusPerUpgradeLevel;
  const stats: ItemStatsDto = {};
  if (baseStats.attack) stats.attack = roundToOneDecimal(baseStats.attack * multiplier);
  if (baseStats.defense) stats.defense = roundToOneDecimal(baseStats.defense * multiplier);
  if (baseStats.hp) stats.hp = roundToOneDecimal(baseStats.hp * multiplier);
  return stats;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Mirrors inventory.service.ts's upgradeItem() cost formula, for display before the player commits. */
function computeUpgradeCost(tier: string, upgradeLevel: number): UpgradeCostDto {
  return {
    itemDefinitionKey: `${tier.toLowerCase()}_upgrade`,
    quantity: GAME_BALANCE.itemUpgrade.materialsPerLevel * (upgradeLevel + 1),
  };
}

/** Mirrors inventory.service.ts's sellItem() payout formula, for display before the player commits. */
function computeSellValue(tier: ItemTier, quality: ItemQuality): SellValueDto {
  const { baseMetalByTier, baseCrystalByTier, qualityMultiplier } = GAME_BALANCE.itemSell;
  const multiplier = qualityMultiplier[quality];
  return {
    metal: Math.round(baseMetalByTier[tier] * multiplier),
    crystal: Math.round(baseCrystalByTier[tier] * multiplier),
  };
}
