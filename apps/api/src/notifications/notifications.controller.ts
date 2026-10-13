import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { NotificationSettingsDto } from '@pentilius/shared';
import { IsObject, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_TYPES, PushService, readNotificationSettings } from './push.service';

class PushKeysDto {
  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MaxLength(100)
  auth!: string;
}

class PushSubscriptionBodyDto {
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

class PushUnsubscribeDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}

class NotificationSettingsBodyDto {
  @IsObject()
  settings!: Record<string, unknown>;
}

/** Notification settings and Web Push subscriptions (owner decision, 2026-10-13). */
@Controller('player/me')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  @Get('notification-settings')
  async getSettings(@CurrentPlayer() currentPlayer: JwtPayload): Promise<{ settings: NotificationSettingsDto; pushPublicKey: string | null }> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: currentPlayer.sub }, select: { notificationSettings: true } });
    return { settings: readNotificationSettings(player.notificationSettings), pushPublicKey: this.push.publicKey };
  }

  @Post('notification-settings')
  async updateSettings(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: NotificationSettingsBodyDto): Promise<{ settings: NotificationSettingsDto; pushPublicKey: string | null }> {
    // Only known types, only booleans; anything else is ignored.
    const settings = Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, dto.settings[type] !== false]));
    await this.prisma.player.update({ where: { id: currentPlayer.sub }, data: { notificationSettings: settings } });
    return { settings: settings as NotificationSettingsDto, pushPublicKey: this.push.publicKey };
  }

  @Post('push-subscriptions')
  async subscribe(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: PushSubscriptionBodyDto): Promise<{ ok: true }> {
    await this.push.subscribe(currentPlayer.sub, dto.endpoint, dto.keys.p256dh, dto.keys.auth);
    return { ok: true };
  }

  @Post('push-subscriptions/remove')
  async unsubscribe(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: PushUnsubscribeDto): Promise<{ ok: true }> {
    await this.push.unsubscribe(currentPlayer.sub, dto.endpoint);
    return { ok: true };
  }
}
