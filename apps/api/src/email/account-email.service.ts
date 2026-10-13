import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailTokenType, Player } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { GAME_BALANCE } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailLocale, renderEmail } from './email-templates';
import { EmailService } from './email.service';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Email confirmation and password reset (owner decision, 2026-10-13).
 * - Confirming the email is optional: the player plays right away and the
 *   Command Center reminds them until they confirm.
 * - "Forgot password" works whether or not the email is confirmed; a
 *   successful reset also counts as confirming it (the link proves ownership).
 * - Tokens are random, stored only as a hash, single-use and time-limited.
 * - Forgot-password never reveals whether an email is registered.
 */
@Injectable()
export class AccountEmailService {
  private readonly logger = new Logger(AccountEmailService.name);
  private readonly appBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.appBaseUrl = (config.get<string>('email.appBaseUrl') ?? 'https://pentilius.com').replace(/\/$/, '');
  }

  /** Sends the confirmation email (registration, or "send again"). */
  async sendVerification(player: Pick<Player, 'id' | 'email' | 'username' | 'emailVerifiedAt'>, locale: EmailLocale): Promise<void> {
    if (player.emailVerifiedAt) throw new BadRequestException('EMAIL_ALREADY_VERIFIED');
    await this.assertUnderHourlyLimit(player.id, 'VERIFY_EMAIL');
    const token = await this.createToken(player.id, 'VERIFY_EMAIL', GAME_BALANCE.email.verifyTokenHours * 60);
    const link = `${this.appBaseUrl}/${locale}/verify-email?token=${token}`;
    const mail = renderEmail(locale, 'verify', { username: player.username, link, logoUrl: `${this.appBaseUrl}/logo.png` });
    await this.email.send(player.email, mail.subject, mail.html, mail.text);
  }

  async resendVerification(playerId: string, locale: EmailLocale): Promise<void> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    await this.sendVerification(player, locale);
  }

  async verifyEmail(token: string): Promise<void> {
    const row = await this.consumeToken(token, 'VERIFY_EMAIL');
    await this.prisma.player.updateMany({ where: { id: row.playerId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  }

  /** Always "ok" for the caller — whether the email exists is never revealed. */
  async requestPasswordReset(emailAddress: string, locale: EmailLocale): Promise<void> {
    const player = await this.prisma.player.findFirst({ where: { email: { equals: emailAddress.trim(), mode: 'insensitive' } } });
    if (!player || player.deletedAt) return;
    try {
      await this.assertUnderHourlyLimit(player.id, 'PASSWORD_RESET');
    } catch {
      return; // Silently capped — same answer as for an unknown email.
    }
    // A new link replaces any older unused one.
    await this.prisma.emailToken.updateMany({ where: { playerId: player.id, type: 'PASSWORD_RESET', usedAt: null }, data: { usedAt: new Date() } });
    const token = await this.createToken(player.id, 'PASSWORD_RESET', GAME_BALANCE.email.resetTokenMinutes);
    const link = `${this.appBaseUrl}/${locale}/reset-password?token=${token}`;
    const mail = renderEmail(locale, 'reset', { username: player.username, link, logoUrl: `${this.appBaseUrl}/logo.png` });
    await this.email.send(player.email, mail.subject, mail.html, mail.text).catch((error) => {
      this.logger.error(`Password reset email failed for ${player.id}: ${(error as Error).message}`);
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const row = await this.consumeToken(token, 'PASSWORD_RESET');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.player.update({
      where: { id: row.playerId },
      // The reset link proves the player owns the email — count it as confirmed.
      data: { passwordHash, emailVerifiedAt: row.player.emailVerifiedAt ?? new Date() },
    });
  }

  private async createToken(playerId: string, type: EmailTokenType, validMinutes: number): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.prisma.emailToken.create({
      data: { playerId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + validMinutes * 60_000) },
    });
    return token;
  }

  /** Marks a valid token used (atomically) and returns it; otherwise INVALID_OR_EXPIRED_TOKEN. */
  private async consumeToken(token: string, type: EmailTokenType) {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { player: true } });
    if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date() || row.player.deletedAt) {
      throw new BadRequestException('INVALID_OR_EXPIRED_TOKEN');
    }
    const claimed = await this.prisma.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new BadRequestException('INVALID_OR_EXPIRED_TOKEN');
    return row;
  }

  private async assertUnderHourlyLimit(playerId: string, type: EmailTokenType): Promise<void> {
    const recent = await this.prisma.emailToken.count({
      where: { playerId, type, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
    });
    if (recent >= GAME_BALANCE.email.maxPerHour) throw new BadRequestException('TOO_MANY_EMAILS');
  }
}
