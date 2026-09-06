import { Injectable } from '@nestjs/common';
import { CombatReportDto, LootResultEntryDto } from '@pentilius/shared';
import { PrismaService } from '../prisma/prisma.service';

const TAKE_PER_SOURCE = 50;

/**
 * Unified combat history across PvE/PvP/Boss Hunts (GET /reports). Plain
 * read-only aggregator — queries Prisma directly rather than depending on
 * PveService/PvpService/BossService, matching how base.service.ts/research.service.ts
 * already keep their own small local mapping functions instead of cross-importing.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReports(playerId: string): Promise<CombatReportDto[]> {
    const [pve, pvp, boss] = await Promise.all([
      this.getPveReports(playerId),
      this.getPvpReports(playerId),
      this.getBossReports(playerId),
    ]);

    return [...pve, ...pvp, ...boss].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, TAKE_PER_SOURCE);
  }

  private async getPveReports(playerId: string): Promise<CombatReportDto[]> {
    const reports = await this.prisma.battleReport.findMany({
      where: { playerId },
      include: { pentili: true, zone: true },
      orderBy: { createdAt: 'desc' },
      take: TAKE_PER_SOURCE,
    });

    return reports.map((report) => ({
      id: report.id,
      source: 'PVE' as const,
      createdAt: report.createdAt.toISOString(),
      outcome: report.outcome,
      zoneNameKey: report.zone.nameKey,
      opponentNameKey: report.pentili.nameKey,
      opponentPlayerId: null,
      opponentUsername: null,
      xpGained: report.xpGained,
      lootSummary: report.lootSummary as unknown as LootResultEntryDto[],
    }));
  }

  private async getPvpReports(playerId: string): Promise<CombatReportDto[]> {
    const reports = await this.prisma.pvpBattleReport.findMany({
      where: { OR: [{ attackerId: playerId }, { defenderId: playerId }] },
      include: { attacker: true, defender: true },
      orderBy: { createdAt: 'desc' },
      take: TAKE_PER_SOURCE,
    });

    return reports.map((report) => {
      const isAttacker = report.attackerId === playerId;
      const opponent = isAttacker ? report.defender : report.attacker;
      // The stored outcome is always attacker-relative — flip it for the defender's own view.
      const outcome = isAttacker ? report.outcome : report.outcome === 'WIN' ? 'LOSS' : 'WIN';

      return {
        id: report.id,
        source: 'PVP' as const,
        createdAt: report.createdAt.toISOString(),
        outcome,
        zoneNameKey: null,
        opponentNameKey: null,
        opponentPlayerId: opponent.id,
        opponentUsername: opponent.username,
        xpGained: 0, // PvP has no XP concept
        lootSummary: report.lootSummary as unknown as LootResultEntryDto[],
      };
    });
  }

  private async getBossReports(playerId: string): Promise<CombatReportDto[]> {
    const participations = await this.prisma.bossEncounterParticipant.findMany({
      where: { playerId, encounter: { status: 'RESOLVED' } },
      include: { encounter: { include: { boss: { include: { zone: true } } } } },
      orderBy: { encounter: { resolvesAt: 'desc' } },
      take: TAKE_PER_SOURCE,
    });

    return participations.map((participation) => ({
      id: participation.id,
      source: 'BOSS' as const,
      // No separate "resolved at" timestamp is tracked anywhere — resolvesAt
      // is the closest meaningful proxy for when this encounter happened.
      createdAt: participation.encounter.resolvesAt.toISOString(),
      // Safe non-null: a participant row only exists once the group had at
      // least one member, so settle() always assigns WIN/LOSS in that case.
      outcome: participation.encounter.outcome!,
      zoneNameKey: participation.encounter.boss.zone.nameKey,
      opponentNameKey: participation.encounter.boss.nameKey,
      opponentPlayerId: null,
      opponentUsername: null,
      xpGained: participation.xpGained ?? 0,
      lootSummary: (participation.lootSummary as unknown as LootResultEntryDto[]) ?? [],
    }));
  }
}
