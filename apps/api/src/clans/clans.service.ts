import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClanDetailDto, ClanSummaryDto, MyClanResponseDto } from '@pentilius/shared';
import { Clan, ClanMembership, Player, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClanDto } from './dto/create-clan.dto';

type Tx = PrismaService | Prisma.TransactionClient;
type ClanWithMembers = Clan & { members: (ClanMembership & { player: Player })[] };

/**
 * Clans (instructions/GAME_SYSTEMS.md, LOCKED: "Clans are central"). This is
 * an M4 foundation — create/join/leave/roles only. Clan buildings/resources,
 * a member-capacity building, clan-scoped boss hunts and clan-vs-clan systems
 * are deliberately out of scope here (instructions/OPEN_DECISIONS.md: member
 * cap, roles, clan building list, contribution rules and clan-war rules are
 * all UNDEFINED). Joining is open — owner decision, mirroring the Boss Hunts
 * precedent — there is no invite/request model.
 */
@Injectable()
export class ClansService {
  constructor(private readonly prisma: PrismaService) {}

  async listClans(): Promise<ClanSummaryDto[]> {
    const clans = await this.prisma.clan.findMany({
      include: { members: { include: { player: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return clans.map(toSummaryDto);
  }

  async getClan(clanId: string, currentPlayerId: string): Promise<ClanDetailDto> {
    const clan = await this.loadClan(clanId);
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
    const clan = await this.loadClan(membership.clanId);
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
      const clan = await tx.clan.findUnique({ where: { id: clanId }, include: { members: true } });
      if (!clan) {
        throw new NotFoundException('Clan not found');
      }
      if (clan.members.length >= clan.memberCap) {
        throw new BadRequestException('CLAN_FULL');
      }

      await tx.clanMembership.create({ data: { clanId, playerId, role: 'MEMBER' } });
      const full = await this.loadClan(clanId, tx);
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
      this.prisma.clan.delete({ where: { id: membership.clanId } }),
    ]);
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

  private loadClan(clanId: string, tx: Tx = this.prisma): Promise<ClanWithMembers | null> {
    return tx.clan.findUnique({ where: { id: clanId }, include: { members: { include: { player: true } } } });
  }
}

function toSummaryDto(clan: ClanWithMembers): ClanSummaryDto {
  const leader = clan.members.find((m) => m.role === 'LEADER');
  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    description: clan.description,
    memberCount: clan.members.length,
    memberCap: clan.memberCap,
    leaderUsername: leader?.player.username ?? '',
  };
}

function toDetailDto(clan: ClanWithMembers, currentPlayerId: string): ClanDetailDto {
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
      })),
    myRole: myMembership?.role ?? null,
  };
}
