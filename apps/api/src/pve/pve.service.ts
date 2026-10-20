import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BattleReportDto, CombatRoundDto, LootResultEntryDto, MultiAttackResultDto, ResourceType } from '@pentilius/shared';
import { GAME_BALANCE } from '../config/game-config';
import { isVip } from '../vip/vip';
import { Prisma } from '@prisma/client';
import { assertNoActiveExpedition } from '../expeditions/expedition-guard';
import { grantItem } from '../inventory/inventory-capacity';
import { EconomyService } from '../player/economy.service';
import { AchievementsService } from '../achievements/achievements.service';
import { DailyTasksService } from '../daily-tasks/daily-tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CombatService } from './combat.service';

const RESOURCE_FIELD: Record<ResourceType, 'metal' | 'crystal' | 'credits'> = {
  METAL: 'metal',
  CRYSTAL: 'crystal',
  CREDITS: 'credits',
};

@Injectable()
export class PveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly combat: CombatService,
    private readonly dailyTasks: DailyTasksService,
    private readonly achievements: AchievementsService,
  ) {}

  /**
   * VIP "Attack xN" (owner decision, 2026-10-13): up to N ordinary battles in
   * one click — same energy, odds and rewards as N single attacks. N shrinks
   * to the energy available, and the series stops at the first loss.
   */
  async attackMultiple(playerId: string, pentiliId: string): Promise<MultiAttackResultDto> {
    const player = await this.economy.settleAll(playerId);
    if (!isVip(player)) {
      throw new ForbiddenException('VIP_REQUIRED');
    }
    const count = Math.min(GAME_BALANCE.vip.multiAttackCount, player.actionEnergy);
    if (count < 2) {
      throw new BadRequestException('Not enough Action Energy');
    }
    const reports: BattleReportDto[] = [];
    for (let i = 0; i < count; i++) {
      try {
        reports.push(await this.attack(playerId, pentiliId));
      } catch (error) {
        // The first battle reports its error as usual; a later failure just ends the series.
        if (reports.length === 0) throw error;
        break;
      }
      if (reports[reports.length - 1].outcome !== 'WIN') break;
    }
    return { reports };
  }

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
      await assertNoActiveExpedition(playerId, tx);

      player = await this.economy.spendEnergy(playerId, 1, player, tx);

      const playerStats = await this.combat.computePlayerStats(playerId, tx);
      const result = this.combat.simulate(playerStats, pentili);

      let xpGained = 0;
      let leveledUp = false;
      const lootSummary: LootResultEntryDto[] = [];
      const lostLoot: LootResultEntryDto[] = [];

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
            let granted = 0;
            for (let i = 0; i < quantity; i += 1) {
              if (await grantItem(playerId, itemDefinition.id, tx)) {
                granted += 1;
              }
            }
            const entry = { type: 'item' as const, itemDefinitionKey: itemDefinition.key, itemNameKey: itemDefinition.nameKey, itemIconAssetId: itemDefinition.iconAssetId };
            if (granted > 0) lootSummary.push({ ...entry, quantity: granted });
            if (granted < quantity) lostLoot.push({ ...entry, quantity: quantity - granted });
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
          lostLoot: lostLoot as unknown as Prisma.InputJsonValue,
          damageDealt: result.damageDealt,
          damageTaken: result.damageTaken,
          rounds: result.rounds as unknown as Prisma.InputJsonValue,
          playerMaxHp: result.playerMaxHp,
          pentiliMaxHp: result.pentiliMaxHp,
        },
      });

      await this.dailyTasks.record(playerId, 'PVE_BATTLE', 1, tx);
      if (result.won) await this.achievements.record(playerId, 'PVE_WIN', 1, tx);
      return toBattleReportDto(report, pentili, pentili.zone, player.level, leveledUp, lootSummary, lostLoot, result.rounds);
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
        (report.lostLoot as unknown as LootResultEntryDto[] | null) ?? [],
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
  lostLoot: LootResultEntryDto[],
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
    lostLoot,
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
