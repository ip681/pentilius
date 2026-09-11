import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CosmeticsCatalogDto, PlayerLeaderboardEntryDto, PlayerLeaderboardPageDto, PlayerLeaderboardSortBy, PlayerProfileDto, PlayerPublicProfileDto } from '@pentilius/shared';
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

  /**
   * Leaderboard/search listing (owner decision, 2026-09-10). Ranks are
   * computed over the FULL player base first (both the global rank and the
   * race-only rank), then search/race are applied as a filter on top — so
   * "#" always reflects a player's true standing, not just their row index
   * in whatever's currently filtered. Small-scale, in-memory approach
   * (fetch everyone, rank in JS) — adequate at this project's actual size,
   * same "simple over clever" spirit as the rest of this codebase; revisit
   * with real SQL ranking if the player base ever grows large enough to matter.
   */
  async listPlayers(
    viewerId: string,
    filter: { race?: Race; search?: string; sortBy?: PlayerLeaderboardSortBy; page?: number; pageSize?: number },
  ): Promise<PlayerLeaderboardPageDto> {
    const sortBy = filter.sortBy ?? 'level';
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

    const [allPlayers, pvpAttackWins, pvpDefenseWins, clanWarDamage, bossPoints] = await Promise.all([
      this.prisma.player.findMany({
        select: {
          id: true,
          username: true,
          race: true,
          level: true,
          selectedAvatarKey: true,
          selectedFrameKey: true,
          clanMembership: { select: { clan: { select: { id: true, tag: true } } } },
        },
      }),
      this.prisma.pvpBattleReport.groupBy({ by: ['attackerId'], where: { outcome: 'WIN' }, _count: { _all: true } }),
      this.prisma.pvpBattleReport.groupBy({ by: ['defenderId'], where: { outcome: 'LOSS' }, _count: { _all: true } }),
      this.prisma.clanWarAttack.groupBy({ by: ['attackerId'], _sum: { damageDealt: true } }),
      this.prisma.bossFormationDailyPoints.groupBy({ by: ['playerId'], _sum: { points: true } }),
    ]);

    const pvpWinsByPlayer = new Map<string, number>();
    for (const row of pvpAttackWins) {
      pvpWinsByPlayer.set(row.attackerId, (pvpWinsByPlayer.get(row.attackerId) ?? 0) + row._count._all);
    }
    for (const row of pvpDefenseWins) {
      // A LOSS from the attacker's perspective means the defender won.
      pvpWinsByPlayer.set(row.defenderId, (pvpWinsByPlayer.get(row.defenderId) ?? 0) + row._count._all);
    }
    const clanWarDamageByPlayer = new Map(clanWarDamage.map((row) => [row.attackerId, row._sum.damageDealt ?? 0]));
    // Lifetime total across every UTC day, not just today's bucket — see PlayerLeaderboardEntryDto's comment.
    const bossPointsByPlayer = new Map(bossPoints.map((row) => [row.playerId, row._sum.points ?? 0]));

    const enriched = allPlayers.map((p) => ({
      id: p.id,
      username: p.username,
      race: p.race,
      level: p.level,
      clanId: p.clanMembership?.clan.id ?? null,
      clanTag: p.clanMembership?.clan.tag ?? null,
      selectedAvatarKey: p.selectedAvatarKey,
      selectedFrameKey: p.selectedFrameKey,
      pvpWins: pvpWinsByPlayer.get(p.id) ?? 0,
      clanWarDamageDealt: clanWarDamageByPlayer.get(p.id) ?? 0,
      bossFormationPoints: bossPointsByPlayer.get(p.id) ?? 0,
    }));

    const metricOf = (p: (typeof enriched)[number]) =>
      sortBy === 'pvpWins' ? p.pvpWins : sortBy === 'clanWarDamage' ? p.clanWarDamageDealt : sortBy === 'bossPoints' ? p.bossFormationPoints : p.level;
    const sorted = [...enriched].sort((a, b) => metricOf(b) - metricOf(a) || a.username.localeCompare(b.username));

    const globalRankById = new Map(sorted.map((p, index) => [p.id, index + 1]));

    const raceRankById = new Map<string, number>();
    const byRace = new Map<Race, typeof sorted>();
    for (const p of sorted) {
      const list = byRace.get(p.race) ?? [];
      list.push(p);
      byRace.set(p.race, list);
    }
    for (const list of byRace.values()) {
      list.forEach((p, index) => raceRankById.set(p.id, index + 1));
    }

    let filtered = sorted;
    if (filter.race) {
      filtered = filtered.filter((p) => p.race === filter.race);
    }
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      filtered = filtered.filter((p) => p.username.toLowerCase().includes(needle));
    }

    const total = filtered.length;
    const pageItems = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    const toEntry = (p: (typeof sorted)[number]): PlayerLeaderboardEntryDto => ({
      id: p.id,
      username: p.username,
      race: p.race,
      level: p.level,
      clanId: p.clanId,
      clanTag: p.clanTag,
      selectedAvatarKey: p.selectedAvatarKey,
      selectedFrameKey: p.selectedFrameKey,
      pvpWins: p.pvpWins,
      clanWarDamageDealt: p.clanWarDamageDealt,
      bossFormationPoints: p.bossFormationPoints,
      globalRank: globalRankById.get(p.id)!,
      raceRank: raceRankById.get(p.id)!,
      isCurrentPlayer: p.id === viewerId,
    });

    const entries = pageItems.map(toEntry);
    // Computed over the full, unfiltered `sorted` list — present regardless
    // of the current page/search/race filter, so "where am I" always works.
    const viewerPlayer = sorted.find((p) => p.id === viewerId);
    const viewerEntry = viewerPlayer ? toEntry(viewerPlayer) : null;

    return { entries, page, pageSize, total, viewerEntry };
  }
}
