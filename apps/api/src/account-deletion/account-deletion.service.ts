import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AccountDeletionCodeDto, AccountDeletionStatusDto, DELETED_PLAYER_PREFIX } from '@pentilius/shared';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ClansService } from '../clans/clans.service';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 3600_000;
// No 0/O/1/I/L — easy to read and retype from the screen.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60_000;
// How often the background job looks for deletions that came due.
const PURGE_INTERVAL_MS = 10 * 60_000;

/**
 * Account deletion (owner decision, 2026-10-12 — app-store requirement).
 * See schema.prisma's comment on Player.deletionScheduledFor. Banned players
 * can't log in to use this — they request deletion via the support email.
 */
@Injectable()
export class AccountDeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clans: ClansService,
  ) {}

  onModuleInit(): void {
    // No cron infrastructure in this project — a simple in-process interval is
    // enough: deletions only need to happen "around" their scheduled time.
    this.timer = setInterval(() => void this.purgeDue(), PURGE_INTERVAL_MS);
    this.timer.unref?.();
    setTimeout(() => void this.purgeDue(), 30_000).unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async getStatus(playerId: string): Promise<AccountDeletionStatusDto> {
    const [player, graceDays] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId }, select: { deletionScheduledFor: true } }),
      this.getGraceDays(),
    ]);
    return { scheduledFor: player.deletionScheduledFor?.toISOString() ?? null, graceDays };
  }

  /** Issues a fresh one-time code the player must retype to confirm — shown on screen, valid 10 minutes. */
  async issueCode(playerId: string): Promise<AccountDeletionCodeDto> {
    const raw = Array.from(crypto.randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    await this.prisma.player.update({
      where: { id: playerId },
      data: { deletionCode: raw, deletionCodeExpiresAt: new Date(Date.now() + CODE_TTL_MS) },
    });
    return { code: `${raw.slice(0, 3)}-${raw.slice(3)}` };
  }

  async requestDeletion(playerId: string, password: string, code: string): Promise<AccountDeletionStatusDto> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.deletionScheduledFor) {
      throw new BadRequestException('DELETION_ALREADY_SCHEDULED');
    }
    if (!(await bcrypt.compare(password, player.passwordHash))) {
      throw new BadRequestException('WRONG_PASSWORD');
    }
    const typed = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!player.deletionCode || !player.deletionCodeExpiresAt || player.deletionCodeExpiresAt.getTime() < Date.now() || typed !== player.deletionCode) {
      throw new BadRequestException('WRONG_DELETION_CODE');
    }

    const graceDays = await this.getGraceDays();
    const scheduledFor = new Date(Date.now() + graceDays * DAY_MS);
    await this.prisma.player.update({
      where: { id: playerId },
      data: { deletionScheduledFor: scheduledFor, deletionCode: null, deletionCodeExpiresAt: null },
    });
    return { scheduledFor: scheduledFor.toISOString(), graceDays };
  }

  async cancelDeletion(playerId: string): Promise<AccountDeletionStatusDto> {
    await this.prisma.player.update({ where: { id: playerId }, data: { deletionScheduledFor: null } });
    return { scheduledFor: null, graceDays: await this.getGraceDays() };
  }

  async getGraceDays(): Promise<number> {
    const settings = await this.prisma.gameSettings.findUnique({ where: { id: 1 } });
    return settings?.accountDeletionGraceDays ?? 3;
  }

  /** Anonymizes every account whose grace period has ended. Errors on one account don't stop the rest. */
  async purgeDue(): Promise<void> {
    const due = await this.prisma.player.findMany({
      where: { deletionScheduledFor: { lte: new Date() }, deletedAt: null },
      select: { id: true },
    });
    for (const { id } of due) {
      try {
        await this.anonymize(id);
      } catch (err) {
        this.logger.error(`Account deletion failed for ${id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /**
   * Wipes personal data and leaves an anonymous row behind (owner decision):
   * every history record that points at this player keeps working and shows
   * "Deleted player". Clan donations, Core points, battle/war/market history
   * and clan-chat messages all stay.
   */
  private async anonymize(playerId: string): Promise<void> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });

    // Leave the clan first through the normal path, so a leader hands off
    // leadership (or a solo clan disbands) exactly like a manual leave.
    const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
    if (membership) {
      await this.clans.leaveClan(playerId);
    }

    const marker = `${DELETED_PLAYER_PREFIX}${playerId.replace(/-/g, '').slice(0, 10)}`;
    const graceDays = await this.getGraceDays();
    const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    await this.prisma.$transaction(async (tx) => {
      // Personal state — gone. (Active market listings go with their items.)
      await tx.itemInstance.deleteMany({ where: { playerId } });
      await tx.playerBuilding.deleteMany({ where: { playerId } });
      await tx.playerResearch.deleteMany({ where: { playerId } });
      await tx.playerExpedition.deleteMany({ where: { playerId } });
      await tx.friendship.deleteMany({ where: { OR: [{ requesterId: playerId }, { addresseeId: playerId }] } });
      await tx.directMessage.deleteMany({ where: { OR: [{ senderId: playerId }, { recipientId: playerId }] } });
      await tx.playerBlock.deleteMany({ where: { OR: [{ blockerId: playerId }, { blockedId: playerId }] } });
      await tx.playerReport.deleteMany({ where: { reporterId: playerId } });
      await tx.supportTicket.deleteMany({ where: { playerId } });
      await tx.pushSubscription.deleteMany({ where: { playerId } });
      await tx.pushDispatch.deleteMany({ where: { playerId } });
      await tx.emailToken.deleteMany({ where: { playerId } });
      // Free their seat in any boss formation that hasn't resolved yet; resolved ones stay as history.
      await tx.bossFormationSlot.updateMany({
        where: { playerId, formation: { status: 'OPEN' } },
        data: { playerId: null, joinedAt: null },
      });

      await tx.player.update({
        where: { id: playerId },
        data: {
          username: marker,
          email: `${marker.replace(/~/g, '')}@deleted.invalid`,
          passwordHash: unusablePasswordHash,
          bio: null,
          preferredLocale: null,
          metal: 0,
          crystal: 0,
          credits: 0,
          bannedUntil: null,
          banReason: null,
          reportingSuspendedUntil: null,
          deletionScheduledFor: null,
          deletionCode: null,
          deletionCodeExpiresAt: null,
          deletedAt: new Date(),
        },
      });

      await tx.accountDeletionLog.create({
        // requestedAt = scheduled time minus the grace period in force now (close enough for a support log).
        data: { playerId, username: player.username, requestedAt: new Date((player.deletionScheduledFor ?? new Date()).getTime() - graceDays * DAY_MS) },
      });
    });
    this.logger.log(`Account deleted: ${player.username} (${playerId})`);
  }
}
