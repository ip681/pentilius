import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BlockedPlayerDto, BlockStatusDto } from '@pentilius/shared';
import { Prisma, ReportTargetType } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

type Tx = PrismaService | Prisma.TransactionClient;

const DAY_MS = 24 * 3600_000;

/** Ids of every player `playerId` has blocked — used to hide their clan-chat messages. */
export async function getBlockedIds(playerId: string, tx: Tx): Promise<string[]> {
  const rows = await tx.playerBlock.findMany({ where: { blockerId: playerId }, select: { blockedId: true } });
  return rows.map((row) => row.blockedId);
}

/** True if either player has blocked the other. */
export async function isBlockedEitherWay(playerId: string, otherPlayerId: string, tx: Tx): Promise<boolean> {
  const block = await tx.playerBlock.findFirst({
    where: {
      OR: [
        { blockerId: playerId, blockedId: otherPlayerId },
        { blockerId: otherPlayerId, blockedId: playerId },
      ],
    },
  });
  return !!block;
}

/**
 * Blocking and reporting (owner decision, 2026-10-12 — app-store UGC
 * requirement). See schema.prisma's comments on PlayerBlock/PlayerReport.
 */
@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async listBlocked(playerId: string): Promise<BlockedPlayerDto[]> {
    const rows = await this.prisma.playerBlock.findMany({
      where: { blockerId: playerId },
      include: { blocked: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      playerId: row.blockedId,
      username: row.blocked.username,
      race: row.blocked.race,
      level: row.blocked.level,
      blockedAt: row.createdAt.toISOString(),
    }));
  }

  async getBlockStatus(playerId: string, otherPlayerId: string): Promise<BlockStatusDto> {
    const block = await this.prisma.playerBlock.findUnique({ where: { blockerId_blockedId: { blockerId: playerId, blockedId: otherPlayerId } } });
    return { blocked: !!block };
  }

  /** Blocks a player and ends any friendship or pending request between the two (so no DMs either). */
  async block(playerId: string, otherPlayerId: string): Promise<void> {
    if (playerId === otherPlayerId) {
      throw new BadRequestException('CANNOT_BLOCK_YOURSELF');
    }
    const other = await this.prisma.player.findUnique({ where: { id: otherPlayerId } });
    if (!other) {
      throw new NotFoundException('Player not found');
    }

    await this.prisma.$transaction([
      this.prisma.playerBlock.upsert({
        where: { blockerId_blockedId: { blockerId: playerId, blockedId: otherPlayerId } },
        update: {},
        create: { blockerId: playerId, blockedId: otherPlayerId },
      }),
      this.prisma.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: playerId, addresseeId: otherPlayerId },
            { requesterId: otherPlayerId, addresseeId: playerId },
          ],
        },
      }),
    ]);
  }

  async unblock(playerId: string, otherPlayerId: string): Promise<void> {
    await this.prisma.playerBlock.deleteMany({ where: { blockerId: playerId, blockedId: otherPlayerId } });
  }

  /**
   * Files a report. The content snapshot is read from the database here — the
   * client only says WHAT it reports, never what it said — and only content the
   * reporter could actually see can be reported.
   */
  async createReport(reporterId: string, dto: CreateReportDto): Promise<void> {
    const limits = GAME_BALANCE.moderation;
    const reporter = await this.prisma.player.findUniqueOrThrow({ where: { id: reporterId } });

    if (reporter.reportingSuspendedUntil && reporter.reportingSuspendedUntil.getTime() > Date.now()) {
      throw new ForbiddenException('REPORTING_SUSPENDED');
    }
    const accountAgeDays = (Date.now() - reporter.createdAt.getTime()) / DAY_MS;
    if (accountAgeDays < limits.minAccountAgeDays && reporter.level < limits.minLevel) {
      throw new ForbiddenException('REPORTING_NOT_YET_ALLOWED');
    }

    const [lastReport, reportsToday] = await Promise.all([
      this.prisma.playerReport.findFirst({ where: { reporterId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.playerReport.count({ where: { reporterId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } }),
    ]);
    if (lastReport && Date.now() - lastReport.createdAt.getTime() < limits.secondsBetweenReports * 1000) {
      throw new BadRequestException('REPORTING_TOO_FAST');
    }
    if (reportsToday >= limits.reportsPerDay) {
      throw new BadRequestException('REPORT_DAILY_LIMIT');
    }

    const target = await this.resolveTarget(reporterId, dto.targetType, dto.targetId);

    const duplicate = await this.prisma.playerReport.findFirst({
      where: { reporterId, targetType: dto.targetType, targetId: dto.targetId, status: 'OPEN' },
    });
    if (duplicate) {
      throw new BadRequestException('ALREADY_REPORTED');
    }

    const comment = dto.comment?.trim().slice(0, limits.maxCommentLength) || null;
    await this.prisma.playerReport.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        targetPlayerId: target.playerId,
        targetClanId: target.clanId,
        contentSnapshot: target.snapshot,
        reason: dto.reason,
        comment,
      },
    });
  }

  private async resolveTarget(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<{ playerId: string | null; clanId: string | null; snapshot: string }> {
    if (targetType === 'PLAYER') {
      if (targetId === reporterId) throw new BadRequestException('CANNOT_REPORT_YOURSELF');
      const player = await this.prisma.player.findUnique({ where: { id: targetId } });
      if (!player) throw new NotFoundException('Player not found');
      return { playerId: player.id, clanId: null, snapshot: player.bio ? `${player.username}\n${player.bio}` : player.username };
    }

    if (targetType === 'CLAN') {
      const clan = await this.prisma.clan.findUnique({ where: { id: targetId } });
      if (!clan) throw new NotFoundException('Clan not found');
      return { playerId: null, clanId: clan.id, snapshot: `[${clan.tag}] ${clan.name}${clan.description ? `\n${clan.description}` : ''}` };
    }

    if (targetType === 'CLAN_MESSAGE') {
      const message = await this.prisma.clanMessage.findUnique({ where: { id: targetId } });
      if (!message) throw new NotFoundException('Message not found');
      if (message.playerId === reporterId) throw new BadRequestException('CANNOT_REPORT_YOURSELF');
      // Only a current member of that clan can have seen the message.
      const membership = await this.prisma.clanMembership.findUnique({ where: { playerId: reporterId } });
      if (!membership || membership.clanId !== message.clanId) throw new ForbiddenException('NOT_A_MEMBER_OF_THIS_CLAN');
      return { playerId: message.playerId, clanId: message.clanId, snapshot: message.text };
    }

    // DIRECT_MESSAGE — only the recipient can report it.
    const message = await this.prisma.directMessage.findUnique({ where: { id: targetId } });
    if (!message || message.recipientId !== reporterId) throw new NotFoundException('Message not found');
    return { playerId: message.senderId, clanId: null, snapshot: message.text };
  }
}
