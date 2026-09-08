import { ItemQuality, ItemTier, Prisma, Race } from '@prisma/client';
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
 *
 * `overrides.quality` lets a non-loot grant path force a specific quality
 * instead of the RARE roll below — the Shop forces NORMAL (never Rare/Epic),
 * a loot box forces RARE or EPIC (never Normal) — see inventory.service.ts's
 * openBox(). Every other caller passes nothing and keeps today's random
 * behavior unchanged. Race-locking has no override: it always follows
 * rollRace()'s tier rule below, for loot, Shop purchases and box contents alike
 * (owner decision).
 */
export async function grantItem(
  playerId: string,
  itemDefinitionId: string,
  tx: Tx,
  overrides: { quality?: ItemQuality } = {},
): Promise<boolean> {
  const itemDefinition = await tx.itemDefinition.findUniqueOrThrow({ where: { id: itemDefinitionId } });

  if (itemDefinition.category === 'CONSUMABLE') {
    // Serializes concurrent grants of the same stack (e.g. rapid repeat Shop
    // purchases, or two loot rolls landing in the same instant) so they can't
    // race past the existence check below and each create their own row
    // instead of stacking onto one. Transaction-scoped — released automatically
    // on commit/rollback, no manual unlock needed.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${playerId}), hashtext(${itemDefinitionId}))`;

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

  const race = itemDefinition.category === 'EQUIPMENT' ? rollRace(itemDefinition.tier) : null;

  const quality = overrides.quality ?? (itemDefinition.category === 'EQUIPMENT' && Math.random() < GAME_BALANCE.rarity.rareChance ? 'RARE' : 'NORMAL');
  const rolledOptions =
    itemDefinition.slot && (quality === 'RARE' || quality === 'EPIC')
      ? pickOptions(getOptionPool(itemDefinition.slot), quality === 'EPIC' ? 2 : 1)
      : [];

  await tx.itemInstance.create({
    data: { playerId, itemDefinitionId, race, quality, rolledOptions },
  });
  return true;
}

/**
 * Race-locking (instructions/GAME_SYSTEMS.md): stamped per dropped/granted
 * *instance*, not the ItemDefinition — distinct from the separate, unused
 * ItemDefinition.race. PIONEER always stays universal (null). COREFORGED is
 * always locked to one of the 5 races. ASCENDANT is a 6-way equal split
 * (owner-specified): 1/6 stays universal, the other 5/6 splits evenly across
 * the 5 races (1/6 each) — see game-config.ts's GAME_BALANCE.raceLock.
 */
function rollRace(tier: ItemTier | null): Race | null {
  if (tier === 'COREFORGED') {
    return ALL_RACES[Math.floor(Math.random() * ALL_RACES.length)];
  }
  if (tier === 'ASCENDANT') {
    return Math.random() < GAME_BALANCE.raceLock.ascendantUniversalChance ? null : ALL_RACES[Math.floor(Math.random() * ALL_RACES.length)];
  }
  return null;
}

/**
 * Samples `count` distinct entries from `pool` without replacement (capped at
 * the pool's own size) — one Math.random() call per pick, same as the old
 * single-option pickOption() did for count=1.
 */
function pickOptions<T>(pool: T[], count: number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const index = Math.floor(Math.random() * remaining.length);
    picked.push(remaining.splice(index, 1)[0]);
  }
  return picked;
}
