import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { AdminJwtPayload } from './admin-jwt-payload.interface';

const SALT_ROUNDS = 10;
// Base64url-ish, no ambiguous punctuation — pasted/read once and stored by the creating admin.
const GENERATED_PASSWORD_BYTES = 12;

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: AdminLoginDto): Promise<{ accessToken: string }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { username: dto.username } });
    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

    const payload: AdminJwtPayload = { sub: admin.id, username: admin.username, role: admin.role };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('adminJwt.secret'),
      expiresIn: this.configService.get<string>('adminJwt.expiresIn'),
    });

    return { accessToken };
  }

  /** Only an ADMIN may view the staff list — a MODERATOR has no need to know who else has access (least privilege). */
  async listAdmins(requestingAdmin: AdminJwtPayload): Promise<{ id: string; username: string; role: string; createdAt: Date; lastLoginAt: Date | null }[]> {
    if (requestingAdmin.role !== 'ADMIN') {
      throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
    }
    return this.prisma.adminUser.findMany({
      select: { id: true, username: true, role: true, createdAt: true, lastLoginAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Only an ADMIN may create new staff accounts (owner decision, 2026-09-12) — prevents a MODERATOR from self-escalating by minting another admin. Password is generated here and returned once; nothing else ever reads it back out. */
  async createAdmin(dto: CreateAdminDto, requestingAdmin: AdminJwtPayload): Promise<{ username: string; role: string; password: string }> {
    if (requestingAdmin.role !== 'ADMIN') {
      throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
    }

    const existing = await this.prisma.adminUser.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('USERNAME_TAKEN');
    }

    const password = crypto.randomBytes(GENERATED_PASSWORD_BYTES).toString('base64url');
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const created = await this.prisma.adminUser.create({ data: { username: dto.username, passwordHash, role: dto.role } });

    return { username: created.username, role: created.role, password };
  }
}
