import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: {
    player: { findUnique: jest.Mock; create: jest.Mock };
    itemDefinition: { findMany: jest.Mock };
    itemInstance: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      player: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      itemInstance: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('signed-token'), verifyAsync: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-value') },
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('throws a ConflictException when the email is already taken', async () => {
      prisma.player.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com' });

      await expect(authService.register({ email: 'a@b.com', password: 'password123' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('hashes the password and creates the player', async () => {
      prisma.player.findUnique.mockResolvedValue(null);
      prisma.player.create.mockResolvedValue({ id: '1', email: 'a@b.com', createdAt: new Date() });

      const result = await authService.register({ email: 'a@b.com', password: 'password123' });

      expect(prisma.player.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.player.create.mock.calls[0][0];
      expect(createArgs.data.email).toBe('a@b.com');
      expect(await bcrypt.compare('password123', createArgs.data.passwordHash)).toBe(true);
      expect(result.player.email).toBe('a@b.com');
      expect(result.accessToken).toBe('signed-token');
    });
  });

  describe('login', () => {
    it('throws an UnauthorizedException when the player does not exist', async () => {
      prisma.player.findUnique.mockResolvedValue(null);

      await expect(authService.login({ email: 'missing@b.com', password: 'password123' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws an UnauthorizedException when the password does not match', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.player.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com', passwordHash });

      await expect(authService.login({ email: 'a@b.com', password: 'wrong-password' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('returns tokens when credentials are valid', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.player.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com', passwordHash, createdAt: new Date() });

      const result = await authService.login({ email: 'a@b.com', password: 'correct-password' });

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
    });
  });
});
