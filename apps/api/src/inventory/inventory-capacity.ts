import { Prisma } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

/** Base capacity plus any Warehouse (or future capacity-granting building) bonus. */
export async function getEffectiveInventoryCapacity(playerId: string, tx: Tx): Promise<number> {
  const buildings = await tx.playerBuilding.findMany({
    where: { playerId, level: { gt: 0 }, buildingType: { capacityBonusPerLevel: { not: null } } },
    include: { buildingType: true },
  });
  const bonus = buildings.reduce((sum, building) => sum + building.level * (building.buildingType.capacityBonusPerLevel ?? 0), 0);
  return GAME_BALANCE.inventory.baseCapacity + bonus;
}

/** Equipped items don't count against capacity — only what's actually sitting in the bag does. */
export function getUsedInventorySlots(playerId: string, tx: Tx): Promise<number> {
  return tx.itemInstance.count({ where: { playerId, equippedSlot: null } });
}

/**
 * Grants one unit of an item to a player, server-authoritative on capacity.
 * A CONSUMABLE stacks onto its existing (unequipped) row for free — stacking
 * never needs a new slot, so it's never blocked by a full inventory. Anything
 * else (a first-time consumable pickup, or any EQUIPMENT item) needs a new
 * row and is refused once the player is at or over capacity.
 *
 * Returns whether the item was actually granted (false = silently dropped,
 * the same win's resources/XP are unaffected — see pve/boss/expeditions).
 */
export async function grantItem(playerId: string, itemDefinitionId: string, tx: Tx): Promise<boolean> {
  const itemDefinition = await tx.itemDefinition.findUniqueOrThrow({ where: { id: itemDefinitionId } });

  if (itemDefinition.category === 'CONSUMABLE') {
    const existing = await tx.itemInstance.findFirst({ where: { playerId, itemDefinitionId, equippedSlot: null } });
    if (existing) {
      await tx.itemInstance.update({ where: { id: existing.id }, data: { quantity: { increment: 1 } } });
      return true;
    }
  }

  const [used, capacity] = await Promise.all([getUsedInventorySlots(playerId, tx), getEffectiveInventoryCapacity(playerId, tx)]);
  if (used >= capacity) {
    return false;
  }

  await tx.itemInstance.create({ data: { playerId, itemDefinitionId } });
  return true;
}
