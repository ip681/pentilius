import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CoreAttackResultDto,
  CorePlayerRankingPageDto,
  CorePlayerRankingScope,
  CorePlayerStandingDto,
  CoreStandingDto,
  CoreStateDto,
  CoreStatus,
  CoreTavernStatusDto,
  SeasonResultDto,
} from '@pentilius/shared';
import { Prisma, Season } from '@prisma/client';
import { findTavern, isTavernActive } from '../clans/clan-tavern';
import { GAME_BALANCE } from '../config/game-config';
import { assertNoActiveExpedition } from '../expeditions/expedition-guard';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';
import { CombatService } from '../pve/combat.service';

type Tx = PrismaService | Prisma.TransactionClient;

const DAY_MS = 24 * 3600_000;

// The Core never falls (owner decision: it has no "end", damage just
// accumulates) — simulate() still needs an HP pool, so give it one no attack
// can ever drain. Never shown to players.
const CORE_UNBREAKABLE_HP = Number.MAX_SAFE_INTEGER;

export function coreEndsAt(season: Pick<Season, 'coreOpensAt' | 'coreDurationDays'>): Date | null {
  return season.coreOpensAt ? new Date(season.coreOpensAt.getTime() + season.coreDurationDays * DAY_MS) : null;
}

export function coreStatus(season: Pick<Season, 'coreOpensAt' | 'coreDurationDays'>, now = Date.now()): CoreStatus {
  if (!season.coreOpensAt) return 'NOT_SCHEDULED';
  if (now < season.coreOpensAt.getTime()) return 'SCHEDULED';
  if (now < coreEndsAt(season)!.getTime()) return 'OPEN';
  return 'ENDED';
}

/** The current season is the row with the highest id; created on first use if the seed never ran. */
export async function getCurrentSeason(tx: Tx): Promise<Season> {
  const latest = await tx.season.findFirst({ orderBy: { id: 'desc' } });
  return latest ?? tx.season.create({ data: {} });
}

interface RankedScore {
  clanId: string | null;
  clanName: string;
  clanTag: string;
  damage: number;
}

/**
 * Seasons and the Core (owner decision, 2026-10-12). Any clan member attacks
 * the Core for 1 Action Energy; the damage dealt is credited to their clan.
 * After the configured number of days the clan with the most damage wins and
 * the standings are frozen into SeasonClanResult. The Core fights back, so
 * every combat stat matters — the fight ends when the robot falls or
 * GAME_BALANCE.core.maxRounds pass.
 */
@Injectable()
export class SeasonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly combat: CombatService,
  ) {}

  async getState(playerId: string): Promise<CoreStateDto> {
    return this.buildState(playerId, this.prisma);
  }

  async attack(playerId: string): Promise<CoreAttackResultDto> {
    const season = await getCurrentSeason(this.prisma);
    if (coreStatus(season) !== 'OPEN') {
      throw new BadRequestException('CORE_NOT_OPEN');
    }

    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership) {
      throw new BadRequestException('NOT_IN_CLAN');
    }

    const player = await this.economy.settleAll(playerId);
    if (player.actionEnergy < GAME_BALANCE.core.attackCostEnergy) {
      throw new BadRequestException('NOT_ENOUGH_ENERGY');
    }
    await assertNoActiveExpedition(playerId, this.prisma);

    const result = await this.prisma.$transaction(async (tx) => {
      // Claims the cooldown with a compare-and-swap, so two simultaneous
      // requests can't both get through the anti-flood gap.
      const now = new Date();
      const cooldownStart = new Date(now.getTime() - GAME_BALANCE.core.attackCooldownSeconds * 1000);
      const claimed = await tx.player.updateMany({
        where: { id: playerId, OR: [{ lastCoreAttackAt: null }, { lastCoreAttackAt: { lte: cooldownStart } }] },
        data: { lastCoreAttackAt: now },
      });
      if (claimed.count === 0) {
        throw new BadRequestException('CORE_ATTACK_COOLDOWN');
      }

      await this.economy.spendEnergy(playerId, GAME_BALANCE.core.attackCostEnergy, player, tx);

      const stats = await this.combat.computePlayerStats(playerId, tx, { bossOrCore: true });
      const combat = this.combat.simulate(
        stats,
        { attack: GAME_BALANCE.core.attack, defense: GAME_BALANCE.core.defense, maxHp: CORE_UNBREAKABLE_HP },
        GAME_BALANCE.core.maxRounds,
      );

      await tx.coreAttack.create({
        data: {
          seasonId: season.id,
          playerId,
          clanId: membership.clanId,
          damageDealt: combat.damageDealt,
          damageTaken: combat.damageTaken,
          rounds: combat.rounds as unknown as Prisma.InputJsonValue,
          playerMaxHp: combat.playerMaxHp,
        },
      });
      await tx.clanCoreScore.upsert({
        where: { seasonId_clanId: { seasonId: season.id, clanId: membership.clanId } },
        update: { damage: { increment: BigInt(combat.damageDealt) } },
        create: { seasonId: season.id, clanId: membership.clanId, damage: BigInt(combat.damageDealt) },
      });

      return combat;
    });

    return {
      damageDealt: result.damageDealt,
      damageTaken: result.damageTaken,
      playerMaxHp: result.playerMaxHp,
      roundsSurvived: result.rounds.length,
      maxRounds: GAME_BALANCE.core.maxRounds,
      // The Core's HP is a technical placeholder — strip it so clients can't show it.
      rounds: result.rounds.map((r) => ({ ...r, pentiliHpAfter: 0 })),
      state: await this.buildState(playerId, this.prisma),
    };
  }

  /** Every past season's final placement for one clan, newest first. */
  async getClanSeasonResults(clanId: string): Promise<SeasonResultDto[]> {
    const rows = await this.prisma.seasonClanResult.findMany({ where: { clanId }, orderBy: { seasonId: 'desc' } });
    return rows.map((r) => ({ seasonId: r.seasonId, rank: r.rank, clanName: r.clanName, clanTag: r.clanTag, damage: Number(r.damage) }));
  }

  private async buildState(playerId: string, tx: Tx): Promise<CoreStateDto> {
    let season = await getCurrentSeason(tx);
    const status = coreStatus(season);
    if (status === 'ENDED' && !season.finalizedAt) {
      season = await this.finalize(season);
    }

    const membership = await tx.clanMembership.findUnique({ where: { playerId }, include: { clan: { select: { id: true, name: true, tag: true } } } });
    const ranked = season.finalizedAt ? await this.loadFinalStandings(season.id, tx) : await this.loadLiveStandings(season.id, tx);
    const leaderDamage = ranked[0]?.damage ?? 0;
    const toDto = (score: RankedScore, index: number): CoreStandingDto => ({
      rank: index + 1,
      clanId: score.clanId,
      clanName: score.clanName,
      clanTag: score.clanTag,
      damage: score.damage,
      percentOfLeader: leaderDamage > 0 ? Math.round((score.damage / leaderDamage) * 1000) / 10 : 0,
      isMyClan: !!membership && score.clanId === membership.clanId,
    });

    const topN = GAME_BALANCE.core.standingsTopN;
    const standings = ranked.slice(0, topN).map(toDto);
    const myIndex = membership ? ranked.findIndex((s) => s.clanId === membership.clanId) : -1;
    const myClanStanding = myIndex >= topN ? toDto(ranked[myIndex], myIndex) : null;

    const [myDamageAgg, player] = await Promise.all([
      tx.coreAttack.aggregate({ where: { seasonId: season.id, playerId }, _sum: { damageDealt: true } }),
      tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { lastCoreAttackAt: true } }),
    ]);
    const nextAttackMs = player.lastCoreAttackAt ? player.lastCoreAttackAt.getTime() + GAME_BALANCE.core.attackCooldownSeconds * 1000 : 0;

    return {
      seasonId: season.id,
      status: coreStatus(season),
      opensAt: season.coreOpensAt?.toISOString() ?? null,
      endsAt: coreEndsAt(season)?.toISOString() ?? null,
      durationDays: season.coreDurationDays,
      serverNow: new Date().toISOString(),
      standings,
      myClanStanding,
      inClan: !!membership,
      myClan: membership?.clan ?? null,
      myDamage: myDamageAgg._sum.damageDealt ?? 0,
      nextAttackAt: nextAttackMs > Date.now() ? new Date(nextAttackMs).toISOString() : null,
      attackCostEnergy: GAME_BALANCE.core.attackCostEnergy,
      tavern: membership ? await this.getTavernStatus(membership.clanId, tx) : null,
    };
  }

  /** One page of the own-clan or server-wide player ranking, plus the viewer's own row. */
  async getPlayerRanking(viewerId: string, scope: CorePlayerRankingScope, requestedPage = 1): Promise<CorePlayerRankingPageDto> {
    const season = await getCurrentSeason(this.prisma);
    const pageSize = GAME_BALANCE.core.playerRankingPageSize;
    if (scope === 'server') {
      return this.loadServerPlayersPage(season.id, viewerId, requestedPage, pageSize);
    }

    // Clan members are few enough to rank in full and slice.
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId: viewerId } });
    const ranked = membership ? await this.loadClanPlayers(season.id, membership.clanId, viewerId, this.prisma) : [];
    const page = clampPage(requestedPage, ranked.length, pageSize);
    return {
      scope,
      entries: ranked.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: ranked.length,
      viewerEntry: ranked.find((row) => row.isCurrentPlayer) ?? null,
    };
  }

  /**
   * Every current member of the clan, ranked by damage dealt FOR THIS CLAN
   * this season (CoreAttack.clanId — damage from a previous clan stays with
   * that clan). Members who haven't attacked are listed last, unranked.
   */
  private async loadClanPlayers(seasonId: number, clanId: string, viewerId: string, tx: Tx): Promise<CorePlayerStandingDto[]> {
    const [members, sums] = await Promise.all([
      tx.clanMembership.findMany({ where: { clanId }, include: { player: { select: { username: true, race: true } }, clan: { select: { tag: true } } } }),
      tx.coreAttack.groupBy({ by: ['playerId'], where: { seasonId, clanId }, _sum: { damageDealt: true } }),
    ]);
    const damageByPlayer = new Map(sums.map((row) => [row.playerId, row._sum.damageDealt ?? 0]));

    const rows = members
      .map((m) => ({ member: m, damage: damageByPlayer.get(m.playerId) ?? 0 }))
      .sort((a, b) => b.damage - a.damage || a.member.player.username.localeCompare(b.member.player.username));
    return rows.map(({ member, damage }, index) => ({
      rank: damage > 0 ? index + 1 : null,
      playerId: member.playerId,
      username: member.player.username,
      race: member.player.race,
      clanTag: member.clan.tag,
      damage,
      isCurrentPlayer: member.playerId === viewerId,
    }));
  }

  /**
   * Every player with damage this season, by total personal damage whatever
   * clan(s) it was dealt for — shown with their current clan's tag. Only the
   * requested page (plus the viewer) is hydrated with player details. Grouped
   * on every read (no cached totals) — fine at this project's scale; revisit
   * with a per-player running total if core_attacks grows large.
   */
  private async loadServerPlayersPage(seasonId: number, viewerId: string, requestedPage: number, pageSize: number): Promise<CorePlayerRankingPageDto> {
    const sums = await this.prisma.coreAttack.groupBy({ by: ['playerId'], where: { seasonId }, _sum: { damageDealt: true } });
    const ranked = sums
      .map((row) => ({ playerId: row.playerId, damage: row._sum.damageDealt ?? 0 }))
      .filter((row) => row.damage > 0)
      .sort((a, b) => b.damage - a.damage || a.playerId.localeCompare(b.playerId));

    const page = clampPage(requestedPage, ranked.length, pageSize);
    const startIndex = (page - 1) * pageSize;
    const pageRows = ranked.slice(startIndex, startIndex + pageSize).map((row, i) => ({ ...row, index: startIndex + i }));
    const myIndex = ranked.findIndex((row) => row.playerId === viewerId);
    // The viewer always gets a row — unranked with 0 damage if they haven't attacked yet.
    const myRow = myIndex >= 0 ? { ...ranked[myIndex], index: myIndex } : { playerId: viewerId, damage: 0, index: -1 };
    const wanted = [...pageRows, myRow];

    const players = await this.prisma.player.findMany({
      where: { id: { in: wanted.map((row) => row.playerId) } },
      select: { id: true, username: true, race: true, clanMembership: { select: { clan: { select: { tag: true } } } } },
    });
    const byId = new Map(players.map((p) => [p.id, p]));
    const toDto = (row: { playerId: string; damage: number; index: number }): CorePlayerStandingDto => {
      const p = byId.get(row.playerId)!;
      return {
        rank: row.index >= 0 ? row.index + 1 : null,
        playerId: row.playerId,
        username: p.username,
        race: p.race,
        clanTag: p.clanMembership?.clan.tag ?? null,
        damage: row.damage,
        isCurrentPlayer: row.playerId === viewerId,
      };
    };

    return {
      scope: 'server',
      entries: pageRows.map(toDto),
      page,
      pageSize,
      total: ranked.length,
      viewerEntry: toDto(myRow),
    };
  }

  private async getTavernStatus(clanId: string, tx: Tx): Promise<CoreTavernStatusDto | null> {
    const tavern = await findTavern(clanId, tx);
    if (!tavern) {
      return null;
    }
    const type = await tx.clanBuildingType.findUniqueOrThrow({ where: { id: tavern.clanBuildingTypeId } });
    const active = isTavernActive(tavern);
    return {
      level: tavern.level,
      bonusPercent: Math.round(tavern.level * type.bonusPerLevel * 1000) / 10,
      active,
      activeUntil: active ? tavern.activeUntil!.toISOString() : null,
    };
  }

  /** Damage desc; on a tie, whoever reached that total first (older updatedAt) ranks higher. */
  private async loadLiveStandings(seasonId: number, tx: Tx): Promise<RankedScore[]> {
    const scores = await tx.clanCoreScore.findMany({
      where: { seasonId, damage: { gt: 0 } },
      include: { clan: { select: { name: true, tag: true } } },
      orderBy: [{ damage: 'desc' }, { updatedAt: 'asc' }],
    });
    return scores.map((s) => ({ clanId: s.clanId, clanName: s.clan.name, clanTag: s.clan.tag, damage: Number(s.damage) }));
  }

  private async loadFinalStandings(seasonId: number, tx: Tx): Promise<RankedScore[]> {
    const results = await tx.seasonClanResult.findMany({ where: { seasonId }, orderBy: { rank: 'asc' } });
    return results.map((r) => ({ clanId: r.clanId, clanName: r.clanName, clanTag: r.clanTag, damage: Number(r.damage) }));
  }

  /**
   * Freezes the final standings once the Core window has closed — lazily, on
   * the first read after the deadline (no cron). The finalizedAt
   * compare-and-swap makes sure only one caller ever writes the results.
   */
  private async finalize(season: Season): Promise<Season> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.season.updateMany({ where: { id: season.id, finalizedAt: null }, data: { finalizedAt: new Date() } });
      if (claimed.count === 0) {
        return;
      }
      const ranked = await this.loadLiveStandings(season.id, tx);
      await tx.seasonClanResult.createMany({
        data: ranked.map((s, index) => ({
          seasonId: season.id,
          clanId: s.clanId,
          clanName: s.clanName,
          clanTag: s.clanTag,
          rank: index + 1,
          damage: BigInt(s.damage),
        })),
      });
    });
    return this.prisma.season.findUniqueOrThrow({ where: { id: season.id } });
  }
}

function clampPage(requested: number, total: number, pageSize: number): number {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, Math.floor(requested)), lastPage);
}
