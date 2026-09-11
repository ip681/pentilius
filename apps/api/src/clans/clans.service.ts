import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClanActiveWarDto,
  ClanBuildingStateDto,
  ClanDetailDto,
  ClanLeaderboardEntryDto,
  ClanLeaderboardPageDto,
  ClanMessageDto,
  ClanSummaryDto,
  MyClanResponseDto,
} from '@pentilius/shared';
import { Clan, ClanBuilding, ClanBuildingLevelCost, ClanBuildingType, ClanMembership, ClanMessage, Player, Prisma } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClanLeaderboardQueryDto } from './dto/clan-leaderboard-query.dto';
import { CreateClanDto } from './dto/create-clan.dto';
import { DonateDto } from './dto/donate.dto';
import { UpdateClanDto } from './dto/update-clan.dto';
import { UpdateJoinRequirementsDto } from './dto/update-join-requirements.dto';

type Tx = PrismaService | Prisma.TransactionClient;
type BuildingWithType = ClanBuilding & { clanBuildingType: ClanBuildingType & { levelCosts: ClanBuildingLevelCost[] } };
type ClanWithDetails = Clan & { members: (ClanMembership & { player: Player })[]; buildings: BuildingWithType[] };

const CLAN_INCLUDE = {
  members: { include: { player: true } },
  buildings: { include: { clanBuildingType: { include: { levelCosts: true } } } },
} as const;

/**
 * Clans (instructions/GAME_SYSTEMS.md, LOCKED: "Clans are central"). This is
 * an M4 foundation — create/join/leave/roles, a shared treasury, and three
 * clan buildings funded by it (Member Hall / Clan Forge / Clan Depot — see
 * schema.prisma's comment on ClanBuildingType for what each does). A
 * member-capacity building beyond Member Hall, clan-scoped boss hunts,
 * contribution tracking toward the Core, and clan-vs-clan war systems are
 * deliberately out of scope here (instructions/OPEN_DECISIONS.md: member cap,
 * roles, clan building list, contribution rules and clan-war rules are all
 * UNDEFINED). Joining is open — owner decision, mirroring the Boss Hunts
 * precedent — there is no invite/request model. The treasury is donate-only:
 * nothing may be withdrawn back to a player (owner-specified) — it only ever
 * flows into clan buildings.
 */
@Injectable()
export class ClansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  async listClans(): Promise<ClanSummaryDto[]> {
    const clans = await this.prisma.clan.findMany({
      include: CLAN_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return clans.map(toSummaryDto);
  }

  /**
   * Clan leaderboard (owner decision, 2026-09-10) — deliberately excludes
   * treasury (donation amounts stay private, same reasoning as the player
   * board excluding wealth) and loss counts (only total wars fought plus
   * each win type — CONQUEST and DECISION shown separately, no "losses"
   * column). Small-scale, in-memory ranking — see the comment on
   * PlayerService.listPlayers for why that's fine at this project's size.
   */
  async getLeaderboard(viewerId: string, filter: ClanLeaderboardQueryDto): Promise<ClanLeaderboardPageDto> {
    const sortBy = filter.sortBy ?? 'wars';
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

    const [myMembership, clans, resolvedWars] = await Promise.all([
      this.prisma.clanMembership.findUnique({ where: { playerId: viewerId } }),
      this.prisma.clan.findMany({
        select: { id: true, name: true, tag: true, members: { select: { player: { select: { level: true } } } } },
      }),
      this.prisma.clanWar.findMany({
        where: { status: 'RESOLVED' },
        select: { attackerClanId: true, defenderClanId: true, winnerClanId: true, outcome: true },
      }),
    ]);

    const warStatsByClan = new Map<string, { totalWars: number; conquestWins: number; decisionWins: number }>();
    const bump = (clanId: string, field: 'totalWars' | 'conquestWins' | 'decisionWins') => {
      const entry = warStatsByClan.get(clanId) ?? { totalWars: 0, conquestWins: 0, decisionWins: 0 };
      entry[field] += 1;
      warStatsByClan.set(clanId, entry);
    };
    for (const war of resolvedWars) {
      bump(war.attackerClanId, 'totalWars');
      bump(war.defenderClanId, 'totalWars');
      if (war.winnerClanId && war.outcome === 'CONQUEST') bump(war.winnerClanId, 'conquestWins');
      if (war.winnerClanId && war.outcome === 'DECISION') bump(war.winnerClanId, 'decisionWins');
    }

    const enriched = clans.map((clan) => {
      const stats = warStatsByClan.get(clan.id) ?? { totalWars: 0, conquestWins: 0, decisionWins: 0 };
      const levels = clan.members.map((m) => m.player.level);
      const averageMemberLevel = levels.length > 0 ? Math.round((levels.reduce((sum, l) => sum + l, 0) / levels.length) * 10) / 10 : 0;
      return {
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        memberCount: clan.members.length,
        averageMemberLevel,
        totalWars: stats.totalWars,
        conquestWins: stats.conquestWins,
        decisionWins: stats.decisionWins,
      };
    });

    // CONQUEST weighs more than DECISION for the default 'wars' sort — a
    // conquest required actually breaking the enemy, a decision didn't.
    const metricOf = (c: (typeof enriched)[number]) =>
      sortBy === 'avgLevel' ? c.averageMemberLevel : c.conquestWins * 1000 + c.decisionWins;
    const sorted = [...enriched].sort((a, b) => metricOf(b) - metricOf(a) || a.name.localeCompare(b.name));

    const total = sorted.length;
    const startIndex = (page - 1) * pageSize;
    const pageItems = sorted.slice(startIndex, startIndex + pageSize);

    const entries: ClanLeaderboardEntryDto[] = pageItems.map((c, index) => ({
      ...c,
      rank: startIndex + index + 1,
      isMyClan: myMembership?.clanId === c.id,
    }));

    // Computed over the full `sorted` list — present regardless of the
    // current page, so "where is my clan" always works.
    const myClanIndex = myMembership ? sorted.findIndex((c) => c.id === myMembership.clanId) : -1;
    const viewerEntry: ClanLeaderboardEntryDto | null =
      myClanIndex >= 0 ? { ...sorted[myClanIndex], rank: myClanIndex + 1, isMyClan: true } : null;

    return { entries, page, pageSize, total, viewerEntry };
  }

  async getClan(clanId: string, currentPlayerId: string): Promise<ClanDetailDto> {
    const clan = await this.loadClanFresh(clanId);
    if (!clan) {
      throw new NotFoundException('Clan not found');
    }
    return toDetailDto(clan, currentPlayerId, this.prisma);
  }

  async getMyClan(playerId: string): Promise<MyClanResponseDto> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership) {
      return { clan: null };
    }
    const clan = await this.loadClanFresh(membership.clanId);
    return { clan: clan ? await toDetailDto(clan, playerId, this.prisma) : null };
  }

  async createClan(playerId: string, dto: CreateClanDto): Promise<ClanDetailDto> {
    const existingMembership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (existingMembership) {
      throw new BadRequestException('ALREADY_IN_CLAN');
    }

    const tag = dto.tag.toUpperCase();
    const [existingName, existingTag] = await Promise.all([
      this.prisma.clan.findUnique({ where: { name: dto.name } }),
      this.prisma.clan.findUnique({ where: { tag } }),
    ]);
    if (existingName) {
      throw new BadRequestException('CLAN_NAME_TAKEN');
    }
    if (existingTag) {
      throw new BadRequestException('CLAN_TAG_TAKEN');
    }

    const clan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clan.create({ data: { name: dto.name, tag, description: dto.description } });
      await tx.clanMembership.create({ data: { clanId: created.id, playerId, role: 'LEADER' } });
      return created;
    });

    return this.getClan(clan.id, playerId);
  }

  async joinClan(playerId: string, clanId: string): Promise<ClanDetailDto> {
    const existingMembership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (existingMembership) {
      throw new BadRequestException('ALREADY_IN_CLAN');
    }

    return this.prisma.$transaction(async (tx) => {
      const clan = await this.loadClanFresh(clanId, tx);
      if (!clan) {
        throw new NotFoundException('Clan not found');
      }
      if (clan.members.length >= effectiveMemberCap(clan)) {
        throw new BadRequestException('CLAN_FULL');
      }

      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      if (!meetsJoinRequirements(clan, player)) {
        throw new BadRequestException('JOIN_REQUIREMENTS_NOT_MET');
      }

      await tx.clanMembership.create({ data: { clanId, playerId, role: 'MEMBER' } });
      const full = await this.loadClanRaw(clanId, tx);
      return toDetailDto(full!, playerId, tx);
    });
  }

  async leaveClan(playerId: string): Promise<void> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership) {
      throw new BadRequestException('NOT_IN_CLAN');
    }

    await this.prisma.$transaction(async (tx) => {
      if (membership.role !== 'LEADER') {
        await tx.clanMembership.delete({ where: { playerId } });
        return;
      }

      // Leader leaving: hand off to the longest-tenured officer, else the
      // longest-tenured member; disband if the leader was the only member.
      const officer = await tx.clanMembership.findFirst({
        where: { clanId: membership.clanId, role: 'OFFICER' },
        orderBy: { joinedAt: 'asc' },
      });
      const successor =
        officer ?? (await tx.clanMembership.findFirst({ where: { clanId: membership.clanId, role: 'MEMBER' }, orderBy: { joinedAt: 'asc' } }));

      if (successor) {
        await tx.clanMembership.update({ where: { id: successor.id }, data: { role: 'LEADER' } });
        await tx.clanMembership.delete({ where: { playerId } });
      } else {
        await tx.clanMembership.delete({ where: { playerId } });
        await tx.clanBuilding.deleteMany({ where: { clanId: membership.clanId } });
        await tx.clan.delete({ where: { id: membership.clanId } });
      }
    });
  }

  async disbandClan(playerId: string): Promise<void> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership || membership.role !== 'LEADER') {
      throw new ForbiddenException('Only the leader may disband the clan');
    }

    await this.prisma.$transaction([
      this.prisma.clanMembership.deleteMany({ where: { clanId: membership.clanId } }),
      this.prisma.clanBuilding.deleteMany({ where: { clanId: membership.clanId } }),
      this.prisma.clan.delete({ where: { id: membership.clanId } }),
    ]);
  }

  async updateClan(playerId: string, dto: UpdateClanDto): Promise<ClanDetailDto> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership || membership.role !== 'LEADER') {
      throw new ForbiddenException('Only the leader may edit the clan');
    }
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    if (dto.name !== undefined) {
      const existingName = await this.prisma.clan.findUnique({ where: { name: dto.name } });
      if (existingName && existingName.id !== membership.clanId) {
        throw new BadRequestException('CLAN_NAME_TAKEN');
      }
    }

    await this.prisma.clan.update({
      where: { id: membership.clanId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      },
    });

    return this.getClan(membership.clanId, playerId);
  }

  async updateJoinRequirements(actingPlayerId: string, dto: UpdateJoinRequirementsDto): Promise<ClanDetailDto> {
    const acting = await this.prisma.clanMembership.findUnique({ where: { playerId: actingPlayerId } });
    if (!acting || acting.role === 'MEMBER') {
      throw new ForbiddenException('Only the leader or an officer may change join requirements');
    }

    await this.prisma.clan.update({
      where: { id: acting.clanId },
      data: {
        ...(dto.minLevel !== undefined ? { joinMinLevel: dto.minLevel } : {}),
        ...(dto.minDamage !== undefined ? { joinMinDamage: dto.minDamage } : {}),
        ...(dto.minDefense !== undefined ? { joinMinDefense: dto.minDefense } : {}),
        ...(dto.minHp !== undefined ? { joinMinHp: dto.minHp } : {}),
        ...(dto.minEvasion !== undefined ? { joinMinEvasion: dto.minEvasion } : {}),
        ...(dto.allowedRaces !== undefined ? { joinAllowedRaces: dto.allowedRaces } : {}),
      },
    });

    return this.getClan(acting.clanId, actingPlayerId);
  }

  async kickMember(actingPlayerId: string, targetPlayerId: string): Promise<void> {
    if (actingPlayerId === targetPlayerId) {
      throw new BadRequestException('Use leave instead of kicking yourself');
    }

    const acting = await this.prisma.clanMembership.findUnique({ where: { playerId: actingPlayerId } });
    if (!acting || acting.role === 'MEMBER') {
      throw new ForbiddenException('Only the leader or an officer may kick members');
    }

    const target = await this.prisma.clanMembership.findUnique({ where: { playerId: targetPlayerId } });
    if (!target || target.clanId !== acting.clanId) {
      throw new NotFoundException('Player is not in your clan');
    }
    if (target.role === 'LEADER') {
      throw new ForbiddenException('Cannot kick the leader');
    }
    if (acting.role === 'OFFICER' && target.role === 'OFFICER') {
      throw new ForbiddenException('Officers cannot kick other officers');
    }

    await this.prisma.clanMembership.delete({ where: { playerId: targetPlayerId } });
  }

  async setOfficerRole(actingPlayerId: string, targetPlayerId: string, promote: boolean): Promise<void> {
    const acting = await this.prisma.clanMembership.findUnique({ where: { playerId: actingPlayerId } });
    if (!acting || acting.role !== 'LEADER') {
      throw new ForbiddenException('Only the leader may change member roles');
    }

    const target = await this.prisma.clanMembership.findUnique({ where: { playerId: targetPlayerId } });
    if (!target || target.clanId !== acting.clanId) {
      throw new NotFoundException('Player is not in your clan');
    }
    if (target.role === 'LEADER') {
      throw new BadRequestException("Cannot change the leader's role");
    }

    await this.prisma.clanMembership.update({ where: { playerId: targetPlayerId }, data: { role: promote ? 'OFFICER' : 'MEMBER' } });
  }

  async transferLeadership(actingPlayerId: string, targetPlayerId: string): Promise<void> {
    if (actingPlayerId === targetPlayerId) {
      throw new BadRequestException('Already the leader');
    }

    const acting = await this.prisma.clanMembership.findUnique({ where: { playerId: actingPlayerId } });
    if (!acting || acting.role !== 'LEADER') {
      throw new ForbiddenException('Only the leader may transfer leadership');
    }

    const target = await this.prisma.clanMembership.findUnique({ where: { playerId: targetPlayerId } });
    if (!target || target.clanId !== acting.clanId) {
      throw new NotFoundException('Player is not in your clan');
    }

    await this.prisma.$transaction([
      this.prisma.clanMembership.update({ where: { playerId: actingPlayerId }, data: { role: 'OFFICER' } }),
      this.prisma.clanMembership.update({ where: { playerId: targetPlayerId }, data: { role: 'LEADER' } }),
    ]);
  }

  async donate(playerId: string, dto: DonateDto): Promise<ClanDetailDto> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership) {
      throw new BadRequestException('NOT_IN_CLAN');
    }

    const metal = dto.metal ?? 0;
    const crystal = dto.crystal ?? 0;
    const credits = dto.credits ?? 0;
    if (metal <= 0 && crystal <= 0 && credits <= 0) {
      throw new BadRequestException('Donate a positive amount of at least one resource');
    }

    await this.prisma.$transaction(async (tx) => {
      const player = await this.economy.settleResources(playerId, tx);
      if (player.metal < metal || player.crystal < crystal || player.credits < credits) {
        throw new BadRequestException('NOT_ENOUGH_RESOURCES');
      }

      await tx.player.update({
        where: { id: playerId },
        data: { metal: { decrement: metal }, crystal: { decrement: crystal }, credits: { decrement: credits } },
      });
      await tx.clan.update({
        where: { id: membership.clanId },
        data: { treasuryMetal: { increment: metal }, treasuryCrystal: { increment: crystal }, treasuryCredits: { increment: credits } },
      });
      await tx.clanMembership.update({
        where: { playerId },
        data: {
          contributedMetal: { increment: metal },
          contributedCrystal: { increment: crystal },
          contributedCredits: { increment: credits },
        },
      });
    });

    return this.getClan(membership.clanId, playerId);
  }

  async upgradeClanBuilding(actingPlayerId: string, buildingKey: string): Promise<ClanDetailDto> {
    const acting = await this.prisma.clanMembership.findUnique({ where: { playerId: actingPlayerId } });
    if (!acting || acting.role === 'MEMBER') {
      throw new ForbiddenException('Only the leader or an officer may upgrade clan buildings');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.ensureClanBuildingsExist(acting.clanId, tx);
      await this.finalizeCompletedClanBuildings(acting.clanId, tx);

      const buildingType = await tx.clanBuildingType.findUnique({ where: { key: buildingKey } });
      if (!buildingType) {
        throw new NotFoundException('Unknown clan building');
      }

      const building = await tx.clanBuilding.findUniqueOrThrow({
        where: { clanId_clanBuildingTypeId: { clanId: acting.clanId, clanBuildingTypeId: buildingType.id } },
      });
      if (building.constructionEndsAt) {
        throw new BadRequestException('Building is already under construction');
      }

      const nextLevelCost = await tx.clanBuildingLevelCost.findUnique({
        where: { clanBuildingTypeId_level: { clanBuildingTypeId: buildingType.id, level: building.level + 1 } },
      });
      if (!nextLevelCost) {
        throw new BadRequestException('Building is already at max level');
      }

      const clan = await tx.clan.findUniqueOrThrow({ where: { id: acting.clanId } });
      if (clan.treasuryMetal < nextLevelCost.metalCost || clan.treasuryCrystal < nextLevelCost.crystalCost || clan.treasuryCredits < nextLevelCost.creditsCost) {
        throw new BadRequestException('NOT_ENOUGH_TREASURY');
      }

      await tx.clan.update({
        where: { id: acting.clanId },
        data: {
          treasuryMetal: { decrement: nextLevelCost.metalCost },
          treasuryCrystal: { decrement: nextLevelCost.crystalCost },
          treasuryCredits: { decrement: nextLevelCost.creditsCost },
        },
      });

      await tx.clanBuilding.update({
        where: { id: building.id },
        data: { constructionEndsAt: new Date(Date.now() + nextLevelCost.constructionSeconds * 1000) },
      });
    });

    return this.getClan(acting.clanId, actingPlayerId);
  }

  async getMessages(clanId: string, playerId: string): Promise<ClanMessageDto[]> {
    await this.assertMembership(clanId, playerId);

    const messages = await this.prisma.clanMessage.findMany({
      where: { clanId },
      include: { player: true },
      orderBy: { createdAt: 'desc' },
      take: GAME_BALANCE.clanChat.historyLimit,
    });
    return messages.reverse().map(toMessageDto);
  }

  async sendMessage(playerId: string, clanId: string, text: string): Promise<ClanMessageDto> {
    await this.assertMembership(clanId, playerId);

    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException('Message cannot be empty');
    }

    const lastMessage = await this.prisma.clanMessage.findFirst({
      where: { playerId },
      orderBy: { createdAt: 'desc' },
    });
    if (lastMessage) {
      const elapsedMs = Date.now() - lastMessage.createdAt.getTime();
      if (elapsedMs < GAME_BALANCE.clanChat.minSecondsBetweenMessages * 1000) {
        throw new BadRequestException('SENDING_TOO_FAST');
      }
    }

    const created = await this.prisma.clanMessage.create({
      data: { clanId, playerId, text: trimmed },
      include: { player: true },
    });
    return toMessageDto(created);
  }

  private async assertMembership(clanId: string, playerId: string): Promise<ClanMembership> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership || membership.clanId !== clanId) {
      throw new ForbiddenException('NOT_A_MEMBER_OF_THIS_CLAN');
    }
    return membership;
  }

  private async ensureClanBuildingsExist(clanId: string, tx: Tx): Promise<void> {
    const buildingTypes = await tx.clanBuildingType.findMany();
    for (const buildingType of buildingTypes) {
      await tx.clanBuilding.upsert({
        where: { clanId_clanBuildingTypeId: { clanId, clanBuildingTypeId: buildingType.id } },
        update: {},
        create: { clanId, clanBuildingTypeId: buildingType.id, level: 0 },
      });
    }
  }

  private async finalizeCompletedClanBuildings(clanId: string, tx: Tx): Promise<void> {
    const due = await tx.clanBuilding.findMany({ where: { clanId, constructionEndsAt: { lte: new Date() } } });
    for (const building of due) {
      await tx.clanBuilding.update({ where: { id: building.id }, data: { level: building.level + 1, constructionEndsAt: null } });
    }
  }

  private async loadClanFresh(clanId: string, tx: Tx = this.prisma): Promise<ClanWithDetails | null> {
    await this.ensureClanBuildingsExist(clanId, tx);
    await this.finalizeCompletedClanBuildings(clanId, tx);
    return this.loadClanRaw(clanId, tx);
  }

  private loadClanRaw(clanId: string, tx: Tx = this.prisma): Promise<ClanWithDetails | null> {
    return tx.clan.findUnique({ where: { id: clanId }, include: CLAN_INCLUDE });
  }
}

function effectiveMemberCap(clan: ClanWithDetails): number {
  const hall = clan.buildings.find((b) => b.clanBuildingType.bonusType === 'MEMBER_CAPACITY');
  const bonus = hall ? hall.level * hall.clanBuildingType.bonusPerLevel : 0;
  return clan.memberCap + Math.round(bonus);
}

/** Equipment deliberately excluded — checks the player's raw Core Attribute points only (see schema.prisma's comment on Clan.joinMinLevel). */
function meetsJoinRequirements(clan: Clan, player: Player): boolean {
  if (clan.joinAllowedRaces.length > 0 && !clan.joinAllowedRaces.includes(player.race)) return false;
  if (player.level < clan.joinMinLevel) return false;
  if (player.baseDamage < clan.joinMinDamage) return false;
  if (player.baseDefense < clan.joinMinDefense) return false;
  if (player.baseHp < clan.joinMinHp) return false;
  if (player.baseEvasion < clan.joinMinEvasion) return false;
  return true;
}

function toSummaryDto(clan: ClanWithDetails): ClanSummaryDto {
  const leader = clan.members.find((m) => m.role === 'LEADER');
  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    description: clan.description,
    memberCount: clan.members.length,
    memberCap: effectiveMemberCap(clan),
    leaderId: leader?.player.id ?? '',
    leaderUsername: leader?.player.username ?? '',
    treasury: { metal: clan.treasuryMetal, crystal: clan.treasuryCrystal, credits: clan.treasuryCredits },
    joinRequirements: {
      minLevel: clan.joinMinLevel,
      minAttributes: { damage: clan.joinMinDamage, defense: clan.joinMinDefense, hp: clan.joinMinHp, evasion: clan.joinMinEvasion },
      allowedRaces: clan.joinAllowedRaces,
    },
  };
}

function toBuildingStateDto(building: BuildingWithType): ClanBuildingStateDto {
  const nextLevelCost = building.clanBuildingType.levelCosts.find((cost) => cost.level === building.level + 1);
  return {
    key: building.clanBuildingType.key,
    nameKey: building.clanBuildingType.nameKey,
    descriptionKey: building.clanBuildingType.descriptionKey,
    bonusType: building.clanBuildingType.bonusType,
    bonusPerLevel: building.clanBuildingType.bonusPerLevel,
    iconAssetId: building.clanBuildingType.iconAssetId,
    level: building.level,
    maxLevel: building.clanBuildingType.maxLevel,
    constructionEndsAt: building.constructionEndsAt?.toISOString() ?? null,
    nextLevelCost: nextLevelCost
      ? {
          metalCost: nextLevelCost.metalCost,
          crystalCost: nextLevelCost.crystalCost,
          creditsCost: nextLevelCost.creditsCost,
          constructionSeconds: nextLevelCost.constructionSeconds,
        }
      : null,
  };
}

async function getActiveWarInfo(clanId: string, tx: Tx): Promise<ClanActiveWarDto | null> {
  const war = await tx.clanWar.findFirst({
    where: { status: 'ACTIVE', OR: [{ attackerClanId: clanId }, { defenderClanId: clanId }] },
    include: { attackerClan: true, defenderClan: true },
  });
  if (!war) {
    return null;
  }
  const opponent = war.attackerClanId === clanId ? war.defenderClan : war.attackerClan;
  return { opponentClanId: opponent.id, opponentClanTag: opponent.tag, opponentClanName: opponent.name, endsAt: war.endsAt.toISOString() };
}

async function toDetailDto(clan: ClanWithDetails, currentPlayerId: string, tx: Tx): Promise<ClanDetailDto> {
  const myMembership = clan.members.find((m) => m.playerId === currentPlayerId);
  const activeWar = await getActiveWarInfo(clan.id, tx);
  return {
    ...toSummaryDto(clan),
    createdAt: clan.createdAt.toISOString(),
    // Owner decision (2026-09-11): treasury stays private to members —
    // visible on getMyClan(), null on the public getClan().
    treasury: myMembership ? { metal: clan.treasuryMetal, crystal: clan.treasuryCrystal, credits: clan.treasuryCredits } : null,
    activeWar,
    members: clan.members
      .slice()
      .sort((a, b) => b.player.level - a.player.level)
      .map((m) => ({
        playerId: m.playerId,
        username: m.player.username,
        race: m.player.race,
        level: m.player.level,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        isCurrentPlayer: m.playerId === currentPlayerId,
        contributed: { metal: m.contributedMetal, crystal: m.contributedCrystal, credits: m.contributedCredits },
        online: Date.now() - m.player.lastActiveAt.getTime() < GAME_BALANCE.presence.onlineThresholdMinutes * 60_000,
        lastActiveAt: m.player.lastActiveAt.toISOString(),
      })),
    myRole: myMembership?.role ?? null,
    buildings: clan.buildings
      .slice()
      .sort((a, b) => a.clanBuildingType.key.localeCompare(b.clanBuildingType.key))
      .map(toBuildingStateDto),
  };
}

function toMessageDto(message: ClanMessage & { player: Player }): ClanMessageDto {
  return {
    id: message.id,
    playerId: message.playerId,
    username: message.player.username,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
}
