import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PentiliDto, ZoneDto } from '@pentilius/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async getZones(playerId: string): Promise<ZoneDto[]> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const zones = await this.prisma.zone.findMany({
      orderBy: { order: 'asc' },
      include: { pentili: { select: { nameKey: true, iconAssetId: true } } },
    });

    return zones.map((zone) => ({
      id: zone.id,
      key: zone.key,
      nameKey: zone.nameKey,
      order: zone.order,
      unlockLevel: zone.unlockLevel,
      unlocked: player.level >= zone.unlockLevel,
      iconAssetId: zone.iconAssetId,
      pentiliPreview: zone.pentili,
    }));
  }

  async getPentiliInZone(playerId: string, zoneId: string): Promise<PentiliDto[]> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const zone = await this.prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }
    if (player.level < zone.unlockLevel) {
      throw new ForbiddenException('Zone is locked');
    }

    const pentili = await this.prisma.pentili.findMany({
      where: { zoneId },
      include: { lootDrops: { include: { itemDefinition: true } } },
    });
    return pentili.map((entry) => ({
      id: entry.id,
      key: entry.key,
      nameKey: entry.nameKey,
      level: entry.level,
      maxHp: entry.maxHp,
      attack: entry.attack,
      defense: entry.defense,
      xpReward: entry.xpReward,
      iconAssetId: entry.iconAssetId,
      lootDrops: entry.lootDrops.map((drop) => ({
        type: (drop.itemDefinitionId ? 'item' : 'resource') as 'resource' | 'item',
        resourceType: drop.resourceType ?? undefined,
        itemNameKey: drop.itemDefinition?.nameKey,
        dropChance: drop.dropChance,
        minQuantity: drop.minQuantity,
        maxQuantity: drop.maxQuantity,
      })),
    }));
  }
}
