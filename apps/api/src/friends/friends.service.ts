import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DirectMessageDto, FriendDto, FriendRequestDto, FriendRequestsDto, FriendshipStatusDto } from '@pentilius/shared';
import { Friendship, Player } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Friends list (owner decision, 2026-09-09) — step one toward friends-only
 * messaging later, deliberately built without any messaging model yet.
 * Mutual consent (request/accept) is the point: it's what makes a later
 * friends-only DM feature immune to the unwanted-message problem an earlier,
 * open chat design would have had.
 */
@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  async sendRequest(requesterId: string, addresseeId: string): Promise<void> {
    if (requesterId === addresseeId) {
      throw new BadRequestException('CANNOT_FRIEND_YOURSELF');
    }

    const addressee = await this.prisma.player.findUnique({ where: { id: addresseeId } });
    if (!addressee) {
      throw new NotFoundException('Player not found');
    }

    const existing = await this.findFriendshipBetween(requesterId, addresseeId);
    if (existing) {
      throw new BadRequestException(existing.status === 'ACCEPTED' ? 'ALREADY_FRIENDS' : 'REQUEST_ALREADY_EXISTS');
    }

    await this.prisma.friendship.create({ data: { requesterId, addresseeId } });
  }

  async acceptRequest(playerId: string, requestId: string): Promise<void> {
    const request = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!request || request.addresseeId !== playerId || request.status !== 'PENDING') {
      throw new NotFoundException('Friend request not found');
    }
    await this.prisma.friendship.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
  }

  /** Declining an incoming request and cancelling one you sent are the same action from either side of the row — just delete it. */
  async removeRequest(playerId: string, requestId: string): Promise<void> {
    const request = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!request || request.status !== 'PENDING' || (request.requesterId !== playerId && request.addresseeId !== playerId)) {
      throw new NotFoundException('Friend request not found');
    }
    await this.prisma.friendship.delete({ where: { id: requestId } });
  }

  async removeFriend(playerId: string, otherPlayerId: string): Promise<void> {
    const friendship = await this.findFriendshipBetween(playerId, otherPlayerId);
    if (!friendship || friendship.status !== 'ACCEPTED') {
      throw new NotFoundException('Friendship not found');
    }
    await this.prisma.friendship.delete({ where: { id: friendship.id } });
  }

  /** Most recent conversation first (owner decision, 2026-09-11) — see schema.prisma's comment on Friendship's read/unread fields. */
  async listFriends(playerId: string): Promise<FriendDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: playerId }, { addresseeId: playerId }] },
      include: { requester: true, addressee: true },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    });
    return rows.map((row) => {
      const isRequester = row.requesterId === playerId;
      const otherPlayer = isRequester ? row.addressee : row.requester;
      return toFriendDto(otherPlayer, hasUnread(row, isRequester));
    });
  }

  /** Cheap aggregate check for the TopBar indicator — see schema.prisma's comment on Friendship's read/unread fields. */
  async hasAnyUnread(playerId: string): Promise<boolean> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: playerId }, { addresseeId: playerId }], lastMessageAt: { not: null } },
      select: { requesterId: true, requesterLastReadAt: true, addresseeLastReadAt: true, lastMessageAt: true },
    });
    return rows.some((row) => hasUnread(row, row.requesterId === playerId));
  }

  async listRequests(playerId: string): Promise<FriendRequestsDto> {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.friendship.findMany({ where: { status: 'PENDING', addresseeId: playerId }, include: { requester: true } }),
      this.prisma.friendship.findMany({ where: { status: 'PENDING', requesterId: playerId }, include: { addressee: true } }),
    ]);
    return {
      incoming: incoming.map((row) => toFriendRequestDto(row, row.requester)),
      outgoing: outgoing.map((row) => toFriendRequestDto(row, row.addressee)),
    };
  }

  async getStatus(playerId: string, otherPlayerId: string): Promise<FriendshipStatusDto> {
    if (playerId === otherPlayerId) {
      return { status: 'NONE', requestId: null };
    }
    const friendship = await this.findFriendshipBetween(playerId, otherPlayerId);
    if (!friendship) return { status: 'NONE', requestId: null };
    if (friendship.status === 'ACCEPTED') return { status: 'FRIENDS', requestId: null };
    return { status: friendship.requesterId === playerId ? 'PENDING_SENT' : 'PENDING_RECEIVED', requestId: friendship.id };
  }

  private findFriendshipBetween(playerId: string, otherPlayerId: string): Promise<Friendship | null> {
    return this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: playerId, addresseeId: otherPlayerId },
          { requesterId: otherPlayerId, addresseeId: playerId },
        ],
      },
    });
  }

  async getConversation(playerId: string, otherPlayerId: string): Promise<DirectMessageDto[]> {
    const friendship = await this.assertFriends(playerId, otherPlayerId);

    // Mark read (owner decision, 2026-09-11) — viewing the conversation is
    // the whole "read" signal, no per-message tracking. See schema.prisma's
    // comment on Friendship's read/unread fields.
    const isRequester = friendship.requesterId === playerId;
    await this.prisma.friendship.update({
      where: { id: friendship.id },
      data: isRequester ? { requesterLastReadAt: new Date() } : { addresseeLastReadAt: new Date() },
    });

    const messages = await this.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: playerId, recipientId: otherPlayerId },
          { senderId: otherPlayerId, recipientId: playerId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: GAME_BALANCE.directMessages.historyLimit,
    });
    return messages.reverse().map(toDirectMessageDto);
  }

  async sendMessage(senderId: string, recipientId: string, text: string): Promise<DirectMessageDto> {
    const friendship = await this.assertFriends(senderId, recipientId);

    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException('Message cannot be empty');
    }

    const lastMessage = await this.prisma.directMessage.findFirst({
      where: { senderId },
      orderBy: { createdAt: 'desc' },
    });
    if (lastMessage) {
      const elapsedMs = Date.now() - lastMessage.createdAt.getTime();
      if (elapsedMs < GAME_BALANCE.directMessages.minSecondsBetweenMessages * 1000) {
        throw new BadRequestException('SENDING_TOO_FAST');
      }
    }

    const created = await this.prisma.directMessage.create({ data: { senderId, recipientId, text: trimmed } });

    // The sender has trivially "read" up to their own message — updating
    // their own side's read marker alongside lastMessageAt keeps them from
    // seeing their own conversation as unread.
    const isRequester = friendship.requesterId === senderId;
    await this.prisma.friendship.update({
      where: { id: friendship.id },
      data: {
        lastMessageAt: created.createdAt,
        ...(isRequester ? { requesterLastReadAt: created.createdAt } : { addresseeLastReadAt: created.createdAt }),
      },
    });

    return toDirectMessageDto(created);
  }

  private async assertFriends(playerId: string, otherPlayerId: string): Promise<Friendship> {
    const friendship = await this.findFriendshipBetween(playerId, otherPlayerId);
    if (!friendship || friendship.status !== 'ACCEPTED') {
      throw new BadRequestException('NOT_FRIENDS');
    }
    return friendship;
  }
}

/** See schema.prisma's comment on Friendship's read/unread fields. */
function hasUnread(
  row: { lastMessageAt: Date | null; requesterLastReadAt: Date | null; addresseeLastReadAt: Date | null },
  isRequester: boolean,
): boolean {
  if (!row.lastMessageAt) return false;
  const myLastReadAt = isRequester ? row.requesterLastReadAt : row.addresseeLastReadAt;
  return !myLastReadAt || row.lastMessageAt > myLastReadAt;
}

function toFriendDto(player: Player, hasUnreadMessages: boolean): FriendDto {
  return { id: player.id, username: player.username, race: player.race, level: player.level, hasUnread: hasUnreadMessages };
}

function toFriendRequestDto(row: Friendship, otherPlayer: Player): FriendRequestDto {
  return { id: row.id, playerId: otherPlayer.id, username: otherPlayer.username, race: otherPlayer.race, level: otherPlayer.level, createdAt: row.createdAt.toISOString() };
}

function toDirectMessageDto(message: { id: string; senderId: string; text: string; createdAt: Date }): DirectMessageDto {
  return { id: message.id, senderId: message.senderId, text: message.text, createdAt: message.createdAt.toISOString() };
}
