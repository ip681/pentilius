import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BattleReportDto, CombatRoundDto, LootResultEntryDto, ResourceType } from '@pentilius/shared';
import { Prisma } from '@prisma/client';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';
import { CombatService } from './combat.service';

const RESOURCE_FIELD: Record<ResourceType, 'metal' | 'crystal' | 'oxygen' | 'credits' | 'upgradeStones'> = {
  METAL: 'metal',
  CRYSTAL: 'crystal',
  OXYGEN: 'oxygen',
  CREDITS: 'credits',
  UPGRADE_STONES: 'upgradeStones',
};

@Injectable()
export class PveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly combat: CombatService,
  ) {}

  async attack(playerId: string, pentiliId: string): Promise<BattleReportDto> {
    return this.prisma.$transaction(async (tx) => {
      const pentili = await tx.pentili.findUnique({ where: { id: pentiliId }, include: { zone: true, lootDrops: true } });
      if (!pentili) {
        throw new NotFoundException('Pentili not found');
      }

      let player = await this.economy.settleAll(playerId, tx);
      if (player.level < pentili.zone.unlockLevel) {
        throw new ForbiddenException('Zone is locked');
      }
      if (player.actionEnergy < 1) {
        throw new BadRequestException('Not enough Action Energy');
      }

      player = await tx.player.update({ where: { id: playerId }, data: { actionEnergy: { decrement: 1 } } });

      const playerStats = await this.combat.computePlayerStats(playerId, tx);
      const result = this.combat.simulate(playerStats, pentili);

      let xpGained = 0;
      let leveledUp = false;
      const lootSummary: LootResultEntryDto[] = [];

      if (result.won) {
        xpGained = pentili.xpReward;
        const applied = await this.economy.applyXp(playerId, xpGained, tx);
        leveledUp = applied.leveledUp;
        player = applied.player;

        for (const drop of pentili.lootDrops) {
          if (Math.random() > drop.dropChance) {
            continue;
          }
          const quantity = randomInt(drop.minQuantity, drop.maxQuantity);

          if (drop.resourceType) {
            const field = RESOURCE_FIELD[drop.resourceType as ResourceType];
            await tx.player.update({ where: { id: playerId }, data: { [field]: { increment: quantity } } });
            lootSummary.push({ type: 'resource', resourceType: drop.resourceType as ResourceType, quantity });
          } else if (drop.itemDefinitionId) {
            const itemDefinition = await tx.itemDefinition.findUniqueOrThrow({ where: { id: drop.itemDefinitionId } });
            for (let i = 0; i < quantity; i += 1) {
              await tx.itemInstance.create({ data: { playerId, itemDefinitionId: itemDefinition.id } });
            }
            lootSummary.push({
              type: 'item',
              itemDefinitionKey: itemDefinition.key,
              itemNameKey: itemDefinition.nameKey,
              quantity,
            });
          }
        }
      }

      const report = await tx.battleReport.create({
        data: {
          playerId,
          pentiliId: pentili.id,
          zoneId: pentili.zoneId,
          outcome: result.won ? 'WIN' : 'LOSS',
          xpGained,
          lootSummary: lootSummary as unknown as Prisma.InputJsonValue,
          damageDealt: result.damageDealt,
          damageTaken: result.damageTaken,
          rounds: result.rounds as unknown as Prisma.InputJsonValue,
          playerMaxHp: result.playerMaxHp,
          pentiliMaxHp: result.pentiliMaxHp,
        },
      });

      return toBattleReportDto(report, pentili, pentili.zone, player.level, leveledUp, lootSummary, result.rounds);
    });
  }

  async getReports(playerId: string): Promise<BattleReportDto[]> {
    const reports = await this.prisma.battleReport.findMany({
      where: { playerId },
      include: { pentili: true, zone: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return reports.map((report) =>
      toBattleReportDto(
        report,
        report.pentili,
        report.zone,
        0,
        false,
        report.lootSummary as unknown as LootResultEntryDto[],
        report.rounds as unknown as CombatRoundDto[],
      ),
    );
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toBattleReportDto(
  report: {
    id: string;
    outcome: string;
    xpGained: number;
    damageDealt: number;
    damageTaken: number;
    playerMaxHp: number;
    pentiliMaxHp: number;
    createdAt: Date;
  },
  pentili: { key: string; nameKey: string },
  zone: { key: string },
  playerLevel: number,
  leveledUp: boolean,
  lootSummary: LootResultEntryDto[],
  rounds: CombatRoundDto[],
): BattleReportDto {
  return {
    id: report.id,
    pentiliKey: pentili.key,
    pentiliNameKey: pentili.nameKey,
    zoneKey: zone.key,
    outcome: report.outcome as 'WIN' | 'LOSS',
    xpGained: report.xpGained,
    lootSummary,
    damageDealt: report.damageDealt,
    damageTaken: report.damageTaken,
    rounds,
    playerMaxHp: report.playerMaxHp,
    pentiliMaxHp: report.pentiliMaxHp,
    createdAt: report.createdAt.toISOString(),
    playerLevel,
    leveledUp,
  };
}
