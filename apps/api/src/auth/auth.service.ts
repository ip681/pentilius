import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthResponse, AuthTokens } from '@pentilius/shared';
import { Race } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt-payload.interface';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const [existingEmail, existingUsername] = await Promise.all([
      this.prisma.player.findUnique({ where: { email: dto.email } }),
      this.prisma.player.findUnique({ where: { username: dto.username } }),
    ]);
    if (existingEmail) {
      throw new ConflictException('EMAIL_TAKEN');
    }
    if (existingUsername) {
      throw new ConflictException('USERNAME_TAKEN');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const player = await this.prisma.$transaction(async (tx) => {
      const created = await tx.player.create({
        data: { email: dto.email, username: dto.username, passwordHash, race: dto.race },
      });

      // Starter kit so a new player can equip a ship right away (instructions/MILESTONES.md
      // success flow: "equip ship" happens before the first PvE fight).
      const starterItems = await tx.itemDefinition.findMany({ where: { isStarterItem: true } });
      if (starterItems.length > 0) {
        await tx.itemInstance.createMany({
          data: starterItems.map((item) => ({ playerId: created.id, itemDefinitionId: item.id })),
        });
      }

      return created;
    });

    return this.buildAuthResponse(player.id, player.email, player.username, player.race, player.createdAt);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const player = await this.prisma.player.findUnique({ where: { email: dto.email } });
    if (!player) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, player.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(player.id, player.email, player.username, player.race, player.createdAt);
  }

  async refresh(dto: RefreshDto): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const player = await this.prisma.player.findUnique({ where: { id: payload.sub } });
    if (!player) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(player.id, player.email);
  }

  private async buildAuthResponse(id: string, email: string, username: string, race: Race, createdAt: Date): Promise<AuthResponse> {
    const tokens = await this.issueTokens(id, email);
    return {
      ...tokens,
      player: { id, email, username, race, createdAt: createdAt.toISOString() },
    };
  }

  private async issueTokens(id: string, email: string): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: id, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
