import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryItemDto } from '@pentilius/shared';
import { GAME_BALANCE } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getInventory(playerId: string): Promise<InventoryItemDto[]> {
    const items = await this.prisma.itemInstance.findMany({
      where: { playerId },
      include: { itemDefinition: true },
      orderBy: { acquiredAt: 'asc' },
    });

    return items.map((item) => ({
      id: item.id,
      itemDefinitionKey: item.itemDefinition.key,
      nameKey: item.itemDefinition.nameKey,
      slot: item.itemDefinition.slot,
      iconAssetId: item.itemDefinition.iconAssetId,
      upgradeLevel: item.upgradeLevel,
      maxUpgradeLevel: item.itemDefinition.maxUpgradeLevel,
      equipped: item.equippedSlot !== null,
    }));
  }

  async upgradeItem(playerId: string, itemInstanceId: string): Promise<InventoryItemDto> {
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
      if (item.upgradeLevel >= item.itemDefinition.maxUpgradeLevel) {
        throw new BadRequestException('Item is already at max upgrade level');
      }

      const cost = GAME_BALANCE.itemUpgrade.stonesPerLevel * (item.upgradeLevel + 1);
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      if (player.upgradeStones < cost) {
        throw new BadRequestException('Not enough upgrade stones');
      }

      await tx.player.update({ where: { id: playerId }, data: { upgradeStones: { decrement: cost } } });
      const updated = await tx.itemInstance.update({
        where: { id: itemInstanceId },
        data: { upgradeLevel: { increment: 1 } },
        include: { itemDefinition: true },
      });

      return {
        id: updated.id,
        itemDefinitionKey: updated.itemDefinition.key,
        nameKey: updated.itemDefinition.nameKey,
        slot: updated.itemDefinition.slot,
        iconAssetId: updated.itemDefinition.iconAssetId,
        upgradeLevel: updated.upgradeLevel,
        maxUpgradeLevel: updated.itemDefinition.maxUpgradeLevel,
        equipped: updated.equippedSlot !== null,
      };
    });
  }
}
