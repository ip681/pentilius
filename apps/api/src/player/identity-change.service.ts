import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { IdentityChangeStatusDto } from '@pentilius/shared';
import { IdentityChangeKind, Prisma, Race } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { ContentFilterService } from '../moderation/content-filter.service';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether another player gave up this name recently (owner decision,
 * 2026-10-27): for identityChange.oldNameReservedDays nobody else can take
 * it — not by renaming, not by registering. Its old owner can.
 */
export async function isUsernameReserved(db: Db, username: string, exceptPlayerId?: string): Promise<boolean> {
  const days = GAME_BALANCE.identityChange.oldNameReservedDays;
  if (days <= 0) return false;
  const row = await db.playerIdentityChange.findFirst({
    where: {
      kind: 'NAME',
      oldValue: { equals: username, mode: 'insensitive' },
      createdAt: { gte: new Date(Date.now() - days * DAY_MS) },
      ...(exceptPlayerId ? { playerId: { not: exceptPlayerId } } : {}),
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Name and race changes bought in Settings (owner decision, 2026-10-27).
 * Seen only by staff (the history in godmaster). Paying and changing happen
 * in one transaction. The race picked at the start of a season is separate
 * (PlayerService.chooseRace) and is free.
 */
@Injectable()
export class IdentityChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentFilter: ContentFilterService,
  ) {}

  async getStatus(playerId: string): Promise<IdentityChangeStatusDto> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId }, select: { username: true, race: true, credits: true } });
    const [nameAt, raceAt] = await Promise.all([this.availableAt(playerId, 'NAME', this.prisma), this.availableAt(playerId, 'RACE', this.prisma)]);
    const config = GAME_BALANCE.identityChange;
    return {
      username: player.username,
      race: player.race,
      credits: player.credits,
      nameCredits: config.nameCredits,
      raceCredits: config.raceCredits,
      nameAvailableAt: nameAt?.toISOString() ?? null,
      raceAvailableAt: raceAt?.toISOString() ?? null,
    };
  }

  async changeName(playerId: string, username: string): Promise<IdentityChangeStatusDto> {
    // The same rules as registering: the format (the DTO), the content filter, unique, not reserved.
    await this.contentFilter.assertClean(username);
    const price = GAME_BALANCE.identityChange.nameCredits;
    await this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { username: true } });
      if (player.username === username) throw new BadRequestException('SAME_NAME');
      if (await this.availableAt(playerId, 'NAME', tx)) throw new BadRequestException('CHANGE_COOLDOWN');
      if (await tx.player.findUnique({ where: { username }, select: { id: true } })) throw new ConflictException('USERNAME_TAKEN');
      if (await isUsernameReserved(tx, username, playerId)) throw new ConflictException('USERNAME_RESERVED');
      await this.pay(playerId, price, tx);
      try {
        await tx.player.update({ where: { id: playerId }, data: { username } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('USERNAME_TAKEN');
        throw error;
      }
      await tx.playerIdentityChange.create({ data: { playerId, kind: 'NAME', oldValue: player.username, newValue: username, creditsPaid: price } });
    });
    return this.getStatus(playerId);
  }

  /** Items locked to another race come off (they stay in the inventory). No other limits (owner decision, 2026-10-27). */
  async changeRace(playerId: string, race: Race): Promise<IdentityChangeStatusDto> {
    const price = GAME_BALANCE.identityChange.raceCredits;
    const unequipped = await this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { race: true, needsRaceSelection: true } });
      // A new season's free pick comes first.
      if (player.needsRaceSelection) throw new BadRequestException('RACE_SELECTION_PENDING');
      if (player.race === race) throw new BadRequestException('SAME_RACE');
      if (await this.availableAt(playerId, 'RACE', tx)) throw new BadRequestException('CHANGE_COOLDOWN');
      await this.pay(playerId, price, tx);
      await tx.player.update({ where: { id: playerId }, data: { race } });
      const off = await tx.itemInstance.updateMany({
        where: { playerId, equippedSlot: { not: null }, race: { not: null }, NOT: { race } },
        data: { equippedSlot: null },
      });
      await tx.playerIdentityChange.create({ data: { playerId, kind: 'RACE', oldValue: player.race, newValue: race, creditsPaid: price } });
      return off.count;
    });
    return { ...(await this.getStatus(playerId)), unequipped };
  }

  /** Takes the price only if the Credits are there (a conditional write, safe against double clicks). */
  private async pay(playerId: string, price: number, tx: Prisma.TransactionClient): Promise<void> {
    if (price <= 0) return;
    const paid = await tx.player.updateMany({ where: { id: playerId, credits: { gte: price } }, data: { credits: { decrement: price } } });
    if (paid.count !== 1) throw new BadRequestException('NOT_ENOUGH_CREDITS');
  }

  /** When the next paid change of this kind is allowed; null = now. Staff renames don't count. */
  private async availableAt(playerId: string, kind: IdentityChangeKind, db: Db): Promise<Date | null> {
    const days = kind === 'NAME' ? GAME_BALANCE.identityChange.nameCooldownDays : GAME_BALANCE.identityChange.raceCooldownDays;
    if (days <= 0) return null;
    const last = await db.playerIdentityChange.findFirst({
      where: { playerId, kind, adminUsername: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!last) return null;
    const at = new Date(last.createdAt.getTime() + days * DAY_MS);
    return at.getTime() > Date.now() ? at : null;
  }
}
