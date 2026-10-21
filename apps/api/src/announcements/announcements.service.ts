import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAnnouncementDto, AdminAnnouncementsDto, AnnouncementDto, AnnouncementStatus, SUPPORTED_LOCALES } from '@pentilius/shared';
import { Announcement, Prisma } from '@prisma/client';
import { AdminJwtPayload } from '../admin/admin-jwt-payload.interface';
import { GAME_BALANCE } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';
import { SaveAnnouncementBodyDto } from './dto/save-announcement.dto';

/**
 * Staff announcements (owner decision, 2026-10-21): a banner on every page
 * between startsAt and endsAt. English is required and is what a player gets
 * when their language has no text. Delivered with GET /player/me/notifications,
 * so it costs no extra request.
 */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active, not-dismissed announcements for this player, already in their language. */
  async forPlayer(playerId: string, locale: string | undefined): Promise<AnnouncementDto[]> {
    const lang = (SUPPORTED_LOCALES as readonly string[]).includes(locale ?? '') ? locale! : 'en';
    const now = new Date();
    const rows = await this.prisma.announcement.findMany({
      where: {
        startsAt: { lte: now },
        endsAt: { gt: now },
        dismissals: { none: { playerId } },
        OR: [{ locales: { isEmpty: true } }, { locales: { has: lang } }],
      },
      orderBy: { startsAt: 'desc' },
    });
    return rows.map((row) => {
      const texts = row.texts as Record<string, string>;
      return { id: row.id, kind: row.kind, text: texts[lang]?.trim() ? texts[lang] : texts.en };
    });
  }

  async dismiss(playerId: string, announcementId: string): Promise<void> {
    const exists = await this.prisma.announcement.findUnique({ where: { id: announcementId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Announcement not found');
    await this.prisma.announcementDismissal.upsert({
      where: { announcementId_playerId: { announcementId, playerId } },
      update: {},
      create: { announcementId, playerId },
    });
  }

  // ---- godmaster ----

  async list(admin: AdminJwtPayload): Promise<AdminAnnouncementsDto> {
    assertAdmin(admin);
    const rows = await this.prisma.announcement.findMany({
      orderBy: { startsAt: 'desc' },
      include: { _count: { select: { dismissals: true } } },
    });
    return { items: rows.map((row) => toAdminDto(row, row._count.dismissals)), maxTextLength: GAME_BALANCE.announcements.maxTextLength };
  }

  async create(dto: SaveAnnouncementBodyDto, admin: AdminJwtPayload): Promise<AdminAnnouncementDto> {
    assertAdmin(admin);
    const data = validate(dto);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.announcement.create({ data });
      await log(tx, admin, 'SAVE_ANNOUNCEMENT', { id: row.id, created: true, ...summary(row) });
      return toAdminDto(row, 0);
    });
  }

  async update(id: string, dto: SaveAnnouncementBodyDto, admin: AdminJwtPayload): Promise<AdminAnnouncementDto> {
    assertAdmin(admin);
    const data = validate(dto);
    return this.prisma.$transaction(async (tx) => {
      await this.findOrThrow(id, tx);
      const row = await tx.announcement.update({ where: { id }, data, include: { _count: { select: { dismissals: true } } } });
      await log(tx, admin, 'SAVE_ANNOUNCEMENT', { id, created: false, ...summary(row) });
      return toAdminDto(row, row._count.dismissals);
    });
  }

  /** Ends it now — it stays in the list as ended. */
  async end(id: string, admin: AdminJwtPayload): Promise<AdminAnnouncementDto> {
    assertAdmin(admin);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findOrThrow(id, tx);
      const now = new Date();
      const row = await tx.announcement.update({
        where: { id },
        // A scheduled one that never started ends before it would start.
        data: { endsAt: now, startsAt: current.startsAt > now ? now : current.startsAt },
        include: { _count: { select: { dismissals: true } } },
      });
      await log(tx, admin, 'END_ANNOUNCEMENT', { id, ...summary(row) });
      return toAdminDto(row, row._count.dismissals);
    });
  }

  async remove(id: string, admin: AdminJwtPayload): Promise<void> {
    assertAdmin(admin);
    await this.prisma.$transaction(async (tx) => {
      const row = await this.findOrThrow(id, tx);
      await tx.announcement.delete({ where: { id } });
      await log(tx, admin, 'DELETE_ANNOUNCEMENT', { id, ...summary(row) });
    });
  }

  private async findOrThrow(id: string, tx: Prisma.TransactionClient): Promise<Announcement> {
    const row = await tx.announcement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Announcement not found');
    return row;
  }
}

function assertAdmin(admin: AdminJwtPayload): void {
  if (admin.role !== 'ADMIN') throw new ForbiddenException('ADMIN_ROLE_REQUIRED');
}

function validate(dto: SaveAnnouncementBodyDto) {
  const locales = SUPPORTED_LOCALES as readonly string[];
  const maxLength = GAME_BALANCE.announcements.maxTextLength;
  const texts: Record<string, string> = {};
  for (const [lang, raw] of Object.entries(dto.texts ?? {})) {
    if (!locales.includes(lang)) throw new BadRequestException('UNKNOWN_LOCALE');
    if (typeof raw !== 'string') throw new BadRequestException('TEXT_INVALID');
    const text = raw.trim();
    if (text.length > maxLength) throw new BadRequestException('TEXT_TOO_LONG');
    if (text) texts[lang] = text;
  }
  if (!texts.en) throw new BadRequestException('ENGLISH_TEXT_REQUIRED');
  const target = [...new Set(dto.locales ?? [])];
  if (target.some((lang) => !locales.includes(lang))) throw new BadRequestException('UNKNOWN_LOCALE');
  const startsAt = new Date(dto.startsAt);
  const endsAt = new Date(dto.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw new BadRequestException('BAD_TIME_RANGE');
  }
  return { kind: dto.kind, texts, locales: target, startsAt, endsAt };
}

function statusOf(row: Announcement): AnnouncementStatus {
  const now = Date.now();
  if (row.endsAt.getTime() <= now) return 'ENDED';
  return row.startsAt.getTime() > now ? 'SCHEDULED' : 'ACTIVE';
}

function toAdminDto(row: Announcement, dismissedCount: number): AdminAnnouncementDto {
  return {
    id: row.id,
    kind: row.kind,
    texts: row.texts as Record<string, string>,
    locales: row.locales,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: statusOf(row),
    dismissedCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function summary(row: Announcement) {
  return { kind: row.kind, en: (row.texts as Record<string, string>).en, locales: row.locales, startsAt: row.startsAt, endsAt: row.endsAt };
}

async function log(
  tx: Prisma.TransactionClient,
  admin: AdminJwtPayload,
  actionType: 'SAVE_ANNOUNCEMENT' | 'END_ANNOUNCEMENT' | 'DELETE_ANNOUNCEMENT',
  details: Record<string, unknown>,
): Promise<void> {
  await tx.adminActionLog.create({
    data: { adminId: admin.sub, adminUsername: admin.username, actionType, details: details as Prisma.InputJsonValue },
  });
}
