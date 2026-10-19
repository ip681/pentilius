import { AdminPlayerLoginsDto } from '@pentilius/shared';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { AdminActionType, Prisma } from '@prisma/client';
import { grantItem } from '../inventory/inventory-capacity';
import { normalizeWord } from '../moderation/content-filter';
import { ContentFilterService } from '../moderation/content-filter.service';
import { PrismaService } from '../prisma/prisma.service';
import { GAME_BALANCE } from '../config/game-config';
import { SeasonResetService } from '../season/season-reset.service';
import { coreEndsAt, coreStatus, getCurrentSeason, SeasonService } from '../season/season.service';
import * as bcrypt from 'bcryptjs';
import { AdminJwtPayload } from './admin-jwt-payload.interface';
import { BanPlayerDto } from './dto/ban-player.dto';
import { AddBannedWordDto } from './dto/banned-word.dto';
import { GrantItemDto } from './dto/grant-item.dto';
import { GrantResourceDto } from './dto/grant-resource.dto';
import { RenamePlayerDto } from './dto/rename-player.dto';
import { SetPlayerPasswordDto } from './dto/set-player-password.dto';
import { SetVipDto } from './dto/set-vip.dto';
import { UnbanPlayerDto } from './dto/unban-player.dto';
import { ResetSeasonDto } from './dto/reset-season.dto';
import { ResolveReportsDto } from './dto/resolve-reports.dto';
import { UpdateGameSettingsDto } from './dto/update-game-settings.dto';
import { UpdateSeasonSettingsDto } from './dto/update-season-settings.dto';

type Tx = PrismaService | Prisma.TransactionClient;

// Read-only mount of /opt/pentilius-backups on the VPS (docker-compose.prod.yml) —
// a host-side cron script writes both files, the API container only ever reads them.
const MONITORING_DIR = process.env.MONITORING_DIR ?? '/app/monitoring';
const SERVER_STATUS_FILE = `${MONITORING_DIR}/server-status.json`;
// Appended by the same host-side cron run as SERVER_STATUS_FILE (one JSONL
// line every ~2 minutes, trimmed to the last 720 lines = ~24h) — owner
// decision (2026-10-11), for the godmaster load sparkline. Deliberately a
// much smaller record than the full snapshot (no containers) since this one
// accumulates, not overwrites.
const SERVER_STATUS_HISTORY_FILE = `${MONITORING_DIR}/server-status-history.jsonl`;
const BACKUP_STATUS_LOG = `${MONITORING_DIR}/backup-status.log`;
const BACKUP_LOG_TAIL_LINES = 20;
// Matches backup-db.sh's own naming (pentilius-<ISO-ish timestamp>.dump) —
// also doubles as the path-traversal guard for the download endpoint, since
// a filename that doesn't match this can never resolve outside MONITORING_DIR.
const BACKUP_FILENAME_PATTERN = /^pentilius-[\w-]+\.dump$/;
const RECENT_ACTIONS_LIMIT = 50;

const RESOURCE_FIELD = {
  METAL: 'metal',
  CRYSTAL: 'crystal',
  CREDITS: 'credits',
} as const;

const ACTION_LOG_PAGE_SIZE = 50;
const INVENTORY_PAGE_SIZE = 300;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentFilter: ContentFilterService,
    private readonly seasonService: SeasonService,
    private readonly seasonReset: SeasonResetService,
  ) {}

  async searchPlayers(query: string): Promise<{ id: string; username: string; level: number }[]> {
    // Empty query — the box was just opened, nothing typed yet: show the most
    // recently active players instead of a blank dropdown.
    if (!query) {
      return this.prisma.player.findMany({
        where: { deletedAt: null },
        select: { id: true, username: true, level: true },
        take: 10,
        orderBy: { lastActiveAt: 'desc' },
      });
    }
    if (query.length < 2) {
      return [];
    }
    const players = await this.prisma.player.findMany({
      where: { username: { startsWith: query, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, username: true, level: true },
      take: 10,
      orderBy: { username: 'asc' },
    });
    return players;
  }

  /** Full list (small, ~35 rows) — the godmaster UI filters it client-side by key AND resolved display name, no server-side search needed. */
  async listItems(): Promise<{ key: string; nameKey: string; category: string; tier: string | null; iconAssetId: string }[]> {
    return this.prisma.itemDefinition.findMany({
      select: { key: true, nameKey: true, category: true, tier: true, iconAssetId: true },
      orderBy: { key: 'asc' },
    });
  }

  async grantResource(dto: GrantResourceDto, admin: AdminJwtPayload): Promise<{ username: string; resourceType: string; newAmount: number }> {
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { username: dto.username } });
      if (!player) {
        throw new NotFoundException('PLAYER_NOT_FOUND');
      }

      const field = RESOURCE_FIELD[dto.resourceType];
      const updated = await tx.player.update({
        where: { id: player.id },
        data: { [field]: { increment: dto.amount } },
      });

      await this.logAction(tx, admin, 'GRANT_RESOURCE', updated, { resourceType: dto.resourceType, amount: dto.amount, newAmount: updated[field] });

      return { username: updated.username, resourceType: dto.resourceType, newAmount: updated[field] };
    });
  }

  async grantItemToPlayer(dto: GrantItemDto, admin: AdminJwtPayload): Promise<{ username: string; itemDefinitionKey: string; granted: number }> {
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { username: dto.username } });
      if (!player) {
        throw new NotFoundException('PLAYER_NOT_FOUND');
      }
      const itemDefinition = await tx.itemDefinition.findUnique({ where: { key: dto.itemDefinitionKey } });
      if (!itemDefinition) {
        throw new NotFoundException('ITEM_NOT_FOUND');
      }

      let granted = 0;
      for (let i = 0; i < dto.quantity; i += 1) {
        if (await grantItem(player.id, itemDefinition.id, tx, { quality: dto.quality })) {
          granted += 1;
        }
      }
      if (granted === 0) {
        throw new BadRequestException('INVENTORY_FULL');
      }

      await this.logAction(tx, admin, 'GRANT_ITEM', player, { itemDefinitionKey: dto.itemDefinitionKey, requested: dto.quantity, granted, quality: dto.quality ?? null });

      return { username: player.username, itemDefinitionKey: dto.itemDefinitionKey, granted };
    });
  }

  async banPlayer(dto: BanPlayerDto, admin: AdminJwtPayload): Promise<{ username: string; bannedUntil: Date }> {
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { username: dto.username } });
      if (!player) {
        throw new NotFoundException('PLAYER_NOT_FOUND');
      }

      const bannedUntil = new Date(Date.now() + dto.durationHours * 60 * 60 * 1000);
      const updated = await tx.player.update({
        where: { id: player.id },
        data: { bannedUntil, banReason: dto.reason ?? null },
      });

      await this.logAction(tx, admin, 'BAN_PLAYER', updated, { durationHours: dto.durationHours, reason: dto.reason ?? null, bannedUntil: bannedUntil.toISOString() });

      return { username: updated.username, bannedUntil };
    });
  }

  async unbanPlayer(dto: UnbanPlayerDto, admin: AdminJwtPayload): Promise<{ username: string }> {
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { username: dto.username } });
      if (!player) {
        throw new NotFoundException('PLAYER_NOT_FOUND');
      }

      const updated = await tx.player.update({
        where: { id: player.id },
        data: { bannedUntil: null, banReason: null },
      });

      await this.logAction(tx, admin, 'UNBAN_PLAYER', updated, {});

      return { username: updated.username };
    });
  }

  async renamePlayer(dto: RenamePlayerDto, admin: AdminJwtPayload): Promise<{ oldUsername: string; newUsername: string }> {
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { username: dto.username } });
      if (!player) {
        throw new NotFoundException('PLAYER_NOT_FOUND');
      }
      const clash = await tx.player.findUnique({ where: { username: dto.newUsername } });
      if (clash) {
        throw new ConflictException('USERNAME_TAKEN');
      }

      const updated = await tx.player.update({
        where: { id: player.id },
        data: { username: dto.newUsername },
      });

      await this.logAction(tx, admin, 'RENAME_PLAYER', updated, { oldUsername: dto.username, newUsername: dto.newUsername });

      return { oldUsername: dto.username, newUsername: updated.username };
    });
  }

  /**
   * VIP from godmaster (owner decision, 2026-10-13) — there is no payment yet.
   * ADMIN only. days > 0 extends (from the current end if still active),
   * days = 0 removes it.
   */
  async setVip(dto: SetVipDto, admin: AdminJwtPayload): Promise<{ username: string; vipUntil: Date | null }> {
    if (admin.role !== 'ADMIN') {
      throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
    }
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { username: dto.username } });
      if (!player) {
        throw new NotFoundException('PLAYER_NOT_FOUND');
      }
      const now = Date.now();
      const from = player.vipUntil && player.vipUntil.getTime() > now ? player.vipUntil.getTime() : now;
      const vipUntil = dto.days > 0 ? new Date(from + dto.days * 24 * 60 * 60 * 1000) : null;
      const updated = await tx.player.update({ where: { id: player.id }, data: { vipUntil } });
      await this.logAction(tx, admin, dto.days > 0 ? 'GRANT_VIP' : 'REVOKE_VIP', updated, { days: dto.days, vipUntil: vipUntil?.toISOString() ?? null });
      return { username: updated.username, vipUntil };
    });
  }

  /**
   * Sets a player's password by hand (owner decision, 2026-10-13) — for
   * support cases until email-based password reset exists. ADMIN only; the
   * action log records who and when, never the password itself.
   */
  async setPlayerPassword(dto: SetPlayerPasswordDto, admin: AdminJwtPayload): Promise<{ username: string }> {
    if (admin.role !== 'ADMIN') {
      throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { username: dto.username } });
      if (!player || player.deletedAt) {
        throw new NotFoundException('PLAYER_NOT_FOUND');
      }
      const updated = await tx.player.update({ where: { id: player.id }, data: { passwordHash } });
      await this.logAction(tx, admin, 'SET_PLAYER_PASSWORD', updated, {});
      return { username: updated.username };
    });
  }

  /** Single lookup for the godmaster player detail view: profile+ban state, resources, equipped items, inventory, and this player's own admin-action history. */
  async getPlayerDetail(username: string): Promise<{
    profile: {
      id: string;
      username: string;
      email: string;
      race: string;
      level: number;
      xp: number;
      createdAt: Date;
      lastActiveAt: Date;
      bannedUntil: Date | null;
      banReason: string | null;
      vipUntil: Date | null;
    };
    resources: { metal: number; crystal: number; credits: number };
    equipped: { id: string; slot: string; itemDefinitionKey: string; nameKey: string; tier: string | null; quality: string; upgradeLevel: number }[];
    inventory: { id: string; itemDefinitionKey: string; nameKey: string; category: string; tier: string | null; quality: string; upgradeLevel: number; quantity: number }[];
    actionLog: { id: string; adminUsername: string; actionType: string; details: unknown; createdAt: Date }[];
  }> {
    const player = await this.prisma.player.findUnique({ where: { username } });
    if (!player) {
      throw new NotFoundException('PLAYER_NOT_FOUND');
    }

    const [items, actionLog] = await Promise.all([
      this.prisma.itemInstance.findMany({
        where: { playerId: player.id },
        include: { itemDefinition: { select: { key: true, nameKey: true, category: true, tier: true } } },
        orderBy: { acquiredAt: 'desc' },
        take: INVENTORY_PAGE_SIZE,
      }),
      this.prisma.adminActionLog.findMany({
        where: { targetPlayerId: player.id },
        orderBy: { createdAt: 'desc' },
        take: ACTION_LOG_PAGE_SIZE,
      }),
    ]);

    const equipped = items
      .filter((item) => item.equippedSlot !== null)
      .map((item) => ({
        id: item.id,
        slot: item.equippedSlot as string,
        itemDefinitionKey: item.itemDefinition.key,
        nameKey: item.itemDefinition.nameKey,
        tier: item.itemDefinition.tier,
        quality: item.quality,
        upgradeLevel: item.upgradeLevel,
      }));

    const inventory = items.map((item) => ({
      id: item.id,
      itemDefinitionKey: item.itemDefinition.key,
      nameKey: item.itemDefinition.nameKey,
      category: item.itemDefinition.category,
      tier: item.itemDefinition.tier,
      quality: item.quality,
      upgradeLevel: item.upgradeLevel,
      quantity: item.quantity,
    }));

    return {
      profile: {
        id: player.id,
        username: player.username,
        email: player.email,
        race: player.race,
        level: player.level,
        xp: player.xp,
        createdAt: player.createdAt,
        lastActiveAt: player.lastActiveAt,
        bannedUntil: player.bannedUntil,
        banReason: player.banReason,
        vipUntil: player.vipUntil,
      },
      resources: { metal: player.metal, crystal: player.crystal, credits: player.credits },
      equipped,
      inventory,
      actionLog: actionLog.map((entry) => ({
        id: entry.id,
        adminUsername: entry.adminUsername,
        actionType: entry.actionType,
        details: entry.details,
        createdAt: entry.createdAt,
      })),
    };
  }

  async getSeasonSettings(): Promise<{
    seasonId: number;
    status: string;
    coreOpensAt: Date | null;
    coreDurationDays: number;
    coreEndsAt: Date | null;
    locked: boolean;
    resetAt: string | null;
  }> {
    const season = await getCurrentSeason(this.prisma);
    const status = coreStatus(season);
    return {
      seasonId: season.id,
      status,
      coreOpensAt: season.coreOpensAt,
      coreDurationDays: season.coreDurationDays,
      coreEndsAt: coreEndsAt(season),
      locked: status === 'OPEN' || status === 'ENDED',
      resetAt: await this.seasonService.scheduledResetAt(season),
    };
  }

  /**
   * "Reset now" (owner decision, 2026-10-13) — ADMIN only, only once the Core
   * has closed, confirmed with the admin's own password and the number the new
   * season will get. Otherwise the reset runs on its own at resetAt.
   */
  async resetSeasonNow(dto: ResetSeasonDto, admin: AdminJwtPayload): Promise<{ newSeasonId: number }> {
    if (admin.role !== 'ADMIN') {
      throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
    }
    const staff = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: admin.sub } });
    if (!(await bcrypt.compare(dto.password, staff.passwordHash))) {
      throw new BadRequestException('WRONG_PASSWORD');
    }
    const season = await getCurrentSeason(this.prisma);
    if (dto.newSeasonNumber !== season.id + 1) {
      throw new BadRequestException('WRONG_SEASON_NUMBER');
    }
    const result = await this.seasonReset.resetNow(season.id);
    await this.logAction(this.prisma, admin, 'RESET_SEASON', null, { oldSeasonId: season.id, newSeasonId: result.newSeasonId });
    return result;
  }

  /**
   * Owner decision (2026-10-12): the Core's opening time and duration are set
   * here, and both lock the moment the Core opens — no postponing, shortening
   * or extending once attacks have started. ADMIN only, not MODERATOR.
   */
  async updateSeasonSettings(dto: UpdateSeasonSettingsDto, admin: AdminJwtPayload): Promise<Awaited<ReturnType<AdminService['getSeasonSettings']>>> {
    if (admin.role !== 'ADMIN') {
      throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
    }
    const opensAt = new Date(dto.coreOpensAt);
    if (opensAt.getTime() <= Date.now()) {
      throw new BadRequestException('OPENING_TIME_MUST_BE_IN_FUTURE');
    }

    await this.prisma.$transaction(async (tx) => {
      const season = await getCurrentSeason(tx);
      // Compare-and-swap on the values just read, so the lock can't be
      // dodged by racing the opening moment.
      const updated = await tx.season.updateMany({
        where: {
          id: season.id,
          coreOpensAt: season.coreOpensAt,
          OR: [{ coreOpensAt: null }, { coreOpensAt: { gt: new Date() } }],
        },
        data: { coreOpensAt: opensAt, coreDurationDays: dto.coreDurationDays },
      });
      if (updated.count === 0) {
        throw new ConflictException('SEASON_SETTINGS_LOCKED');
      }
      await this.logAction(tx, admin, 'UPDATE_SEASON_SETTINGS', null, {
        seasonId: season.id,
        oldCoreOpensAt: season.coreOpensAt?.toISOString() ?? null,
        newCoreOpensAt: opensAt.toISOString(),
        oldCoreDurationDays: season.coreDurationDays,
        newCoreDurationDays: dto.coreDurationDays,
      });
    });

    return this.getSeasonSettings();
  }

  /** Content filter word list (owner decision, 2026-10-12) — both roles can manage it. */
  async listBannedWords(): Promise<{ id: string; word: string; normalized: string; match: string; createdBy: string | null; createdAt: Date }[]> {
    return this.prisma.bannedWord.findMany({ orderBy: { word: 'asc' } });
  }

  async addBannedWord(dto: AddBannedWordDto, admin: AdminJwtPayload): Promise<void> {
    const normalized = normalizeWord(dto.word.trim());
    if (normalized.length < 2) {
      throw new BadRequestException('WORD_TOO_SHORT');
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.bannedWord.findUnique({ where: { normalized } });
      if (existing) {
        throw new ConflictException('WORD_ALREADY_LISTED');
      }
      await tx.bannedWord.create({ data: { word: dto.word.trim(), normalized, match: dto.match, createdBy: admin.username } });
      await this.logAction(tx, admin, 'ADD_BANNED_WORD', null, { word: dto.word.trim(), match: dto.match });
    });
    this.contentFilter.invalidate();
  }

  async removeBannedWord(id: string, admin: AdminJwtPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.bannedWord.findUnique({ where: { id } });
      if (!row) {
        throw new NotFoundException('WORD_NOT_FOUND');
      }
      await tx.bannedWord.delete({ where: { id } });
      await this.logAction(tx, admin, 'REMOVE_BANNED_WORD', null, { word: row.word, match: row.match });
    });
    this.contentFilter.invalidate();
  }

  testContent(text: string): Promise<{ matches: string[]; masked: string }> {
    return this.contentFilter.test(text);
  }

  /** Global (non-seasonal) game settings — see schema.prisma's GameSettings. */
  async getGameSettings(): Promise<{ accountDeletionGraceDays: number; seasonResetDelayDays: number }> {
    const settings = await this.prisma.gameSettings.findUnique({ where: { id: 1 } });
    return { accountDeletionGraceDays: settings?.accountDeletionGraceDays ?? 3, seasonResetDelayDays: settings?.seasonResetDelayDays ?? 1 };
  }

  /** ADMIN only. Applies to deletions requested from now on — already scheduled ones keep their date. */
  async updateGameSettings(dto: UpdateGameSettingsDto, admin: AdminJwtPayload): Promise<{ accountDeletionGraceDays: number; seasonResetDelayDays: number }> {
    if (admin.role !== 'ADMIN') {
      throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
    }
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.gameSettings.findUnique({ where: { id: 1 } });
      await tx.gameSettings.upsert({
        where: { id: 1 },
        update: { accountDeletionGraceDays: dto.accountDeletionGraceDays, seasonResetDelayDays: dto.seasonResetDelayDays },
        create: { id: 1, accountDeletionGraceDays: dto.accountDeletionGraceDays, seasonResetDelayDays: dto.seasonResetDelayDays },
      });
      await this.logAction(tx, admin, 'UPDATE_GAME_SETTINGS', null, {
        oldAccountDeletionGraceDays: before?.accountDeletionGraceDays ?? 3,
        newAccountDeletionGraceDays: dto.accountDeletionGraceDays,
        oldSeasonResetDelayDays: before?.seasonResetDelayDays ?? 1,
        newSeasonResetDelayDays: dto.seasonResetDelayDays,
      });
    });
    return this.getGameSettings();
  }

  /**
   * Reports grouped by who/what was reported (owner decision, 2026-10-12), so
   * a mass-report shows up as one group with its reporter count, and the
   * clan most of the reporters belong to (a sign of organized reporting).
   * Each report carries its reporter's track record (total vs. dismissed).
   */
  async getReports(view: 'open' | 'closed'): Promise<{ groups: ReportGroup[] }> {
    const reports = await this.prisma.playerReport.findMany({
      where: view === 'open' ? { status: 'OPEN' } : { status: { not: 'OPEN' } },
      orderBy: view === 'open' ? { createdAt: 'asc' } : { resolvedAt: 'desc' },
      take: view === 'open' ? 500 : 100,
      include: {
        reporter: { select: { id: true, username: true, clanMembership: { select: { clan: { select: { tag: true } } } } } },
        targetPlayer: { select: { id: true, username: true } },
        targetClan: { select: { id: true, tag: true, name: true } },
      },
    });

    const reporterIds = [...new Set(reports.map((r) => r.reporterId))];
    const [totals, dismissed, liveMessages] = await Promise.all([
      this.prisma.playerReport.groupBy({ by: ['reporterId'], where: { reporterId: { in: reporterIds } }, _count: { _all: true } }),
      this.prisma.playerReport.groupBy({ by: ['reporterId'], where: { reporterId: { in: reporterIds }, status: 'DISMISSED' }, _count: { _all: true } }),
      this.prisma.clanMessage.findMany({
        where: { id: { in: reports.filter((r) => r.targetType === 'CLAN_MESSAGE').map((r) => r.targetId) } },
        select: { id: true },
      }),
    ]);
    const totalBy = new Map(totals.map((row) => [row.reporterId, row._count._all]));
    const dismissedBy = new Map(dismissed.map((row) => [row.reporterId, row._count._all]));
    const liveMessageIds = new Set(liveMessages.map((m) => m.id));

    const groups = new Map<string, ReportGroup>();
    for (const report of reports) {
      const isClanTarget = report.targetType === 'CLAN';
      const key = isClanTarget ? `clan:${report.targetClanId ?? report.targetId}` : `player:${report.targetPlayerId ?? report.targetId}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          targetKind: isClanTarget ? 'CLAN' : 'PLAYER',
          targetPlayerId: isClanTarget ? null : report.targetPlayerId,
          targetUsername: isClanTarget ? null : (report.targetPlayer?.username ?? null),
          targetClanTag: isClanTarget ? (report.targetClan?.tag ?? null) : null,
          targetClanName: isClanTarget ? (report.targetClan?.name ?? null) : null,
          uniqueReporters: 0,
          topReporterClan: null,
          reports: [],
        };
        groups.set(key, group);
      }
      group.reports.push({
        id: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        comment: report.comment,
        contentSnapshot: report.contentSnapshot,
        status: report.status,
        createdAt: report.createdAt,
        resolvedAt: report.resolvedAt,
        resolvedByAdmin: report.resolvedByAdmin,
        resolutionNote: report.resolutionNote,
        messageStillExists: report.targetType === 'CLAN_MESSAGE' ? liveMessageIds.has(report.targetId) : null,
        reporter: {
          id: report.reporter.id,
          username: report.reporter.username,
          clanTag: report.reporter.clanMembership?.clan.tag ?? null,
          totalReports: totalBy.get(report.reporterId) ?? 0,
          dismissedReports: dismissedBy.get(report.reporterId) ?? 0,
        },
      });
    }

    for (const group of groups.values()) {
      const reporters = new Map(group.reports.map((r) => [r.reporter.id, r.reporter.clanTag]));
      group.uniqueReporters = reporters.size;
      const byClan = new Map<string, number>();
      for (const tag of reporters.values()) if (tag) byClan.set(tag, (byClan.get(tag) ?? 0) + 1);
      const top = [...byClan.entries()].sort((a, b) => b[1] - a[1])[0];
      group.topReporterClan = top && top[1] > 1 ? { tag: top[0], reporters: top[1] } : null;
    }

    // Most-reported first.
    return { groups: [...groups.values()].sort((a, b) => b.uniqueReporters - a.uniqueReporters || b.reports.length - a.reports.length) };
  }

  /**
   * Marks one or more open reports RESOLVED or DISMISSED and logs each. After a
   * dismissal, re-checks the reporter's track record and suspends their
   * reporting if too many recent reports were dismissed (GAME_BALANCE.moderation).
   */
  async resolveReports(dto: ResolveReportsDto, admin: AdminJwtPayload): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const reports = await tx.playerReport.findMany({
        where: { id: { in: dto.reportIds }, status: 'OPEN' },
        include: { targetPlayer: { select: { id: true, username: true } } },
      });
      const note = dto.note?.trim() || null;
      for (const report of reports) {
        await tx.playerReport.update({
          where: { id: report.id },
          data: { status: dto.status, resolvedAt: new Date(), resolvedByAdmin: admin.username, resolutionNote: note },
        });
        await this.logAction(tx, admin, dto.status === 'RESOLVED' ? 'RESOLVE_REPORT' : 'DISMISS_REPORT', report.targetPlayer, {
          reportId: report.id,
          targetType: report.targetType,
          reason: report.reason,
          note,
        });
      }

      if (dto.status === 'DISMISSED') {
        const limits = GAME_BALANCE.moderation;
        for (const reporterId of new Set(reports.map((r) => r.reporterId))) {
          const recent = await tx.playerReport.findMany({
            where: { reporterId, status: { not: 'OPEN' } },
            orderBy: { resolvedAt: 'desc' },
            take: limits.reputationWindow,
            select: { status: true },
          });
          if (recent.filter((r) => r.status === 'DISMISSED').length >= limits.maxDismissedInWindow) {
            await tx.player.update({
              where: { id: reporterId },
              data: { reportingSuspendedUntil: new Date(Date.now() + limits.suspensionDays * 24 * 3600_000) },
            });
          }
        }
      }
      return { updated: reports.length };
    });
  }

  /** Removes an abusive clan-chat message (the report keeps its text snapshot as evidence). */
  async deleteClanMessage(messageId: string, admin: AdminJwtPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const message = await tx.clanMessage.findUnique({ where: { id: messageId }, include: { player: { select: { id: true, username: true } } } });
      if (!message) {
        throw new NotFoundException('MESSAGE_NOT_FOUND');
      }
      await tx.clanMessage.delete({ where: { id: messageId } });
      await this.logAction(tx, admin, 'DELETE_CLAN_MESSAGE', message.player, { messageId, clanId: message.clanId, text: message.text });
    });
  }

  /**
   * A player's login records and the other accounts seen from the same
   * addresses (owner decision, 2026-10-19). For staff only, and every look is
   * logged — it's personal data kept for security, not for curiosity. Shared
   * addresses are a hint (homes, offices and mobile networks share them),
   * never a verdict.
   */
  async getPlayerLogins(playerId: string, admin: AdminJwtPayload): Promise<AdminPlayerLoginsDto> {
    const player = await this.prisma.player.findUnique({ where: { id: playerId }, select: { id: true, username: true } });
    if (!player) throw new NotFoundException('PLAYER_NOT_FOUND');
    const [events, ownIps] = await Promise.all([
      this.prisma.loginEvent.findMany({ where: { playerId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.loginEvent.findMany({ where: { playerId }, distinct: ['ip'], select: { ip: true } }),
    ]);
    const ips = ownIps.map((r) => r.ip);
    const shared = ips.length
      ? await this.prisma.loginEvent.findMany({
          where: { ip: { in: ips }, playerId: { not: playerId } },
          distinct: ['playerId', 'ip'],
          select: { playerId: true, ip: true, player: { select: { username: true, bannedUntil: true } } },
        })
      : [];
    const byPlayer = new Map<string, { username: string; banned: boolean; ips: string[] }>();
    for (const row of shared) {
      const entry = byPlayer.get(row.playerId) ?? { username: row.player.username, banned: Boolean(row.player.bannedUntil && row.player.bannedUntil > new Date()), ips: [] };
      entry.ips.push(row.ip);
      byPlayer.set(row.playerId, entry);
    }
    await this.logAction(this.prisma, admin, 'VIEW_PLAYER_LOGINS', player, {});
    return {
      retentionDays: GAME_BALANCE.security.loginRetentionDays,
      events: events.map((e) => ({ createdAt: e.createdAt.toISOString(), kind: e.kind, ip: e.ip, country: e.country, device: e.device, browser: e.browser })),
      sharedAccounts: [...byPlayer.entries()]
        .map(([id, v]) => ({ playerId: id, username: v.username, banned: v.banned, sharedIps: v.ips }))
        .sort((a, b) => b.sharedIps.length - a.sharedIps.length),
    };
  }

  private async logAction(
    tx: Tx,
    admin: AdminJwtPayload,
    actionType: AdminActionType,
    target: { id: string; username: string } | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    await tx.adminActionLog.create({
      data: {
        adminId: admin.sub,
        adminUsername: admin.username,
        actionType,
        targetPlayerId: target?.id ?? null,
        targetUsername: target?.username ?? null,
        details: details as Prisma.InputJsonValue,
      },
    });
  }

  async getServerStatus(): Promise<{
    server: unknown | null;
    history: unknown[];
    backupLogTail: string[];
    errors: string[];
  }> {
    const errors: string[] = [];

    let server: unknown | null = null;
    try {
      const raw = await fs.readFile(SERVER_STATUS_FILE, 'utf-8');
      server = JSON.parse(raw);
    } catch {
      errors.push('SERVER_STATUS_UNAVAILABLE');
    }

    let history: unknown[] = [];
    try {
      const raw = await fs.readFile(SERVER_STATUS_HISTORY_FILE, 'utf-8');
      history = raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((point): point is Record<string, unknown> => point !== null);
    } catch {
      // Soft-missing, not pushed to errors — the history file is new and
      // only exists once the cron script has run at least once; the
      // sparkline simply has nothing to draw yet.
    }

    let backupLogTail: string[] = [];
    try {
      const raw = await fs.readFile(BACKUP_STATUS_LOG, 'utf-8');
      const lines = raw.split('\n').filter((line) => line.trim().length > 0);
      backupLogTail = lines.slice(-BACKUP_LOG_TAIL_LINES);
    } catch {
      errors.push('BACKUP_LOG_UNAVAILABLE');
    }

    return { server, history, backupLogTail, errors };
  }

  /** Local VPS backup files (the read-only monitoring mount) — same ~14-day retention as the Google Drive copies, since backup-db.sh prunes both together, so this list is already a faithful mirror without a round-trip to Drive. */
  async listBackups(): Promise<{ filename: string; sizeBytes: number; createdAt: Date }[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(MONITORING_DIR);
    } catch {
      return [];
    }

    const backups = await Promise.all(
      entries
        .filter((name) => BACKUP_FILENAME_PATTERN.test(name))
        .map(async (filename) => {
          const stat = await fs.stat(`${MONITORING_DIR}/${filename}`);
          return { filename, sizeBytes: stat.size, createdAt: stat.mtime };
        }),
    );

    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** Resolves + validates a backup filename for download — the pattern check is also the path-traversal guard, so a non-matching name never reaches the filesystem. */
  async getBackupFilePath(filename: string): Promise<string> {
    if (!BACKUP_FILENAME_PATTERN.test(filename)) {
      throw new BadRequestException('INVALID_BACKUP_FILENAME');
    }
    const filePath = `${MONITORING_DIR}/${filename}`;
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('BACKUP_NOT_FOUND');
    }
    return filePath;
  }

  /** Cross-player admin activity feed — the per-player history in getPlayerDetail() filters this same table by targetPlayerId. */
  async getRecentActions(): Promise<{ id: string; adminUsername: string; actionType: string; targetUsername: string | null; details: unknown; createdAt: Date }[]> {
    const rows = await this.prisma.adminActionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIONS_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      adminUsername: row.adminUsername,
      actionType: row.actionType,
      targetUsername: row.targetUsername,
      details: row.details,
      createdAt: row.createdAt,
    }));
  }
}

export interface ReportGroup {
  key: string;
  targetKind: 'PLAYER' | 'CLAN';
  targetPlayerId: string | null;
  targetUsername: string | null;
  targetClanTag: string | null;
  targetClanName: string | null;
  uniqueReporters: number;
  // Set only when more than one reporter shares a clan — a hint of organized reporting.
  topReporterClan: { tag: string; reporters: number } | null;
  reports: {
    id: string;
    targetType: string;
    targetId: string;
    reason: string;
    comment: string | null;
    contentSnapshot: string;
    status: string;
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedByAdmin: string | null;
    resolutionNote: string | null;
    // CLAN_MESSAGE only: whether the message can still be deleted.
    messageStillExists: boolean | null;
    reporter: { id: string; username: string; clanTag: string | null; totalReports: number; dismissedReports: number };
  }[];
}
