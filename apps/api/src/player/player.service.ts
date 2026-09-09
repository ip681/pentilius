import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CosmeticsCatalogDto, PlayerListEntryDto, PlayerProfileDto, PlayerPublicProfileDto } from '@pentilius/shared';
import { Race } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { GAME_BALANCE } from '../config/game-config';
import { EconomyService } from './economy.service';
import { PrismaService } from '../prisma/prisma.service';

const SALT_ROUNDS = 10;

@Injectable()
export class PlayerService {
  constructor(
    private readonly economy: EconomyService,
    private readonly prisma: PrismaService,
  ) {}

  async getProfile(playerId: string): Promise<PlayerProfileDto> {
    const player = await this.economy.settleAll(playerId);
    const xpForNextLevel = await this.economy.getXpForNextLevel(player.level);

    return {
      id: player.id,
      email: player.email,
      username: player.username,
      race: player.race,
      level: player.level,
      xp: player.xp,
      xpForNextLevel,
      bio: player.bio,
      resources: {
        metal: player.metal,
        crystal: player.crystal,
        credits: player.credits,
      },
      energy: {
        current: player.actionEnergy,
        max: player.actionEnergyMax,
        nextRegenAt:
          player.actionEnergy < player.actionEnergyMax
            ? new Date(player.energyUpdatedAt.getTime() + GAME_BALANCE.actionEnergy.regenIntervalMinutes * 60_000).toISOString()
            : null,
      },
      preferredLocale: player.preferredLocale,
      selectedAvatarKey: player.selectedAvatarKey,
      selectedFrameKey: player.selectedFrameKey,
    };
  }

  async getCosmeticsCatalog(): Promise<CosmeticsCatalogDto> {
    const [avatars, frames] = await Promise.all([this.prisma.avatarDefinition.findMany(), this.prisma.frameDefinition.findMany()]);
    return {
      avatars: avatars.map((a) => ({ key: a.key, nameKey: a.nameKey, iconAssetId: a.iconAssetId })),
      frames: frames.map((f) => ({ key: f.key, nameKey: f.nameKey, iconAssetId: f.iconAssetId })),
    };
  }

  async updateAvatar(playerId: string, avatarKey: string): Promise<PlayerProfileDto> {
    const exists = await this.prisma.avatarDefinition.findUnique({ where: { key: avatarKey } });
    if (!exists) {
      throw new BadRequestException('UNKNOWN_AVATAR');
    }
    await this.prisma.player.update({ where: { id: playerId }, data: { selectedAvatarKey: avatarKey } });
    return this.getProfile(playerId);
  }

  async updateFrame(playerId: string, frameKey: string): Promise<PlayerProfileDto> {
    const exists = await this.prisma.frameDefinition.findUnique({ where: { key: frameKey } });
    if (!exists) {
      throw new BadRequestException('UNKNOWN_FRAME');
    }
    await this.prisma.player.update({ where: { id: playerId }, data: { selectedFrameKey: frameKey } });
    return this.getProfile(playerId);
  }

  async changePassword(playerId: string, currentPassword: string, newPassword: string): Promise<void> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const matches = await bcrypt.compare(currentPassword, player.passwordHash);
    if (!matches) {
      throw new BadRequestException('INCORRECT_CURRENT_PASSWORD');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.player.update({ where: { id: playerId }, data: { passwordHash } });
  }

  async updatePreferredLocale(playerId: string, locale: string): Promise<PlayerProfileDto> {
    await this.prisma.player.update({ where: { id: playerId }, data: { preferredLocale: locale } });
    return this.getProfile(playerId);
  }

  /** Public profile — never includes email, resources, or anything else private to the account owner. */
  async getPublicProfile(playerId: string): Promise<PlayerPublicProfileDto> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { clanMembership: { include: { clan: true } } },
    });
    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return {
      id: player.id,
      username: player.username,
      race: player.race,
      level: player.level,
      bio: player.bio,
      createdAt: player.createdAt.toISOString(),
      clan: player.clanMembership
        ? { id: player.clanMembership.clan.id, name: player.clanMembership.clan.name, tag: player.clanMembership.clan.tag, role: player.clanMembership.role }
        : null,
      selectedAvatarKey: player.selectedAvatarKey,
      selectedFrameKey: player.selectedFrameKey,
    };
  }

  async updateBio(playerId: string, bio: string): Promise<PlayerPublicProfileDto> {
    const trimmed = bio.trim();
    await this.prisma.player.update({ where: { id: playerId }, data: { bio: trimmed || null } });
    return this.getPublicProfile(playerId);
  }

  /** Leaderboard/search listing, sorted by level (highest first). */
  async listPlayers(filter: { race?: Race; search?: string }): Promise<PlayerListEntryDto[]> {
    const players = await this.prisma.player.findMany({
      where: {
        ...(filter.race ? { race: filter.race } : {}),
        ...(filter.search ? { username: { contains: filter.search, mode: 'insensitive' as const } } : {}),
      },
      include: { clanMembership: { include: { clan: true } } },
      orderBy: [{ level: 'desc' }, { username: 'asc' }],
      take: 100,
    });

    return players.map((player) => ({
      id: player.id,
      username: player.username,
      race: player.race,
      level: player.level,
      clanId: player.clanMembership?.clan.id ?? null,
      clanTag: player.clanMembership?.clan.tag ?? null,
    }));
  }
}
