import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminSupportTicketDetailDto, AdminSupportTicketsDto, SupportCategoryValue, SupportStatusValue, SupportTicketDto } from '@pentilius/shared';
import { Prisma, SupportCategory, SupportMessage, SupportStatus, SupportTicket } from '@prisma/client';
import { AdminJwtPayload } from '../admin/admin-jwt-payload.interface';
import { GAME_BALANCE } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';

type TicketWithMessages = SupportTicket & { messages: SupportMessage[] };

/**
 * "Contact the team" (owner decision, 2026-10-13): a player opens a
 * conversation (idea / bug / question / other) and replies in it until staff
 * close it. Every moderator and admin sees every conversation (one shared
 * inbox). Staff replies reach the player anonymously as "the Pentilius team";
 * the staff author is stored and shown only in godmaster.
 */
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- player ----------

  async listMine(playerId: string): Promise<SupportTicketDto[]> {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { playerId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    });
    return tickets.map(toPlayerTicketDto);
  }

  async create(playerId: string, category: SupportCategory, rawText: string): Promise<SupportTicketDto[]> {
    const text = cleanText(rawText);
    const limits = GAME_BALANCE.support;
    const [today, open] = await Promise.all([
      this.prisma.supportTicket.count({ where: { playerId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      this.prisma.supportTicket.count({ where: { playerId, status: { not: 'CLOSED' } } }),
    ]);
    if (today >= limits.maxNewPerDay) throw new BadRequestException('SUPPORT_DAILY_LIMIT');
    if (open >= limits.maxOpen) throw new BadRequestException('SUPPORT_OPEN_LIMIT');

    await this.prisma.supportTicket.create({
      data: { playerId, category, messages: { create: { fromStaff: false, text } } },
    });
    return this.listMine(playerId);
  }

  async replyAsPlayer(playerId: string, ticketId: string, rawText: string): Promise<SupportTicketDto[]> {
    const text = cleanText(rawText);
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, playerId },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: GAME_BALANCE.support.maxUnansweredMessages } },
    });
    if (!ticket) throw new NotFoundException('TICKET_NOT_FOUND');
    if (ticket.status === 'CLOSED') throw new BadRequestException('TICKET_CLOSED');
    // Anti-flood: only so many player messages in a row before staff answer.
    if (ticket.messages.length >= GAME_BALANCE.support.maxUnansweredMessages && ticket.messages.every((m) => !m.fromStaff)) {
      throw new BadRequestException('SUPPORT_WAIT_FOR_REPLY');
    }
    await this.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'OPEN', messages: { create: { fromStaff: false, text } } },
    });
    return this.listMine(playerId);
  }

  async markRead(playerId: string, ticketId: string): Promise<void> {
    await this.prisma.supportTicket.updateMany({ where: { id: ticketId, playerId, playerUnread: true }, data: { playerUnread: false } });
  }

  async hasUnread(playerId: string): Promise<boolean> {
    return (await this.prisma.supportTicket.count({ where: { playerId, playerUnread: true } })) > 0;
  }

  // ---------- staff (godmaster) ----------

  async listForStaff(status?: SupportStatus, category?: SupportCategory): Promise<AdminSupportTicketsDto> {
    const [tickets, openCount] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where: { ...(status ? { status } : {}), ...(category ? { category } : {}) },
        include: {
          player: { select: { username: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    ]);
    return {
      openCount,
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        playerId: ticket.playerId,
        username: ticket.player.username,
        category: ticket.category as SupportCategoryValue,
        status: ticket.status as SupportStatusValue,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        messageCount: ticket._count.messages,
        lastMessage: ticket.messages[0]?.text.slice(0, 160) ?? '',
        lastFromStaff: ticket.messages[0]?.fromStaff ?? false,
      })),
    };
  }

  async getForStaff(ticketId: string): Promise<AdminSupportTicketDetailDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { player: { select: { username: true } }, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundException('TICKET_NOT_FOUND');
    return {
      id: ticket.id,
      playerId: ticket.playerId,
      username: ticket.player.username,
      category: ticket.category as SupportCategoryValue,
      status: ticket.status as SupportStatusValue,
      createdAt: ticket.createdAt.toISOString(),
      messages: ticket.messages.map((m) => ({
        id: m.id,
        fromStaff: m.fromStaff,
        staffUsername: m.adminUsername,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async replyAsStaff(ticketId: string, rawText: string, admin: AdminJwtPayload): Promise<AdminSupportTicketDetailDto> {
    const text = cleanText(rawText);
    await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId }, include: { player: { select: { username: true } } } });
      if (!ticket) throw new NotFoundException('TICKET_NOT_FOUND');
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          // Replying to a closed conversation reopens it as answered.
          status: 'ANSWERED',
          playerUnread: true,
          messages: { create: { fromStaff: true, adminUserId: admin.sub, adminUsername: admin.username, text } },
        },
      });
      await logStaffAction(tx, admin, 'SUPPORT_REPLY', ticket.playerId, ticket.player.username, { ticketId });
    });
    return this.getForStaff(ticketId);
  }

  async setStatusAsStaff(ticketId: string, closed: boolean, admin: AdminJwtPayload): Promise<AdminSupportTicketDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId }, include: { player: { select: { username: true } } } });
      if (!ticket) throw new NotFoundException('TICKET_NOT_FOUND');
      await tx.supportTicket.update({ where: { id: ticketId }, data: { status: closed ? 'CLOSED' : 'OPEN' } });
      await logStaffAction(tx, admin, closed ? 'SUPPORT_CLOSE' : 'SUPPORT_REOPEN', ticket.playerId, ticket.player.username, { ticketId });
    });
    return this.getForStaff(ticketId);
  }
}

function cleanText(raw: string): string {
  const text = (raw ?? '').trim().slice(0, GAME_BALANCE.support.maxMessageLength);
  if (!text) throw new BadRequestException('EMPTY_MESSAGE');
  return text;
}

/** Player view — staff messages carry no name (owner decision: anonymous for now). */
function toPlayerTicketDto(ticket: TicketWithMessages): SupportTicketDto {
  return {
    id: ticket.id,
    category: ticket.category as SupportCategoryValue,
    status: ticket.status as SupportStatusValue,
    unread: ticket.playerUnread,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    messages: ticket.messages.map((m) => ({ id: m.id, fromStaff: m.fromStaff, text: m.text, createdAt: m.createdAt.toISOString() })),
  };
}

async function logStaffAction(
  tx: Prisma.TransactionClient,
  admin: AdminJwtPayload,
  actionType: 'SUPPORT_REPLY' | 'SUPPORT_CLOSE' | 'SUPPORT_REOPEN',
  playerId: string,
  username: string,
  details: Record<string, unknown>,
): Promise<void> {
  await tx.adminActionLog.create({
    data: {
      adminId: admin.sub,
      adminUsername: admin.username,
      actionType,
      targetPlayerId: playerId,
      targetUsername: username,
      details: details as Prisma.InputJsonValue,
    },
  });
}
