import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

/**
 * Defense-only base building effects (owner decision, 2026-10-12) — read for
 * the player who was ATTACKED, never the attacker:
 * - Defensive Wall: extra regular-PvP revenge protection after a lost defense.
 * - Hideout: a per-resource amount that can't be stolen (PvP and clan-war duels).
 * (The Defense System's +defense lives in CombatService, since it's a combat stat.)
 */

/** Extra minutes of regular-PvP revenge protection from the Defensive Wall, or 0. */
export async function getWallProtectionMinutes(playerId: string, tx: Tx): Promise<number> {
  const building = await tx.playerBuilding.findFirst({
    where: { playerId, level: { gt: 0 }, buildingType: { pvpProtectionMinutesPerLevel: { not: null } } },
    include: { buildingType: true },
  });
  return building ? building.level * (building.buildingType.pvpProtectionMinutesPerLevel ?? 0) : 0;
}

export interface ProtectedResources {
  metal: number;
  crystal: number;
  credits: number;
}

/** How much of each resource the Hideout keeps safe from theft (all 0 if unbuilt). */
export async function getHideoutProtection(playerId: string, tx: Tx): Promise<ProtectedResources> {
  const building = await tx.playerBuilding.findFirst({
    where: { playerId, level: { gt: 0 }, buildingType: { protectedMetalPerLevel: { not: null } } },
    include: { buildingType: true },
  });
  if (!building) {
    return { metal: 0, crystal: 0, credits: 0 };
  }
  const type = building.buildingType;
  return {
    metal: building.level * (type.protectedMetalPerLevel ?? 0),
    crystal: building.level * (type.protectedCrystalPerLevel ?? 0),
    credits: building.level * (type.protectedCreditsPerLevel ?? 0),
  };
}

/** The part of a resource stock that can be stolen — whatever is above the Hideout's protected amount. */
export function stealableAmount(stock: number, protectedAmount: number): number {
  return Math.max(0, stock - protectedAmount);
}
