import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminJwtPayload } from '../admin-jwt-payload.interface';

// Named strategy ('admin-jwt', not the default 'jwt') with its own secret —
// completely independent from the player JwtStrategy, so a player token can
// never be accepted here and vice versa. See schema.prisma's AdminUser comment.
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('adminJwt.secret')!,
    });
  }

  async validate(payload: AdminJwtPayload): Promise<AdminJwtPayload> {
    return payload;
  }
}
