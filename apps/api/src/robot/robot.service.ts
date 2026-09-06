import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CombatStatsDto, EquipmentSlot, RobotAttributesDto, RobotSlotDto } from '@pentilius/shared';
import { attributeCostForRank, GAME_BALANCE } from '../config/game-config';
import { CombatService, toStatsDto } from '../pve/combat.service';
import { PrismaService } from '../prisma/prisma.service';

const ALL_SLOTS: EquipmentSlot[] = ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'ARMOR', 'CORE', 'LEFT_LEG', 'RIGHT_LEG'];

const ATTRIBUTE_FIELD = {
  damage: 'baseDamage',
  defense: 'baseDefense',
  hp: 'baseHp',
  evasion: 'baseEvasion',
} as const;

type AttributeStat = keyof typeof ATTRIBUTE_FIELD;

// Rank at which baseEvasion * evasionPointValue reaches maxEvasionPercent (currently 40).
const EVASION_MAX_RANK = GAME_BALANCE.robotAttributes.maxEvasionPercent / GAME_BALANCE.robotAttributes.evasionPointValue;

@Injectable()
export class RobotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly combat: CombatService,
  ) {}

  /** Final computed combat stats (equipment + Core Attribute points + research/clan bonuses) — same numbers PvP's scout shows. */
  async getCombatStats(playerId: string): Promise<CombatStatsDto> {
    return toStatsDto(await this.combat.computePlayerStats(playerId));
  }

  async getRobot(playerId: string): Promise<RobotSlotDto[]> {
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

  async equip(playerId: string, itemInstanceId: string): Promise<RobotSlotDto[]> {
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
    if (!item.itemDefinition.slot) {
      throw new BadRequestException('This item cannot be equipped');
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

    return this.getRobot(playerId);
  }

  async unequip(playerId: string, slot: string): Promise<RobotSlotDto[]> {
    if (!ALL_SLOTS.includes(slot as EquipmentSlot)) {
      throw new BadRequestException('Unknown equipment slot');
    }

    await this.prisma.itemInstance.updateMany({
      where: { playerId, equippedSlot: slot as EquipmentSlot },
      data: { equippedSlot: null },
    });

    return this.getRobot(playerId);
  }

  async getAttributes(playerId: string): Promise<RobotAttributesDto> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    return this.toAttributesDto(player);
  }

  async allocateAttribute(playerId: string, stat: AttributeStat): Promise<RobotAttributesDto> {
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      const field = ATTRIBUTE_FIELD[stat];
      const currentRank = player[field];
      if (stat === 'evasion' && currentRank >= EVASION_MAX_RANK) {
        throw new BadRequestException('ATTRIBUTE_AT_CAP');
      }
      const cost = attributeCostForRank(currentRank);
      if (player.attributePointsAvailable < cost) {
        throw new BadRequestException('Not enough attribute points');
      }

      const updated = await tx.player.update({
        where: { id: playerId },
        data: {
          attributePointsAvailable: { decrement: cost },
          [field]: { increment: 1 },
        },
      });

      return this.toAttributesDto(updated);
    });
  }

  private toAttributesDto(player: {
    attributePointsAvailable: number;
    baseDamage: number;
    baseDefense: number;
    baseHp: number;
    baseEvasion: number;
  }): RobotAttributesDto {
    return {
      available: player.attributePointsAvailable,
      base: {
        damage: player.baseDamage,
        defense: player.baseDefense,
        hp: player.baseHp,
        evasion: player.baseEvasion,
      },
      nextCost: {
        damage: attributeCostForRank(player.baseDamage),
        defense: attributeCostForRank(player.baseDefense),
        hp: attributeCostForRank(player.baseHp),
        evasion: attributeCostForRank(player.baseEvasion),
      },
      evasionAtCap: player.baseEvasion >= EVASION_MAX_RANK,
    };
  }
}
