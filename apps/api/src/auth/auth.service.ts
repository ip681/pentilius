import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthResponse, AuthTokens, RaceCountsDto } from '@pentilius/shared';
import { Race } from '@prisma/client';

const ALL_RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];
import * as bcrypt from 'bcryptjs';
import { AccountEmailService } from '../email/account-email.service';
import { ContentFilterService } from '../moderation/content-filter.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } from './login-limiter';
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
    private readonly contentFilter: ContentFilterService,
    private readonly accountEmail: AccountEmailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    await this.contentFilter.assertClean(dto.username);
    const [existingEmail, existingUsername] = await Promise.all([
      // Emails don't depend on upper/lower case (owner decision, 2026-10-14).
      this.prisma.player.findFirst({ where: { email: { equals: dto.email.trim(), mode: 'insensitive' } } }),
      this.prisma.player.findUnique({ where: { username: dto.username } }),
    ]);
    if (existingEmail) {
      throw new ConflictException('EMAIL_TAKEN');
    }
    if (existingUsername) {
      throw new ConflictException('USERNAME_TAKEN');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    // No starter kit and no starting attribute points (owner decision,
    // 2026-09-09) — a fresh robot fights bare-handed on GAME_BALANCE.combat's
    // baseAttack/baseDefense/basePlayerHp floor alone, strong enough to beat
    // only the single weakest Pentili. Equipment comes later, from that first
    // win's loot or the Shop (instructions/MILESTONES.md's flow was updated
    // to match: fight first, then equip).
    const [avatarKey, frameKey] = await Promise.all([this.pickRandomAvatarKey(), this.pickRandomFrameKey()]);
    const player = await this.prisma.player.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        race: dto.race,
        termsAcceptedAt: new Date(),
        ...(avatarKey ? { selectedAvatarKey: avatarKey } : {}),
        ...(frameKey ? { selectedFrameKey: frameKey } : {}),
      },
    });

    // Confirmation email (optional confirmation, owner decision 2026-10-13) — a
    // failure never blocks registration; the Command Center can send it again.
    void this.accountEmail.sendVerification(player, dto.locale ?? 'bg').catch(() => undefined);

    return this.buildAuthResponse(player.id, player.email, player.username, player.race, player.createdAt);
  }

  async login(dto: LoginDto, ip?: string): Promise<AuthResponse> {
    const identifier = (dto.login ?? dto.email ?? '').trim();
    if (!identifier) {
      throw new UnauthorizedException('Invalid credentials');
    }
    assertLoginAllowed(identifier, ip);

    const player = await this.findForLogin(identifier);
    if (!player || !(await bcrypt.compare(dto.password, player.passwordHash))) {
      recordLoginFailure(identifier, ip);
      throw new UnauthorizedException('Invalid credentials');
    }
    recordLoginSuccess(identifier);

    // Admin-issued suspension (godmaster panel) — checked only after the
    // password is confirmed, so a wrong-password guess can't be used to probe
    // whether an account is banned. Lapses on its own once bannedUntil passes,
    // no separate unban call needed for a normal expiry.
    if (player.bannedUntil && player.bannedUntil > new Date()) {
      throw new ForbiddenException({
        message: 'PLAYER_BANNED',
        bannedUntil: player.bannedUntil.toISOString(),
        reason: player.banReason,
      });
    }

    return this.buildAuthResponse(player.id, player.email, player.username, player.race, player.createdAt);
  }

  async getRaceCounts(): Promise<RaceCountsDto> {
    const grouped = await this.prisma.player.groupBy({ by: ['race'], _count: { race: true } });
    const counts = Object.fromEntries(ALL_RACES.map((race) => [race, 0])) as RaceCountsDto;
    for (const row of grouped) {
      counts[row.race] = row._count.race;
    }
    return counts;
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
    if (!player || player.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Same immediate-ban-enforcement reasoning as JwtStrategy.validate() — a
    // banned player must not be able to silently mint a fresh access token.
    if (player.bannedUntil && player.bannedUntil > new Date()) {
      throw new UnauthorizedException('PLAYER_BANNED');
    }

    return this.issueTokens(player.id, player.email);
  }

  // Owner decision (2026-09-11): a random avatar/frame at registration
  // instead of every account starting on the same "avatar1"/"frame1"
  // (still the schema default, used as a fallback if a definition table is
  // ever empty). Freely replaceable afterward in Settings either way.
  private async pickRandomAvatarKey(): Promise<string | null> {
    const avatars = await this.prisma.avatarDefinition.findMany({ select: { key: true } });
    if (avatars.length === 0) return null;
    return avatars[Math.floor(Math.random() * avatars.length)].key;
  }

  private async pickRandomFrameKey(): Promise<string | null> {
    const frames = await this.prisma.frameDefinition.findMany({ select: { key: true } });
    if (frames.length === 0) return null;
    return frames[Math.floor(Math.random() * frames.length)].key;
  }

  /**
   * Email or username (owner decision, 2026-10-14), both without regard to
   * upper/lower case; if two players differ only by case, the exact spelling
   * is needed.
   */
  private async findForLogin(identifier: string) {
    // Both without regard to upper/lower case (owner decision, 2026-10-14).
    const field = identifier.includes('@') ? 'email' : 'username';
    const exact = await this.prisma.player.findFirst({ where: { [field]: identifier } });
    if (exact) return exact;
    const matches = await this.prisma.player.findMany({ where: { [field]: { equals: identifier, mode: 'insensitive' } }, take: 2 });
    return matches.length === 1 ? matches[0] : null;
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
