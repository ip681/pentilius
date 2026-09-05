import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EquipmentSlot, ShipSlotDto } from '@pentilius/shared';
import { PrismaService } from '../prisma/prisma.service';

const ALL_SLOTS: EquipmentSlot[] = ['WEAPON', 'ENGINE', 'HULL', 'SHIELD', 'REACTOR', 'UTILITY'];

@Injectable()
export class ShipService {
  constructor(private readonly prisma: PrismaService) {}

  async getShip(playerId: string): Promise<ShipSlotDto[]> {
    const equipped = await this.prisma.itemInstance.findMany({
      where: { playerId, equippedSlot: { not: null } },
      include: { itemDefinition: true },
    });

    return ALL_SLOTS.map((slot) => {
      const item = equipped.find((instance) => instance.equippedSlot === slot);
      return {
        slot,
        item: item
          ? {
              itemInstanceId: item.id,
              itemDefinitionKey: item.itemDefinition.key,
              nameKey: item.itemDefinition.nameKey,
              iconAssetId: item.itemDefinition.iconAssetId,
              upgradeLevel: item.upgradeLevel,
            }
          : null,
      };
    });
  }

  async equip(playerId: string, itemInstanceId: string): Promise<ShipSlotDto[]> {
    const item = await this.prisma.itemInstance.findUnique({
      where: { id: itemInstanceId },
      include: { itemDefinition: true },
    });
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    if (item.playerId !== playerId) {
      throw new ForbiddenException('Item does not belong to this player');
    }

    await this.prisma.$transaction([
      this.prisma.itemInstance.updateMany({
        where: { playerId, equippedSlot: item.itemDefinition.slot },
        data: { equippedSlot: null },
      }),
      this.prisma.itemInstance.update({
        where: { id: itemInstanceId },
        data: { equippedSlot: item.itemDefinition.slot },
      }),
    ]);

    return this.getShip(playerId);
  }

  async unequip(playerId: string, slot: string): Promise<ShipSlotDto[]> {
    if (!ALL_SLOTS.includes(slot as EquipmentSlot)) {
      throw new BadRequestException('Unknown equipment slot');
    }

    await this.prisma.itemInstance.updateMany({
      where: { playerId, equippedSlot: slot as EquipmentSlot },
      data: { equippedSlot: null },
    });

    return this.getShip(playerId);
  }
}
