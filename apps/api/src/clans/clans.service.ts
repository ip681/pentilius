import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClanBuildingStateDto, ClanDetailDto, ClanSummaryDto, MyClanResponseDto } from '@pentilius/shared';
import { Clan, ClanBuilding, ClanBuildingLevelCost, ClanBuildingType, ClanMembership, Player, Prisma } from '@prisma/client';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClanDto } from './dto/create-clan.dto';
import { DonateDto } from './dto/donate.dto';
import { UpdateClanDto } from './dto/update-clan.dto';

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

  async getClan(clanId: string, currentPlayerId: string): Promise<ClanDetailDto> {
    const clan = await this.loadClanFresh(clanId);
    if (!clan) {
      throw new NotFoundException('Clan not found');
    }
    return toDetailDto(clan, currentPlayerId);
  }

  async getMyClan(playerId: string): Promise<MyClanResponseDto> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (!membership) {
      return { clan: null };
    }
    const clan = await this.loadClanFresh(membership.clanId);
    return { clan: clan ? toDetailDto(clan, playerId) : null };
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

      await tx.clanMembership.create({ data: { clanId, playerId, role: 'MEMBER' } });
      const full = await this.loadClanRaw(clanId, tx);
      return toDetailDto(full!, playerId);
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

function toDetailDto(clan: ClanWithDetails, currentPlayerId: string): ClanDetailDto {
  const myMembership = clan.members.find((m) => m.playerId === currentPlayerId);
  return {
    ...toSummaryDto(clan),
    createdAt: clan.createdAt.toISOString(),
    members: clan.members
      .slice()
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((m) => ({
        playerId: m.playerId,
        username: m.player.username,
        race: m.player.race,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        isCurrentPlayer: m.playerId === currentPlayerId,
        contributed: { metal: m.contributedMetal, crystal: m.contributedCrystal, credits: m.contributedCredits },
      })),
    myRole: myMembership?.role ?? null,
    buildings: clan.buildings
      .slice()
      .sort((a, b) => a.clanBuildingType.key.localeCompare(b.clanBuildingType.key))
      .map(toBuildingStateDto),
  };
}
