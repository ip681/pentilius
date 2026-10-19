import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GAME_BALANCE } from '../config/game-config';
import { countryOf } from '../payments/payment-country';
import { PrismaService } from '../prisma/prisma.service';

export type LoginEventKind = 'LOGIN' | 'REGISTER' | 'REFRESH';

const PURGE_INTERVAL_MS = 6 * 3600_000;

/**
 * Security record of logins (owner decision, 2026-10-19): when, from which
 * IP, country, device and browser — only to spot multi-accounts and ban
 * evasion, shown to staff in godmaster. Kept GAME_BALANCE.security.
 * loginRetentionDays (90), then deleted. Never used for automatic decisions
 * or bans. A session refresh is recorded only from a new address or after
 * refreshRecordHours, so staying logged in doesn't fill the table.
 */
@Injectable()
export class LoginEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoginEventsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.purge(), PURGE_INTERVAL_MS);
    this.timer.unref?.();
    setTimeout(() => void this.purge(), 60_000).unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Never throws — a failed record must not block a login. */
  async record(playerId: string, kind: LoginEventKind, ip: string | undefined, userAgent: string | undefined): Promise<void> {
    try {
      const address = cleanIp(ip);
      if (!address) return;
      if (kind === 'REFRESH') {
        const since = new Date(Date.now() - GAME_BALANCE.security.refreshRecordHours * 3600_000);
        const recent = await this.prisma.loginEvent.findFirst({ where: { playerId, ip: address, createdAt: { gte: since } }, select: { id: true } });
        if (recent) return;
      }
      const { device, browser } = parseUserAgent(userAgent);
      await this.prisma.loginEvent.create({ data: { playerId, kind, ip: address, country: countryOf(address), device, browser } });
    } catch (err) {
      this.logger.warn(`Login record failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async purge(): Promise<void> {
    const before = new Date(Date.now() - GAME_BALANCE.security.loginRetentionDays * 86_400_000);
    const { count } = await this.prisma.loginEvent.deleteMany({ where: { createdAt: { lt: before } } });
    if (count > 0) this.logger.log(`Deleted ${count} login records older than ${GAME_BALANCE.security.loginRetentionDays} days`);
  }
}

function cleanIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** A rough device type and browser name from the User-Agent — enough for staff to tell devices apart. */
export function parseUserAgent(ua: string | undefined): { device: string | null; browser: string | null } {
  if (!ua) return { device: null, browser: null };
  const device = /iPad|Tablet/i.test(ua) ? 'TABLET' : /Mobi|Android|iPhone/i.test(ua) ? 'MOBILE' : 'DESKTOP';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'other';
  return { device, browser };
}
