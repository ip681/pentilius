import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClanWarAttackReportDto,
  ClanWarContributionsDto,
  ClanWarContributionEntryDto,
  ClanWarHistoryEntryDto,
  ClanWarStateDto,
  ClanWarStatusResponseDto,
  ClanWarTargetDto,
  LootResultEntryDto,
  CombatRoundDto,
} from '@pentilius/shared';
import { ClanMembership, ClanWar, ClanWarAttack, ClanWarOutcome, Player, Prisma } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { assertNoActiveExpedition } from '../expeditions/expedition-guard';
import { CombatService, toStatsDto } from '../pve/combat.service';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

const STEALABLE_RESOURCES: ('METAL' | 'CRYSTAL' | 'CREDITS')[] = ['METAL', 'CRYSTAL', 'CREDITS'];
const RESOURCE_FIELD: Record<'METAL' | 'CRYSTAL' | 'CREDITS', 'metal' | 'crystal' | 'credits'> = {
  METAL: 'metal',
  CRYSTAL: 'crystal',
  CREDITS: 'credits',
};

/**
 * Clan-vs-clan war (owner decision, 2026-09-10 — instructions/OPEN_DECISIONS.md's
 * "clan-vs-clan war systems" was previously out of scope). See
 * schema.prisma's comment on ClanWar/ClanWarAttack for the full mechanic:
 * unilateral declaration by leader/officer, a snapshotted innate-HP war pool
 * per side, individual PvP-style duels that drain the enemy pool by raw
 * damage dealt, and lazy elapsed-time resolution (same pattern as buildings/
 * research/expeditions/bosses) so a war with zero attacks still closes
 * itself out at the 3-day deadline instead of staying open forever.
 */
@Injectable()
export class ClanWarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly combat: CombatService,
  ) {}

  async declareWar(playerId: string, targetClanId: string): Promise<ClanWarStateDto> {
    const acting = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!acting || acting.role === 'MEMBER') {
      throw new ForbiddenException('Only the leader or an officer may declare war');
    }
    if (acting.clanId === targetClanId) {
      throw new BadRequestException('Cannot declare war on your own clan');
    }

    return this.prisma.$transaction(async (tx) => {
      const [ownActiveWar, targetActiveWar] = await Promise.all([
        this.getActiveWarForClan(acting.clanId, tx),
        this.getActiveWarForClan(targetClanId, tx),
      ]);
      if (ownActiveWar) {
        throw new BadRequestException('ALREADY_AT_WAR');
      }
      if (targetActiveWar) {
        throw new BadRequestException('TARGET_ALREADY_AT_WAR');
      }

      const [ownMembers, targetClan, targetMembers] = await Promise.all([
        tx.clanMembership.findMany({ where: { clanId: acting.clanId }, include: { player: true } }),
        tx.clan.findUnique({ where: { id: targetClanId } }),
        tx.clanMembership.findMany({ where: { clanId: targetClanId }, include: { player: true } }),
      ]);
      if (!targetClan) {
        throw new NotFoundException('Clan not found');
      }
      if (ownMembers.length < GAME_BALANCE.clanWar.minMembersToParticipate) {
        throw new BadRequestException('CLAN_TOO_SMALL');
      }
      if (targetMembers.length < GAME_BALANCE.clanWar.minMembersToParticipate) {
        throw new BadRequestException('TARGET_TOO_SMALL');
      }

      const lastWarTogether = await tx.clanWar.findFirst({
        where: {
          status: 'RESOLVED',
          OR: [
            { attackerClanId: acting.clanId, defenderClanId: targetClanId },
            { attackerClanId: targetClanId, defenderClanId: acting.clanId },
          ],
        },
        orderBy: { resolvedAt: 'desc' },
      });
      if (lastWarTogether?.resolvedAt) {
        const cooldownEndsAt = lastWarTogether.resolvedAt.getTime() + GAME_BALANCE.clanWar.rematchCooldownDays * 86_400_000;
        if (Date.now() < cooldownEndsAt) {
          throw new BadRequestException('REMATCH_COOLDOWN');
        }
      }

      const attackerPool = computeWarPool(ownMembers);
      const defenderPool = computeWarPool(targetMembers);

      const created = await tx.clanWar.create({
        data: {
          attackerClanId: acting.clanId,
          defenderClanId: targetClanId,
          endsAt: new Date(Date.now() + GAME_BALANCE.clanWar.maxDurationHours * 3_600_000),
          attackerPoolMax: attackerPool,
          attackerPoolRemaining: attackerPool,
          defenderPoolMax: defenderPool,
          defenderPoolRemaining: defenderPool,
        },
      });

      return this.toStateDto(created, acting.clanId, tx);
    });
  }

  async getStatus(playerId: string): Promise<ClanWarStatusResponseDto> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership) {
      return { war: null };
    }
    const war = await this.getActiveWarForClan(membership.clanId, this.prisma);
    if (!war) {
      return { war: null };
    }
    return { war: await this.toStateDto(war, membership.clanId, this.prisma) };
  }

  async getTargets(playerId: string): Promise<ClanWarTargetDto[]> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership) {
      throw new BadRequestException('NOT_IN_CLAN');
    }
    const war = await this.getActiveWarForClan(membership.clanId, this.prisma);
    if (!war) {
      throw new NotFoundException('No active clan war');
    }
    const enemyClanId = war.attackerClanId === membership.clanId ? war.defenderClanId : war.attackerClanId;

    const cooldownCutoff = new Date(Date.now() - GAME_BALANCE.clanWar.attackCooldownMinutes * 60_000);
    const [members, myRecentAttacks] = await Promise.all([
      this.prisma.clanMembership.findMany({ where: { clanId: enemyClanId }, include: { player: true } }),
      this.prisma.clanWarAttack.findMany({
        where: { clanWarId: war.id, attackerId: playerId, createdAt: { gte: cooldownCutoff } },
        select: { defenderId: true, createdAt: true },
      }),
    ]);
    const myLastHitByTarget = new Map(myRecentAttacks.map((row) => [row.defenderId, row.createdAt]));

    return Promise.all(
      members.map(async (member): Promise<ClanWarTargetDto> => {
        let attackableAt: Date | null = null;
        if (member.player.clanWarProtectedUntil && member.player.clanWarProtectedUntil.getTime() > Date.now()) {
          attackableAt = member.player.clanWarProtectedUntil;
        }
        const myLastHit = myLastHitByTarget.get(member.playerId);
        if (myLastHit) {
          const cooldownEnd = new Date(myLastHit.getTime() + GAME_BALANCE.clanWar.attackCooldownMinutes * 60_000);
          if (!attackableAt || cooldownEnd > attackableAt) {
            attackableAt = cooldownEnd;
          }
        }
        const stats = await this.combat.computePlayerStats(member.playerId, this.prisma);
        return {
          playerId: member.playerId,
          username: member.player.username,
          race: member.player.race,
          level: member.player.level,
          stats: toStatsDto(stats),
          attackableAt: attackableAt ? attackableAt.toISOString() : null,
        };
      }),
    );
  }

  async attack(attackerId: string, defenderId: string): Promise<ClanWarAttackReportDto> {
    if (attackerId === defenderId) {
      throw new BadRequestException('Cannot attack yourself');
    }
    const attackerMembership = await this.prisma.clanMembership.findUnique({ where: { playerId: attackerId } });
    if (!attackerMembership) {
      throw new BadRequestException('NOT_IN_CLAN');
    }

    return this.prisma.$transaction(async (tx) => {
      const war = await this.getActiveWarForClan(attackerMembership.clanId, tx);
      if (!war) {
        throw new NotFoundException('No active clan war');
      }
      const isAttackerSide = war.attackerClanId === attackerMembership.clanId;
      const enemyClanId = isAttackerSide ? war.defenderClanId : war.attackerClanId;

      const defenderMembership = await tx.clanMembership.findUnique({ where: { playerId: defenderId } });
      if (!defenderMembership || defenderMembership.clanId !== enemyClanId) {
        throw new NotFoundException('This player is not a valid target');
      }

      const attacker = await this.economy.settleAll(attackerId, tx);
      if (attacker.actionEnergy < GAME_BALANCE.pvp.attackCostEnergy) {
        throw new BadRequestException('Not enough Action Energy');
      }
      await assertNoActiveExpedition(attackerId, tx);

      // Checked in this order deliberately: the same-attacker cooldown (60 min)
      // always outlasts the universal target protection (5 min), so checking
      // it first gives the more informative error for a repeat attacker —
      // TARGET_PROTECTED then only ever surfaces for a genuinely different
      // attacker trying within the shorter protection window.
      const cooldownCutoff = new Date(Date.now() - GAME_BALANCE.clanWar.attackCooldownMinutes * 60_000);
      const recentAttack = await tx.clanWarAttack.findFirst({
        where: { attackerId, defenderId, createdAt: { gte: cooldownCutoff } },
      });
      if (recentAttack) {
        throw new BadRequestException('ATTACK_COOLDOWN');
      }

      const defenderPlayer = await tx.player.findUniqueOrThrow({ where: { id: defenderId } });
      if (defenderPlayer.clanWarProtectedUntil && defenderPlayer.clanWarProtectedUntil > new Date()) {
        throw new BadRequestException('TARGET_PROTECTED');
      }

      await this.economy.settleResources(defenderId, tx);
      const settledDefender = await tx.player.findUniqueOrThrow({ where: { id: defenderId } });

      await tx.player.update({
        where: { id: attackerId },
        data: { actionEnergy: { decrement: GAME_BALANCE.pvp.attackCostEnergy } },
      });

      const [attackerStats, defenderStats] = await Promise.all([
        this.combat.computePlayerStats(attackerId, tx),
        this.combat.computePlayerStats(defenderId, tx),
      ]);

      const result = this.combat.simulate(attackerStats, {
        attack: defenderStats.attack,
        defense: defenderStats.defense,
        maxHp: Math.round(defenderStats.hp),
        evasion: defenderStats.evasion,
      });

      const lootSummary: LootResultEntryDto[] = [];
      if (result.won) {
        for (const resourceType of STEALABLE_RESOURCES) {
          const field = RESOURCE_FIELD[resourceType as 'METAL' | 'CRYSTAL' | 'CREDITS'];
          const quantity = Math.floor(settledDefender[field] * GAME_BALANCE.pvp.resourceStealPercentage);
          if (quantity <= 0) continue;

          await tx.player.update({ where: { id: attackerId }, data: { [field]: { increment: quantity } } });
          await tx.player.update({ where: { id: defenderId }, data: { [field]: { decrement: quantity } } });
          lootSummary.push({ type: 'resource', resourceType: resourceType as 'METAL' | 'CRYSTAL' | 'CREDITS', quantity });
        }
      }

      // Protection applies to anyone who was attacked, win or lose (owner
      // decision) — unlike regular PvP's revenge protection, which only
      // triggers on the attacker's win.
      await tx.player.update({
        where: { id: defenderId },
        data: { clanWarProtectedUntil: new Date(Date.now() + GAME_BALANCE.clanWar.targetProtectionMinutes * 60_000) },
      });

      const attackRecord = await tx.clanWarAttack.create({
        data: {
          clanWarId: war.id,
          attackerId,
          defenderId,
          outcome: result.won ? 'WIN' : 'LOSS',
          rounds: result.rounds as unknown as Prisma.InputJsonValue,
          attackerMaxHp: result.playerMaxHp,
          defenderMaxHp: result.pentiliMaxHp,
          damageDealt: result.damageDealt,
          damageTaken: result.damageTaken,
          lootSummary: lootSummary as unknown as Prisma.InputJsonValue,
        },
      });

      // Drain the enemy clan's pool by the raw damage dealt this duel,
      // regardless of whether the duel itself was won or lost.
      const drain = Math.min(result.damageDealt, isAttackerSide ? war.defenderPoolRemaining : war.attackerPoolRemaining);
      const updatedWar = await tx.clanWar.update({
        where: { id: war.id },
        data: isAttackerSide ? { defenderPoolRemaining: { decrement: drain } } : { attackerPoolRemaining: { decrement: drain } },
      });
      await this.resolveIfDue(updatedWar, tx);

      return toAttackReportDto(attackRecord, 'attacker', defenderPlayer, lootSummary, result.rounds as unknown as CombatRoundDto[]);
    });
  }

  async getReports(playerId: string): Promise<ClanWarAttackReportDto[]> {
    const reports = await this.prisma.clanWarAttack.findMany({
      where: { OR: [{ attackerId: playerId }, { defenderId: playerId }] },
      include: { attacker: true, defender: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return reports.map((report) => {
      const role = report.attackerId === playerId ? 'attacker' : 'defender';
      const opponent = role === 'attacker' ? report.defender : report.attacker;
      return toAttackReportDto(
        report,
        role,
        opponent,
        report.lootSummary as unknown as LootResultEntryDto[],
        report.rounds as unknown as CombatRoundDto[],
      );
    });
  }

  private async getActiveWarForClan(clanId: string, tx: Tx): Promise<ClanWar | null> {
    const war = await tx.clanWar.findFirst({
      where: { status: 'ACTIVE', OR: [{ attackerClanId: clanId }, { defenderClanId: clanId }] },
    });
    if (!war) {
      return null;
    }
    const resolved = await this.resolveIfDue(war, tx);
    return resolved.status === 'ACTIVE' ? resolved : null;
  }

  /** Elapsed-time resolution — same lazy pattern as buildings/research/expeditions/bosses. */
  private async resolveIfDue(war: ClanWar, tx: Tx): Promise<ClanWar> {
    if (war.status !== 'ACTIVE') {
      return war;
    }
    const now = new Date();
    const attackerDown = war.attackerPoolRemaining <= 0;
    const defenderDown = war.defenderPoolRemaining <= 0;
    const timeUp = now >= war.endsAt;
    if (!attackerDown && !defenderDown && !timeUp) {
      return war;
    }

    let outcome: ClanWarOutcome;
    let winnerClanId: string | null;
    if (attackerDown || defenderDown) {
      outcome = 'CONQUEST';
      winnerClanId = attackerDown ? war.defenderClanId : war.attackerClanId;
    } else if (war.attackerPoolRemaining === war.defenderPoolRemaining) {
      outcome = 'DRAW';
      winnerClanId = null;
    } else {
      outcome = 'DECISION';
      winnerClanId = war.attackerPoolRemaining > war.defenderPoolRemaining ? war.attackerClanId : war.defenderClanId;
    }

    // War-level treasury reward (owner decision, 2026-09-10) — on top of the
    // per-duel personal steal already applied during the war. CONQUEST pays
    // more than DECISION since it required actually breaking the enemy pool.
    let treasuryMetalTransferred = 0;
    let treasuryCrystalTransferred = 0;
    let treasuryCreditsTransferred = 0;

    if (winnerClanId) {
      const loserClanId = winnerClanId === war.attackerClanId ? war.defenderClanId : war.attackerClanId;
      const percentage =
        outcome === 'CONQUEST' ? GAME_BALANCE.clanWar.conquestTreasuryStealPercentage : GAME_BALANCE.clanWar.decisionTreasuryStealPercentage;
      const loser = await tx.clan.findUniqueOrThrow({ where: { id: loserClanId } });
      treasuryMetalTransferred = Math.floor(loser.treasuryMetal * percentage);
      treasuryCrystalTransferred = Math.floor(loser.treasuryCrystal * percentage);
      treasuryCreditsTransferred = Math.floor(loser.treasuryCredits * percentage);

      await tx.clan.update({
        where: { id: loserClanId },
        data: {
          treasuryMetal: { decrement: treasuryMetalTransferred },
          treasuryCrystal: { decrement: treasuryCrystalTransferred },
          treasuryCredits: { decrement: treasuryCreditsTransferred },
        },
      });
      await tx.clan.update({
        where: { id: winnerClanId },
        data: {
          treasuryMetal: { increment: treasuryMetalTransferred },
          treasuryCrystal: { increment: treasuryCrystalTransferred },
          treasuryCredits: { increment: treasuryCreditsTransferred },
        },
      });
    }

    return tx.clanWar.update({
      where: { id: war.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
        outcome,
        winnerClanId,
        treasuryMetalTransferred,
        treasuryCrystalTransferred,
        treasuryCreditsTransferred,
      },
    });
  }

  async getHistory(playerId: string): Promise<ClanWarHistoryEntryDto[]> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership) {
      return [];
    }

    const wars = await this.prisma.clanWar.findMany({
      where: { status: 'RESOLVED', OR: [{ attackerClanId: membership.clanId }, { defenderClanId: membership.clanId }] },
      include: { attackerClan: true, defenderClan: true },
      orderBy: { resolvedAt: 'desc' },
      take: 50,
    });

    return wars.map((war): ClanWarHistoryEntryDto => {
      const isAttacker = war.attackerClanId === membership.clanId;
      const opponentClan = isAttacker ? war.defenderClan : war.attackerClan;
      const won = war.winnerClanId === null ? null : war.winnerClanId === membership.clanId;
      const sign = won === true ? 1 : won === false ? -1 : 0;
      return {
        id: war.id,
        role: isAttacker ? 'attacker' : 'defender',
        opponentClanId: opponentClan.id,
        opponentClanName: opponentClan.name,
        opponentClanTag: opponentClan.tag,
        outcome: war.outcome!,
        won,
        startedAt: war.startedAt.toISOString(),
        resolvedAt: war.resolvedAt!.toISOString(),
        treasuryMetalChange: sign * war.treasuryMetalTransferred,
        treasuryCrystalChange: sign * war.treasuryCrystalTransferred,
        treasuryCreditsChange: sign * war.treasuryCreditsTransferred,
      };
    });
  }

  async getContributions(playerId: string, warId: string): Promise<ClanWarContributionsDto> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership) {
      throw new BadRequestException('NOT_IN_CLAN');
    }
    const war = await this.prisma.clanWar.findUnique({ where: { id: warId } });
    if (!war || (war.attackerClanId !== membership.clanId && war.defenderClanId !== membership.clanId)) {
      throw new NotFoundException('War not found');
    }

    const grouped = await this.prisma.clanWarAttack.groupBy({
      by: ['attackerId'],
      where: { clanWarId: warId },
      _count: { _all: true },
      _sum: { damageDealt: true },
    });
    const attackers = await this.prisma.player.findMany({
      where: { id: { in: grouped.map((g) => g.attackerId) } },
      select: { id: true, username: true, clanMembership: { select: { clanId: true } } },
    });
    const attackerById = new Map(attackers.map((a) => [a.id, a]));

    const mine: ClanWarContributionEntryDto[] = [];
    const enemy: ClanWarContributionEntryDto[] = [];
    for (const group of grouped) {
      const attacker = attackerById.get(group.attackerId);
      if (!attacker) continue;
      const entry: ClanWarContributionEntryDto = {
        playerId: group.attackerId,
        username: attacker.username,
        attackCount: group._count._all,
        totalDamageDealt: group._sum.damageDealt ?? 0,
      };
      (attacker.clanMembership?.clanId === membership.clanId ? mine : enemy).push(entry);
    }
    mine.sort((a, b) => b.totalDamageDealt - a.totalDamageDealt);
    enemy.sort((a, b) => b.totalDamageDealt - a.totalDamageDealt);

    return { mine, enemy };
  }

  private async toStateDto(war: ClanWar, myClanId: string, tx: Tx): Promise<ClanWarStateDto> {
    const isAttacker = war.attackerClanId === myClanId;
    const enemyClanId = isAttacker ? war.defenderClanId : war.attackerClanId;
    const [myClan, enemyClan] = await Promise.all([
      tx.clan.findUniqueOrThrow({ where: { id: myClanId } }),
      tx.clan.findUniqueOrThrow({ where: { id: enemyClanId } }),
    ]);

    return {
      id: war.id,
      status: war.status,
      role: isAttacker ? 'attacker' : 'defender',
      myClanId,
      myClanName: myClan.name,
      myClanTag: myClan.tag,
      enemyClanId,
      enemyClanName: enemyClan.name,
      enemyClanTag: enemyClan.tag,
      startedAt: war.startedAt.toISOString(),
      endsAt: war.endsAt.toISOString(),
      resolvedAt: war.resolvedAt?.toISOString() ?? null,
      myPoolMax: isAttacker ? war.attackerPoolMax : war.defenderPoolMax,
      myPoolRemaining: isAttacker ? war.attackerPoolRemaining : war.defenderPoolRemaining,
      enemyPoolMax: isAttacker ? war.defenderPoolMax : war.attackerPoolMax,
      enemyPoolRemaining: isAttacker ? war.defenderPoolRemaining : war.attackerPoolRemaining,
      outcome: war.outcome,
      won: war.outcome ? war.winnerClanId === myClanId : null,
    };
  }
}

function computeWarPool(members: (ClanMembership & { player: Player })[]): number {
  const sum = members.reduce(
    (total, member) => total + GAME_BALANCE.combat.basePlayerHp + member.player.baseHp * GAME_BALANCE.robotAttributes.hpPointValue,
    0,
  );
  return Math.round(sum * GAME_BALANCE.clanWar.poolMultiplier);
}

function toAttackReportDto(
  report: ClanWarAttack,
  role: 'attacker' | 'defender',
  opponent: Player,
  lootSummary: LootResultEntryDto[],
  rounds: CombatRoundDto[],
): ClanWarAttackReportDto {
  return {
    id: report.id,
    role,
    opponentId: opponent.id,
    opponentUsername: opponent.username,
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
