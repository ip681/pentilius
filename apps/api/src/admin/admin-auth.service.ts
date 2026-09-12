import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminJwtPayload } from './admin-jwt-payload.interface';

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
}
