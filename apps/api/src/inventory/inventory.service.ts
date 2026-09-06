import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryItemDto, InventoryResponseDto } from '@pentilius/shared';
import { Prisma } from '@prisma/client';
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

      const cost = GAME_BALANCE.itemUpgrade.stonesPerLevel * (item.upgradeLevel + 1);
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      if (player.upgradeStones < cost) {
        throw new BadRequestException('Not enough upgrade stones');
      }

      await tx.player.update({ where: { id: playerId }, data: { upgradeStones: { decrement: cost } } });
      await tx.itemInstance.update({ where: { id: itemInstanceId }, data: { upgradeLevel: { increment: 1 } } });

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
  return {
    id: item.id,
    itemDefinitionKey: item.itemDefinition.key,
    nameKey: item.itemDefinition.nameKey,
    descriptionKey: item.itemDefinition.descriptionKey,
    category: item.itemDefinition.category,
    slot: item.itemDefinition.slot,
    iconAssetId: item.itemDefinition.iconAssetId,
    upgradeLevel: item.upgradeLevel,
    maxUpgradeLevel: item.itemDefinition.maxUpgradeLevel,
    quantity: item.quantity,
    equipped: item.equippedSlot !== null,
  };
}
