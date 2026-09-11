import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BossFormationDto,
  BossFormationResultDto,
  BossFormationSlotDto,
  BossFormationsResponseDto,
  CombatRoundDto,
  LootResultEntryDto,
  ResourceType,
} from '@pentilius/shared';
import { Boss, BossFormation, BossFormationSlot, Player, Prisma, Race, Zone } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { assertNoActiveExpedition } from '../expeditions/expedition-guard';
import { grantItem } from '../inventory/inventory-capacity';
import { aggregateFormationCombatStats, CombatService } from '../pve/combat.service';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

const RESOURCE_FIELD: Record<ResourceType, 'metal' | 'crystal' | 'credits'> = {
  METAL: 'metal',
  CRYSTAL: 'crystal',
  CREDITS: 'credits',
};

const ALL_RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

type Tx = PrismaService | Prisma.TransactionClient;
type FormationWithRelations = BossFormation & {
  boss: Boss & { zone: Zone };
  creator: Player;
  slots: (BossFormationSlot & { player: Player | null })[];
};

/**
 * Boss Formations (owner decision, 2026-09-11) — fully replaces the old
 * open-lobby Boss Hunts model. See schema.prisma's comment on BossFormation
 * and the project_boss_formations.md design memory for the full spec.
 */
@Injectable()
export class BossFormationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly combat: CombatService,
  ) {}

  async getFormations(playerId: string): Promise<BossFormationsResponseDto> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    await this.globalFinalizeSweep();

    const bosses = await this.prisma.boss.findMany({ include: { zone: true }, orderBy: { level: 'asc' } });
    const allFormations = await this.prisma.bossFormation.findMany({
      where: { bossId: { in: bosses.map((b) => b.id) } },
      include: { boss: { include: { zone: true } }, creator: true, slots: { include: { player: true }, orderBy: { race: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    const visibleFormations = await this.filterVisible(allFormations, playerId, this.prisma);

    const formationsByBoss = new Map<string, FormationWithRelations[]>();
    for (const formation of visibleFormations) {
      const list = formationsByBoss.get(formation.bossId) ?? [];
      list.push(formation);
      formationsByBoss.set(formation.bossId, list);
    }

    const dtoBosses = bosses.map((boss) => {
      const formations = (formationsByBoss.get(boss.id) ?? []).map((f) => toFormationDto(f, playerId));
      return {
        id: boss.id,
        key: boss.key,
        nameKey: boss.nameKey,
        zoneNameKey: boss.zone.nameKey,
        level: boss.level,
        maxHp: boss.maxHp,
        attack: boss.attack,
        defense: boss.defense,
        xpReward: boss.xpReward,
        iconAssetId: boss.iconAssetId,
        unlocked: player.level >= GAME_BALANCE.bossFormations.minLevel,
        formations,
      };
    });

    return {
      bosses: dtoBosses,
      minLevel: GAME_BALANCE.bossFormations.minLevel,
      nextActionAvailableAt: cooldownIso(player),
    };
  }

  async getFormation(playerId: string, formationId: string): Promise<BossFormationDto> {
    await this.finalizeIfExpired(formationId);
    const formation = await this.loadFormation(formationId, this.prisma);
    if (!formation) {
      throw new NotFoundException('Formation not found');
    }
    await this.assertVisible(formation, playerId, this.prisma);
    return toFormationDto(formation, playerId);
  }

  async createFormation(
    playerId: string,
    bossKey: string,
    visibility: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean },
  ): Promise<BossFormationDto> {
    if (visibility.visibleToClanOnly) {
      const membership = await this.prisma.clanMembership.findUnique({ where: { playerId } });
      if (!membership) {
        throw new BadRequestException('NOT_IN_CLAN');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      const boss = await tx.boss.findUnique({ where: { key: bossKey }, include: { zone: true } });
      if (!boss) {
        throw new NotFoundException('Boss not found');
      }
      if (player.level < GAME_BALANCE.bossFormations.minLevel) {
        throw new ForbiddenException('LEVEL_TOO_LOW');
      }
      assertCooldownFree(player);
      await assertNoActiveExpedition(playerId, tx);

      const resolvesAt = new Date(Date.now() + GAME_BALANCE.bossFormations.enrollmentWindowHours * 60 * 60 * 1000);
      const created = await tx.bossFormation.create({
        data: {
          bossId: boss.id,
          creatorId: playerId,
          resolvesAt,
          visibleToClanOnly: visibility.visibleToClanOnly ?? false,
          visibleToFriendsOnly: visibility.visibleToFriendsOnly ?? false,
          slots: {
            create: ALL_RACES.map((race) => (race === player.race ? { race, playerId, joinedAt: new Date() } : { race })),
          },
        },
      });

      await setCooldown(tx, playerId);

      const formation = await this.loadFormation(created.id, tx);
      return toFormationDto(formation!, playerId);
    });
  }

  async joinFormation(playerId: string, formationId: string): Promise<BossFormationDto> {
    await this.finalizeIfExpired(formationId);

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      if (player.level < GAME_BALANCE.bossFormations.minLevel) {
        throw new ForbiddenException('LEVEL_TOO_LOW');
      }
      assertCooldownFree(player);
      await assertNoActiveExpedition(playerId, tx);

      const formation = await this.loadFormation(formationId, tx);
      if (!formation) {
        throw new NotFoundException('Formation not found');
      }
      if (formation.status !== 'OPEN') {
        throw new BadRequestException('FORMATION_ALREADY_RESOLVED');
      }
      await this.assertVisible(formation, playerId, tx);

      const updated = await tx.bossFormationSlot.updateMany({
        where: { formationId, race: player.race, playerId: null },
        data: { playerId, joinedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new BadRequestException('SLOT_ALREADY_FILLED');
      }

      await setCooldown(tx, playerId);

      const refreshed = await this.loadFormation(formationId, tx);
      return toFormationDto(refreshed!, playerId);
    });
  }

  async updateVisibility(
    playerId: string,
    formationId: string,
    visibility: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean },
  ): Promise<BossFormationDto> {
    return this.prisma.$transaction(async (tx) => {
      const formation = await this.loadFormation(formationId, tx);
      if (!formation) {
        throw new NotFoundException('Formation not found');
      }
      if (formation.creatorId !== playerId) {
        throw new ForbiddenException('Only the creator may edit visibility');
      }
      if (formation.status !== 'OPEN') {
        throw new BadRequestException('FORMATION_ALREADY_RESOLVED');
      }
      const editWindowMs = GAME_BALANCE.bossFormations.visibilityEditWindowHours * 60 * 60 * 1000;
      if (Date.now() >= formation.createdAt.getTime() + editWindowMs) {
        throw new BadRequestException('VISIBILITY_EDIT_WINDOW_CLOSED');
      }
      if (visibility.visibleToClanOnly) {
        const membership = await tx.clanMembership.findUnique({ where: { playerId } });
        if (!membership) {
          throw new BadRequestException('NOT_IN_CLAN');
        }
      }

      await tx.bossFormation.update({
        where: { id: formationId },
        data: { visibleToClanOnly: visibility.visibleToClanOnly, visibleToFriendsOnly: visibility.visibleToFriendsOnly },
      });

      const refreshed = await this.loadFormation(formationId, tx);
      return toFormationDto(refreshed!, playerId);
    });
  }

  /** Finalizes every OPEN formation whose enrollment window has already elapsed, across every boss — no cron, checked lazily on the main list read. */
  private async globalFinalizeSweep(): Promise<void> {
    const expired = await this.prisma.bossFormation.findMany({
      where: { status: 'OPEN', resolvesAt: { lte: new Date() } },
      select: { id: true },
    });
    for (const { id } of expired) {
      await this.finalizeIfExpired(id);
    }
  }

  private async finalizeIfExpired(formationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const formation = await tx.bossFormation.findUnique({
        where: { id: formationId },
        include: { boss: { include: { lootDrops: true } }, slots: true },
      });
      if (!formation || formation.status !== 'OPEN' || formation.resolvesAt > new Date()) {
        return;
      }
      await this.settle(formation.boss, formation, formation.slots, tx);
    });
  }

  /** Resolves an OPEN formation now: simulates the combined party combat (if any slot is filled) and grants rewards on a win. */
  private async settle(
    boss: Boss & { lootDrops: { id: string; resourceType: ResourceType | null; itemDefinitionId: string | null; dropChance: number; minQuantity: number; maxQuantity: number }[] },
    formation: BossFormation,
    slots: BossFormationSlot[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const filledSlots = slots.filter((s) => s.playerId !== null);

    if (filledSlots.length === 0) {
      await tx.bossFormation.update({
        where: { id: formation.id },
        data: { status: 'RESOLVED', outcome: null, rounds: [], partyMaxHp: 0, bossMaxHp: boss.maxHp, totalDamageDealt: 0 },
      });
      return;
    }

    const breakdowns = await Promise.all(filledSlots.map((s) => this.combat.computeCombatBreakdown(s.playerId!, tx)));
    const formationStats = aggregateFormationCombatStats(breakdowns);
    const combatResult = this.combat.simulate(formationStats, boss);

    if (combatResult.won) {
      const xpPerSlot = Math.floor(boss.xpReward / filledSlots.length);
      const todayUtc = startOfUtcDay(new Date());

      for (const slot of filledSlots) {
        const playerId = slot.playerId!;
        await this.economy.applyXp(playerId, xpPerSlot, tx);

        const lootSummary: LootResultEntryDto[] = [];

        const boxDefinition = await tx.itemDefinition.findUnique({ where: { id: boss.guaranteedBoxItemDefinitionId } });
        if (boxDefinition) {
          const granted = await grantItem(playerId, boxDefinition.id, tx);
          if (granted) {
            lootSummary.push({
              type: 'item',
              itemDefinitionKey: boxDefinition.key,
              itemNameKey: boxDefinition.nameKey,
              itemIconAssetId: boxDefinition.iconAssetId,
              quantity: 1,
            });
          }
        }

        for (const drop of boss.lootDrops) {
          if (Math.random() > drop.dropChance) {
            continue;
          }
          const quantity = randomInt(drop.minQuantity, drop.maxQuantity);

          if (drop.resourceType) {
            const field = RESOURCE_FIELD[drop.resourceType];
            await tx.player.update({ where: { id: playerId }, data: { [field]: { increment: quantity } } });
            lootSummary.push({ type: 'resource', resourceType: drop.resourceType, quantity });
          } else if (drop.itemDefinitionId) {
            const itemDefinition = await tx.itemDefinition.findUniqueOrThrow({ where: { id: drop.itemDefinitionId } });
            let granted = 0;
            for (let q = 0; q < quantity; q += 1) {
              if (await grantItem(playerId, itemDefinition.id, tx)) {
                granted += 1;
              }
            }
            if (granted > 0) {
              lootSummary.push({
                type: 'item',
                itemDefinitionKey: itemDefinition.key,
                itemNameKey: itemDefinition.nameKey,
                itemIconAssetId: itemDefinition.iconAssetId,
                quantity: granted,
              });
            }
          }
        }

        await tx.bossFormationSlot.update({
          where: { id: slot.id },
          data: { xpGained: xpPerSlot, lootSummary: lootSummary as unknown as Prisma.InputJsonValue },
        });

        await tx.bossFormationDailyPoints.upsert({
          where: { playerId_dateUtc: { playerId, dateUtc: todayUtc } },
          update: { points: { increment: combatResult.damageDealt } },
          create: { playerId, dateUtc: todayUtc, points: combatResult.damageDealt },
        });
      }
    } else {
      for (const slot of filledSlots) {
        await tx.bossFormationSlot.update({ where: { id: slot.id }, data: { xpGained: 0, lootSummary: [] } });
      }
    }

    await tx.bossFormation.update({
      where: { id: formation.id },
      data: {
        status: 'RESOLVED',
        outcome: combatResult.won ? 'WIN' : 'LOSS',
        rounds: combatResult.rounds as unknown as Prisma.InputJsonValue,
        partyMaxHp: combatResult.playerMaxHp,
        bossMaxHp: combatResult.pentiliMaxHp,
        totalDamageDealt: combatResult.damageDealt,
      },
    });
  }

  private loadFormation(formationId: string, tx: Tx): Promise<FormationWithRelations | null> {
    return tx.bossFormation.findUnique({
      where: { id: formationId },
      include: { boss: { include: { zone: true } }, creator: true, slots: { include: { player: true }, orderBy: { race: 'asc' } } },
    });
  }

  /** Batch visibility filter for a list of formations — mirrors market.service.ts's listActive. */
  private async filterVisible(formations: FormationWithRelations[], viewerId: string, tx: Tx): Promise<FormationWithRelations[]> {
    const restricted = formations.filter((f) => f.visibleToClanOnly || f.visibleToFriendsOnly);
    if (restricted.length === 0) {
      return formations;
    }

    const [viewerMembership, friendRows] = await Promise.all([
      tx.clanMembership.findUnique({ where: { playerId: viewerId } }),
      tx.friendship.findMany({ where: { status: 'ACCEPTED', OR: [{ requesterId: viewerId }, { addresseeId: viewerId }] } }),
    ]);
    const viewerClanId = viewerMembership?.clanId ?? null;
    const friendIds = new Set(friendRows.map((f) => (f.requesterId === viewerId ? f.addresseeId : f.requesterId)));

    const creatorIds = [...new Set(restricted.map((f) => f.creatorId))];
    const creatorMemberships = await tx.clanMembership.findMany({ where: { playerId: { in: creatorIds } } });
    const creatorClanById = new Map(creatorMemberships.map((m) => [m.playerId, m.clanId]));

    return formations.filter((f) => {
      if (f.creatorId === viewerId) return true;
      if (!f.visibleToClanOnly && !f.visibleToFriendsOnly) return true;
      const sameClan = f.visibleToClanOnly && viewerClanId !== null && creatorClanById.get(f.creatorId) === viewerClanId;
      const isFriend = f.visibleToFriendsOnly && friendIds.has(f.creatorId);
      return sameClan || isFriend;
    });
  }

  /** Single-formation defensive re-check — never trust the client only reached this formation through the filtered list (instructions/ARCHITECTURE.md). Mirrors market.service.ts's buyListing. */
  private async assertVisible(formation: FormationWithRelations, viewerId: string, tx: Tx): Promise<void> {
    if (formation.creatorId === viewerId) return;
    if (!formation.visibleToClanOnly && !formation.visibleToFriendsOnly) return;

    const [viewerMembership, creatorMembership, friendship] = await Promise.all([
      tx.clanMembership.findUnique({ where: { playerId: viewerId } }),
      tx.clanMembership.findUnique({ where: { playerId: formation.creatorId } }),
      tx.friendship.findFirst({
        where: {
          status: 'ACCEPTED',
          OR: [
            { requesterId: viewerId, addresseeId: formation.creatorId },
            { requesterId: formation.creatorId, addresseeId: viewerId },
          ],
        },
      }),
    ]);
    const sameClan = formation.visibleToClanOnly && viewerMembership !== null && viewerMembership.clanId === creatorMembership?.clanId;
    const isFriend = formation.visibleToFriendsOnly && friendship !== null;
    if (!sameClan && !isFriend) {
      throw new NotFoundException('Formation not found');
    }
  }
}

function assertCooldownFree(player: Player): void {
  if (player.nextBossFormationActionAt && player.nextBossFormationActionAt > new Date()) {
    throw new BadRequestException('BOSS_FORMATION_COOLDOWN_ACTIVE');
  }
}

async function setCooldown(tx: Prisma.TransactionClient, playerId: string): Promise<void> {
  const until = new Date(Date.now() + GAME_BALANCE.bossFormations.actionCooldownHours * 60 * 60 * 1000);
  await tx.player.update({ where: { id: playerId }, data: { nextBossFormationActionAt: until } });
}

function cooldownIso(player: Player): string | null {
  if (player.nextBossFormationActionAt && player.nextBossFormationActionAt > new Date()) {
    return player.nextBossFormationActionAt.toISOString();
  }
  return null;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toFormationDto(formation: FormationWithRelations, viewerId: string): BossFormationDto {
  const editWindowMs = GAME_BALANCE.bossFormations.visibilityEditWindowHours * 60 * 60 * 1000;
  const canEditVisibility =
    formation.status === 'OPEN' && formation.creatorId === viewerId && Date.now() < formation.createdAt.getTime() + editWindowMs;

  const slots: BossFormationSlotDto[] = formation.slots.map((slot) => ({
    race: slot.race,
    playerId: slot.playerId,
    playerUsername: slot.player?.username ?? null,
    joinedAt: slot.joinedAt?.toISOString() ?? null,
    isCurrentPlayer: slot.playerId === viewerId,
    xpGained: slot.xpGained,
    lootSummary: (slot.lootSummary as unknown as LootResultEntryDto[] | null) ?? null,
  }));

  const result: BossFormationResultDto | null =
    formation.status === 'RESOLVED'
      ? {
          outcome: formation.outcome,
          rounds: (formation.rounds as unknown as CombatRoundDto[]) ?? [],
          partyMaxHp: formation.partyMaxHp ?? 0,
          bossMaxHp: formation.bossMaxHp ?? 0,
          totalDamageDealt: formation.totalDamageDealt ?? 0,
        }
      : null;

  return {
    id: formation.id,
    bossKey: formation.boss.key,
    creatorId: formation.creatorId,
    creatorUsername: formation.creator.username,
    status: formation.status,
    createdAt: formation.createdAt.toISOString(),
    resolvesAt: formation.resolvesAt.toISOString(),
    visibleToClanOnly: formation.visibleToClanOnly,
    visibleToFriendsOnly: formation.visibleToFriendsOnly,
    canEditVisibility,
    slots,
    result,
  };
}
