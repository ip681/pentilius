import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminJwtPayload } from '../admin-jwt-payload.interface';

// Named strategy ('admin-jwt', not the default 'jwt') with its own secret —
// completely independent from the player JwtStrategy, so a player token can
// never be accepted here and vice versa. See schema.prisma's AdminUser comment.
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('adminJwt.secret')!,
    });
  }

  /**
   * Re-checks the account on every request (owner decision, 2026-10-12): a
   * deactivated account, or a token issued before the last password reset /
   * role change (tokenVersion mismatch), is rejected immediately — so long-
   * lived sessions stay safe. The role comes from the database, not the token.
   */
  async validate(payload: AdminJwtPayload): Promise<AdminJwtPayload> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
    if (!admin || !admin.isActive || admin.tokenVersion !== (payload.ver ?? 0)) {
      throw new UnauthorizedException('ADMIN_SESSION_INVALID');
    }
    return { sub: admin.id, username: admin.username, role: admin.role, ver: admin.tokenVersion };
  }
}
