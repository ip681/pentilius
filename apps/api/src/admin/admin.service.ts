import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { AdminActionType, Prisma } from '@prisma/client';
import { grantItem } from '../inventory/inventory-capacity';
import { PrismaService } from '../prisma/prisma.service';
import { AdminJwtPayload } from './admin-jwt-payload.interface';
import { BanPlayerDto } from './dto/ban-player.dto';
import { GrantItemDto } from './dto/grant-item.dto';
import { GrantResourceDto } from './dto/grant-resource.dto';
import { RenamePlayerDto } from './dto/rename-player.dto';
import { UnbanPlayerDto } from './dto/unban-player.dto';

type Tx = PrismaService | Prisma.TransactionClient;

// Read-only mount of /opt/pentilius-backups on the VPS (docker-compose.prod.yml) —
// a host-side cron script writes both files, the API container only ever reads them.
const MONITORING_DIR = process.env.MONITORING_DIR ?? '/app/monitoring';
const SERVER_STATUS_FILE = `${MONITORING_DIR}/server-status.json`;
const BACKUP_STATUS_LOG = `${MONITORING_DIR}/backup-status.log`;
const BACKUP_LOG_TAIL_LINES = 20;

const RESOURCE_FIELD = {
  METAL: 'metal',
  CRYSTAL: 'crystal',
  CREDITS: 'credits',
} as const;

const ACTION_LOG_PAGE_SIZE = 50;
const INVENTORY_PAGE_SIZE = 300;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async searchPlayers(query: string): Promise<{ id: string; username: string; level: number }[]> {
    // Empty query — the box was just opened, nothing typed yet: show the most
    // recently active players instead of a blank dropdown.
    if (!query) {
      return this.prisma.player.findMany({
        select: { id: true, username: true, level: true },
        take: 10,
        orderBy: { lastActiveAt: 'desc' },
      });
    }
    if (query.length < 2) {
      return [];
    }
    const players = await this.prisma.player.findMany({
      where: { username: { startsWith: query, mode: 'insensitive' } },
      select: { id: true, username: true, level: true },
      take: 10,
      orderBy: { username: 'asc' },
    });
    return players;
  }

  /** Full list (small, ~35 rows) — the godmaster UI filters it client-side by key AND resolved display name, no server-side search needed. */
  async listItems(): Promise<{ key: string; nameKey: string; category: string; tier: string | null }[]> {
    return this.prisma.itemDefinition.findMany({
      select: { key: true, nameKey: true, category: true, tier: true },
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
        if (await grantItem(player.id, itemDefinition.id, tx)) {
          granted += 1;
        }
      }
      if (granted === 0) {
        throw new BadRequestException('INVENTORY_FULL');
      }

      await this.logAction(tx, admin, 'GRANT_ITEM', player, { itemDefinitionKey: dto.itemDefinitionKey, requested: dto.quantity, granted });

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

    let backupLogTail: string[] = [];
    try {
      const raw = await fs.readFile(BACKUP_STATUS_LOG, 'utf-8');
      const lines = raw.split('\n').filter((line) => line.trim().length > 0);
      backupLogTail = lines.slice(-BACKUP_LOG_TAIL_LINES);
    } catch {
      errors.push('BACKUP_LOG_UNAVAILABLE');
    }

    return { server, backupLogTail, errors };
  }
}
