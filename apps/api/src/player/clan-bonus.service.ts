import { Injectable } from '@nestjs/common';
import { ClanBuildingBonusType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

/**
 * Reads a player's clan-building bonus (Clan Forge / Clan Depot) — 0 if the
 * player isn't in a clan or that building hasn't been built. Lives in
 * PlayerModule (not ClansModule) specifically so EconomyService and
 * CombatService can depend on it without a circular module import, since
 * ClansModule itself depends on PlayerModule's EconomyService for donations.
 * A clan's Member Hall (MEMBER_CAPACITY) doesn't feed combat/economy math,
 * so it's read directly by ClansService instead of through here.
 */
@Injectable()
export class ClanBonusService {
  constructor(private readonly prisma: PrismaService) {}

  /** Additive bonus fraction (e.g. 0.1 for +10%), or 0. */
  async getBonus(playerId: string, bonusType: ClanBuildingBonusType, tx: Tx = this.prisma): Promise<number> {
    const membership = await tx.clanMembership.findUnique({ where: { playerId } });
    if (!membership) {
      return 0;
    }

    const building = await tx.clanBuilding.findFirst({
      where: { clanId: membership.clanId, level: { gt: 0 }, clanBuildingType: { bonusType } },
      include: { clanBuildingType: true },
    });
    if (!building) {
      return 0;
    }

    return building.level * building.clanBuildingType.bonusPerLevel;
  }
}
