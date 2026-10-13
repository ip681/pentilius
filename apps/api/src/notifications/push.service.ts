import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationSettingsDto, NotificationType } from '@pentilius/shared';
import { Prisma } from '@prisma/client';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { pushText } from './push-texts';

export const NOTIFICATION_TYPES: NotificationType[] = ['ENERGY_FULL', 'CONSTRUCTION_DONE', 'RESEARCH_DONE', 'EXPEDITION_DONE', 'PVP_ATTACKED'];

/** Every type is on unless the player switched it off (stored as { TYPE: false }). */
export function readNotificationSettings(raw: Prisma.JsonValue | null | undefined): NotificationSettingsDto {
  const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, stored[type] !== false])) as NotificationSettingsDto;
}

/** Where a notification click takes the player (the locale prefix is added per player). */
const TARGET_PATH: Record<NotificationType, string> = {
  ENERGY_FULL: '/zones',
  CONSTRUCTION_DONE: '/base',
  RESEARCH_DONE: '/research',
  EXPEDITION_DONE: '/expeditions',
  PVP_ATTACKED: '/reports',
};

/**
 * Web Push (owner decision, 2026-10-13): notifications that reach the player
 * even with the game closed. The server decides what and when; this is just
 * the browser delivery channel, so a future app channel can sit beside it.
 * Uses our own VAPID keys (no paid service). Disabled when the keys are unset.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  readonly publicKey: string | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const publicKey = config.get<string>('push.publicKey');
    const privateKey = config.get<string>('push.privateKey');
    const subject = config.get<string>('push.subject') ?? 'mailto:support@pentilius.com';
    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
    } else {
      this.publicKey = null;
      this.logger.warn('VAPID keys not set — Web Push disabled');
    }
  }

  get enabled(): boolean {
    return this.publicKey !== null;
  }

  async subscribe(playerId: string, endpoint: string, p256dh: string, auth: string): Promise<void> {
    // One device = one endpoint; re-subscribing (or another account on the same browser) takes it over.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { playerId, p256dh, auth },
      create: { playerId, endpoint, p256dh, auth },
    });
  }

  async unsubscribe(playerId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { playerId, endpoint } });
  }

  /**
   * Sends one notification at most once per (player, type, refKey) — the
   * minute scanner and event hooks can both call this safely.
   */
  async sendOnce(playerId: string, type: NotificationType, refKey: string, params: Record<string, string> = {}): Promise<void> {
    if (!this.enabled) return;
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { notificationSettings: true, preferredLocale: true, deletedAt: true, pushSubscriptions: true },
    });
    if (!player || player.deletedAt || player.pushSubscriptions.length === 0) return;
    if (!readNotificationSettings(player.notificationSettings)[type]) return;

    try {
      await this.prisma.pushDispatch.create({ data: { playerId, type, refKey } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return; // already sent
      throw error;
    }

    const locale = player.preferredLocale === 'en' ? 'en' : 'bg';
    const text = pushText(locale, type, params);
    const payload = JSON.stringify({ ...text, tag: `${type}:${refKey}`, url: `/${locale}${TARGET_PATH[type]}` });

    await Promise.all(
      player.pushSubscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 6 * 60 * 60 });
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // 404/410: the browser dropped this subscription — forget it.
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
          } else {
            this.logger.warn(`Push to ${sub.id} failed: ${status ?? (error as Error).message}`);
          }
        }
      }),
    );
  }
}
