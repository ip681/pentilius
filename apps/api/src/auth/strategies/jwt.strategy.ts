import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { GAME_BALANCE } from '../../config/game-config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Checked on every authenticated request (not just login) so an
    // admin-issued ban takes effect immediately against an already-active
    // session, not only against a future login attempt.
    const player = await this.prisma.player.findUnique({ where: { id: payload.sub }, select: { bannedUntil: true } });
    if (player?.bannedUntil && player.bannedUntil > new Date()) {
      throw new UnauthorizedException('PLAYER_BANNED');
    }

    await this.touchLastActive(payload.sub).catch(() => undefined);
    return payload;
  }

  // Throttled: only actually writes when the recorded timestamp is stale, so
  // this doesn't add a write to every single authenticated request.
  private async touchLastActive(playerId: string): Promise<void> {
    const cutoff = new Date(Date.now() - GAME_BALANCE.presence.activityUpdateThrottleSeconds * 1000);
    await this.prisma.player.updateMany({
      where: { id: playerId, lastActiveAt: { lt: cutoff } },
      data: { lastActiveAt: new Date() },
    });
  }
}
