import { Prisma, Race } from '@prisma/client';
import { GAME_BALANCE, getOptionPool } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

const ALL_RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];

/** Base capacity plus any Warehouse (or future capacity-granting building) bonus. */
export async function getEffectiveInventoryCapacity(playerId: string, tx: Tx): Promise<number> {
  const buildings = await tx.playerBuilding.findMany({
    where: { playerId, level: { gt: 0 }, buildingType: { capacityBonusPerLevel: { not: null } } },
    include: { buildingType: true },
  });
  const bonus = buildings.reduce((sum, building) => sum + building.level * (building.buildingType.capacityBonusPerLevel ?? 0), 0);
  return GAME_BALANCE.inventory.baseCapacity + bonus;
}

/**
 * Every owned item counts against capacity, equipped or not — an equipped
 * item stays visible in the inventory grid (just marked "Equipped"), so it
 * still occupies a slot rather than silently vanishing from the count.
 */
export function getUsedInventorySlots(playerId: string, tx: Tx): Promise<number> {
  return tx.itemInstance.count({ where: { playerId } });
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

  // Coreforged drops are the same ItemDefinition for everyone, but each dropped
  // instance is stamped with a random race and can only be equipped by that race
  // (instructions/GAME_SYSTEMS.md) — distinct from the separate, unused ItemDefinition.race.
  // category check matters: the Coreforged Upgrade material also has tier COREFORGED
  // but is a CONSUMABLE — it must never get a (meaningless) race stamp.
  const race = itemDefinition.category === 'EQUIPMENT' && itemDefinition.tier === 'COREFORGED' ? ALL_RACES[Math.floor(Math.random() * ALL_RACES.length)] : null;

  const rare = itemDefinition.category === 'EQUIPMENT' && Math.random() < GAME_BALANCE.rarity.rareChance;
  const rolledOptions = rare && itemDefinition.slot ? [pickOption(getOptionPool(itemDefinition.slot))] : [];

  await tx.itemInstance.create({
    data: { playerId, itemDefinitionId, race, quality: rare ? 'RARE' : 'NORMAL', rolledOptions },
  });
  return true;
}

function pickOption<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}
