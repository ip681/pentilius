import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LootResultEntryDto, PvpBattleReportDto, PvpStatusDto, ResourceType } from '@pentilius/shared';
import { Player, Prisma, PvpBattleReport } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { CombatService } from '../pve/combat.service';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

const STEALABLE_RESOURCES: Extract<ResourceType, 'METAL' | 'CRYSTAL' | 'CREDITS'>[] = ['METAL', 'CRYSTAL', 'CREDITS'];
const RESOURCE_FIELD: Record<'METAL' | 'CRYSTAL' | 'CREDITS', 'metal' | 'crystal' | 'credits'> = {
  METAL: 'metal',
  CRYSTAL: 'crystal',
  CREDITS: 'credits',
};

/**
 * PvP (instructions/GAME_SYSTEMS.md, LOCKED direction). No world-map
 * coordinates; targeting here is "random suitable opponent" — clan-filtered
 * targeting waits for Milestone 4. Exact power range, cooldowns, defender
 * losses, protected resources and ranking are UNDEFINED
 * (instructions/OPEN_DECISIONS.md) — see schema.prisma's comment on
 * PvpBattleReport for the placeholders this M3 foundation uses. Level-5 gate
 * on both attacker and defender is owner-specified, not a placeholder.
 */
@Injectable()
export class PvpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly combat: CombatService,
  ) {}

  async getStatus(playerId: string): Promise<PvpStatusDto> {
    const player = await this.economy.settleAll(playerId);
    return {
      unlocked: player.level >= GAME_BALANCE.pvp.minLevel,
      minLevel: GAME_BALANCE.pvp.minLevel,
      attackCostEnergy: GAME_BALANCE.pvp.attackCostEnergy,
    };
  }

  async attackRandomOpponent(attackerId: string): Promise<PvpBattleReportDto> {
    const attacker = await this.economy.settleAll(attackerId);
    if (attacker.level < GAME_BALANCE.pvp.minLevel) {
      throw new ForbiddenException('PvP is not unlocked yet');
    }
    if (attacker.actionEnergy < GAME_BALANCE.pvp.attackCostEnergy) {
      throw new BadRequestException('Not enough Action Energy');
    }

    return this.prisma.$transaction(async (tx) => {
      const defender = await this.pickRandomOpponent(attackerId, tx);
      if (!defender) {
        throw new NotFoundException('No opponents available right now');
      }
      await this.economy.settleResources(defender.id, tx);
      const settledDefender = await tx.player.findUniqueOrThrow({ where: { id: defender.id } });

      await tx.player.update({
        where: { id: attackerId },
        data: { actionEnergy: { decrement: GAME_BALANCE.pvp.attackCostEnergy } },
      });

      const [attackerStats, defenderStats] = await Promise.all([
        this.combat.computePlayerStats(attackerId, tx),
        this.combat.computePlayerStats(defender.id, tx),
      ]);

      const result = this.combat.simulate(attackerStats, {
        attack: defenderStats.attack,
        defense: defenderStats.defense,
        maxHp: Math.round(defenderStats.hp),
      });

      const lootSummary: LootResultEntryDto[] = [];

      if (result.won) {
        for (const resourceType of STEALABLE_RESOURCES) {
          const field = RESOURCE_FIELD[resourceType];
          const quantity = Math.floor(settledDefender[field] * GAME_BALANCE.pvp.resourceStealPercentage);
          if (quantity <= 0) continue;

          await tx.player.update({ where: { id: attackerId }, data: { [field]: { increment: quantity } } });
          await tx.player.update({ where: { id: defender.id }, data: { [field]: { decrement: quantity } } });
          lootSummary.push({ type: 'resource', resourceType, quantity });
        }

        await tx.player.update({
          where: { id: defender.id },
          data: { pvpProtectedUntil: new Date(Date.now() + GAME_BALANCE.pvp.revengeProtectionMinutes * 60_000) },
        });
      }

      const report = await tx.pvpBattleReport.create({
        data: {
          attackerId,
          defenderId: defender.id,
          outcome: result.won ? 'WIN' : 'LOSS',
          rounds: result.rounds as unknown as Prisma.InputJsonValue,
          attackerMaxHp: result.playerMaxHp,
          defenderMaxHp: result.pentiliMaxHp,
          damageDealt: result.damageDealt,
          damageTaken: result.damageTaken,
          lootSummary: lootSummary as unknown as Prisma.InputJsonValue,
        },
      });

      return toReportDto(report, 'attacker', defender, lootSummary, result.rounds);
    });
  }

  async getReports(playerId: string): Promise<PvpBattleReportDto[]> {
    const reports = await this.prisma.pvpBattleReport.findMany({
      where: { OR: [{ attackerId: playerId }, { defenderId: playerId }] },
      include: { attacker: true, defender: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return reports.map((report) => {
      const role = report.attackerId === playerId ? 'attacker' : 'defender';
      const opponent = role === 'attacker' ? report.defender : report.attacker;
      return toReportDto(
        report,
        role,
        opponent,
        report.lootSummary as unknown as LootResultEntryDto[],
        report.rounds as unknown as PvpBattleReportDto['rounds'],
      );
    });
  }

  private async pickRandomOpponent(attackerId: string, tx: Tx): Promise<Player | null> {
    const cooldownCutoff = new Date(Date.now() - GAME_BALANCE.pvp.attackCooldownMinutes * 60_000);
    const [candidates, recentlyAttacked] = await Promise.all([
      tx.player.findMany({
        where: {
          id: { not: attackerId },
          level: { gte: GAME_BALANCE.pvp.minLevel },
          OR: [{ pvpProtectedUntil: null }, { pvpProtectedUntil: { lte: new Date() } }],
        },
      }),
      tx.pvpBattleReport.findMany({
        where: { attackerId, createdAt: { gte: cooldownCutoff } },
        select: { defenderId: true },
      }),
    ]);

    const recentSet = new Set(recentlyAttacked.map((r) => r.defenderId));
    const eligible = candidates.filter((candidate) => !recentSet.has(candidate.id));
    if (eligible.length === 0) {
      return null;
    }
    return eligible[Math.floor(Math.random() * eligible.length)];
  }
}

function toReportDto(
  report: PvpBattleReport,
  role: 'attacker' | 'defender',
  opponent: Player,
  lootSummary: LootResultEntryDto[],
  rounds: PvpBattleReportDto['rounds'],
): PvpBattleReportDto {
  return {
    id: report.id,
    role,
    opponentUsername: opponent.username,
    opponentRace: opponent.race,
    outcome: report.outcome,
    rounds,
    attackerMaxHp: report.attackerMaxHp,
    defenderMaxHp: report.defenderMaxHp,
    damageDealt: report.damageDealt,
    damageTaken: report.damageTaken,
    lootSummary,
    createdAt: report.createdAt.toISOString(),
  };
}
