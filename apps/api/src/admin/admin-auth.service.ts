import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AdminActionType, AdminRole, AdminUser, Prisma } from '@prisma/client';
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
    // A deactivated account gets the same generic error as a wrong password.
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    return { accessToken: await this.signToken(admin) };
  }

  /**
   * Sliding session (owner decision, 2026-10-12: godmaster should never log
   * the owner out on its own). godmaster calls this on load and periodically,
   * so an account in use keeps getting a fresh long-lived token. Safe because
   * every request re-checks isActive/tokenVersion in AdminJwtStrategy.
   */
  async refresh(requestingAdmin: AdminJwtPayload): Promise<{ accessToken: string }> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: requestingAdmin.sub } });
    return { accessToken: await this.signToken(admin) };
  }

  private signToken(admin: AdminUser): Promise<string> {
    const payload: AdminJwtPayload = { sub: admin.id, username: admin.username, role: admin.role, ver: admin.tokenVersion };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('adminJwt.secret'),
      expiresIn: this.configService.get<string>('adminJwt.expiresIn'),
    });
  }

  /**
   * An ADMIN sees every staff account; a MODERATOR sees only their own (so they
   * can change their own password from the same place) — they have no need to
   * know who else has access (least privilege).
   */
  async listAdmins(
    requestingAdmin: AdminJwtPayload,
  ): Promise<{ id: string; username: string; role: string; isActive: boolean; createdAt: Date; lastLoginAt: Date | null }[]> {
    return this.prisma.adminUser.findMany({
      where: requestingAdmin.role === 'ADMIN' ? {} : { id: requestingAdmin.sub },
      select: { id: true, username: true, role: true, isActive: true, createdAt: true, lastLoginAt: true },
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

  /** ADMIN only. Can't change your own role, and at least one active ADMIN must remain. */
  async updateRole(targetId: string, role: AdminRole, requestingAdmin: AdminJwtPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.loadManageableTarget(targetId, requestingAdmin, tx);
      if (target.role === role) return;
      if (target.role === 'ADMIN' && target.isActive) await this.assertAnotherActiveAdmin(target.id, tx);
      await tx.adminUser.update({ where: { id: target.id }, data: { role, tokenVersion: { increment: 1 } } });
      await this.log(tx, requestingAdmin, 'UPDATE_ADMIN_ROLE', { admin: target.username, oldRole: target.role, newRole: role });
    });
  }

  /** ADMIN only. Generates a new random password (shown once) and signs the account out everywhere. */
  async resetPassword(targetId: string, requestingAdmin: AdminJwtPayload): Promise<{ username: string; password: string }> {
    const password = crypto.randomBytes(GENERATED_PASSWORD_BYTES).toString('base64url');
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const username = await this.prisma.$transaction(async (tx) => {
      const target = await this.loadManageableTarget(targetId, requestingAdmin, tx);
      await tx.adminUser.update({ where: { id: target.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
      await this.log(tx, requestingAdmin, 'RESET_ADMIN_PASSWORD', { admin: target.username });
      return target.username;
    });
    return { username, password };
  }

  /** ADMIN only. Deactivation signs the account out everywhere; it can be re-activated later. */
  async setActive(targetId: string, active: boolean, requestingAdmin: AdminJwtPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.loadManageableTarget(targetId, requestingAdmin, tx);
      if (target.isActive === active) return;
      if (!active && target.role === 'ADMIN') await this.assertAnotherActiveAdmin(target.id, tx);
      await tx.adminUser.update({ where: { id: target.id }, data: { isActive: active, tokenVersion: { increment: 1 } } });
      await this.log(tx, requestingAdmin, active ? 'ACTIVATE_ADMIN' : 'DEACTIVATE_ADMIN', { admin: target.username });
    });
  }

  /** Any staff account can change its own password. Other sessions are signed out; the caller gets a fresh token. */
  async changeOwnPassword(requestingAdmin: AdminJwtPayload, currentPassword: string, newPassword: string): Promise<{ accessToken: string }> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: requestingAdmin.sub } });
    if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) {
      throw new BadRequestException('WRONG_CURRENT_PASSWORD');
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.adminUser.update({ where: { id: admin.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
      await this.log(tx, requestingAdmin, 'CHANGE_OWN_PASSWORD', { admin: admin.username });
      return row;
    });
    return { accessToken: await this.signToken(updated) };
  }

  private async loadManageableTarget(targetId: string, requestingAdmin: AdminJwtPayload, tx: Prisma.TransactionClient): Promise<AdminUser> {
    if (requestingAdmin.role !== 'ADMIN') {
      throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
    }
    // Your own account is managed via "change my password" only — prevents locking yourself out.
    if (targetId === requestingAdmin.sub) {
      throw new BadRequestException('CANNOT_MANAGE_YOURSELF');
    }
    const target = await tx.adminUser.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('ADMIN_NOT_FOUND');
    }
    return target;
  }

  private async assertAnotherActiveAdmin(excludingId: string, tx: Prisma.TransactionClient): Promise<void> {
    const others = await tx.adminUser.count({ where: { role: 'ADMIN', isActive: true, id: { not: excludingId } } });
    if (others === 0) {
      throw new BadRequestException('LAST_ACTIVE_ADMIN');
    }
  }

  private async log(tx: Prisma.TransactionClient, admin: AdminJwtPayload, actionType: AdminActionType, details: Record<string, unknown>): Promise<void> {
    await tx.adminActionLog.create({
      data: { adminId: admin.sub, adminUsername: admin.username, actionType, details: details as Prisma.InputJsonValue },
    });
  }
}
