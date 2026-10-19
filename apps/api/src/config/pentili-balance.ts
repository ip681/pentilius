import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Pentili balance (owner decision, 2026-10-18): tuned from godmaster instead
 * of hand-written numbers. Stats, XP and rewards all grow with the Pentili's
 * level along curves (value = base × level^growth), scaled by its zone's and
 * its own strength. Zones set where their Pentili start, the level step
 * between them and the item drops of their set. Lives in src/config because
 * the seed uses it too (and the production image ships this folder).
 *
 * The defaults reproduce the stats of 2026-10-11 exactly; the rewards are
 * new (they used to be tiny fixed ranges per zone).
 */

export interface Curve {
  base: number;
  growth: number;
}

export type ItemTier = 'pioneer' | 'ascendant' | 'coreforged';

export interface PentiliZoneBalance {
  // Level of the zone's first Pentili, and the level step to the next one.
  startLevel: number;
  step: number;
  // Multiplies the stats and the rewards of every Pentili in the zone.
  strength: number;
  // Which equipment set the zone drops.
  itemTier: ItemTier;
  // Chance per equipment slot (7 slots), per fight.
  itemChance: number;
  fragmentChance: number;
  upgradeStoneChance: number;
  energyPackChance: number;
}

export interface PentiliBalanceConfig {
  stats: { hp: Curve; attack: Curve; defense: Curve; xp: Curve };
  // No Credits from Pentili (owner decision, 2026-10-19).
  rewards: {
    metal: Curve;
    crystal: Curve;
    // Rewards vary ± this fraction around the curve (0.25 = ±25%).
    spread: number;
  };
  zones: Record<string, PentiliZoneBalance>;
}

const ZONE = (startLevel: number, step: number, itemTier: ItemTier, itemChance: number): PentiliZoneBalance => ({
  startLevel,
  step,
  strength: 1,
  itemTier,
  itemChance,
  fragmentChance: 0.05,
  upgradeStoneChance: 0.01,
  energyPackChance: 0.02,
});

export const DEFAULT_PENTILI_BALANCE: PentiliBalanceConfig = {
  stats: {
    hp: { base: 20, growth: 1.07 },
    attack: { base: 4, growth: 0.916 },
    defense: { base: 1, growth: 1.249 },
    xp: { base: 8, growth: 1.3 },
  },
  rewards: {
    // ~20 Metal at level 1, ~900 at 19, ~3 900 at 58, ~7 400 at 96 —
    // in step with mine production of a comparable stage. Placeholder.
    metal: { base: 20, growth: 1.3 },
    crystal: { base: 12, growth: 1.3 },
    spread: 0.25,
  },
  zones: {
    // The first zone drops equipment more often, so a new player gears up.
    zone_verdant_flats: ZONE(1, 2, 'pioneer', 0.05),
    zone_ashen_ridge: ZONE(20, 2, 'ascendant', 0.02),
    zone_crimson_wastes: ZONE(40, 2, 'coreforged', 0.02),
    zone_frostbound_reach: ZONE(60, 4, 'coreforged', 0.02),
  },
};

export const PENTILI_BALANCE_KEY = 'pentili';
const SLOT_SUFFIXES = ['head_scanner', 'left_arm_blaster', 'right_arm_guard', 'armor_plating', 'core_battery', 'left_leg_actuator', 'right_leg_actuator'];

type Db = PrismaClient | Prisma.TransactionClient;

/** One Pentili's settings that aren't curves. */
export interface PentiliOwnSettings {
  zoneKey: string;
  orderInZone: number;
  levelOverride: number | null;
  strength: number;
  specialItemKey: string | null;
  specialItemChance: number | null;
}

export interface PentiliComputed {
  level: number;
  maxHp: number;
  attack: number;
  defense: number;
  xpReward: number;
  metal: [number, number];
  crystal: [number, number];
}

function value(curve: Curve, level: number, multiplier: number): number {
  return Math.max(1, Math.round(curve.base * Math.pow(level, curve.growth) * multiplier));
}

function range(curve: Curve, level: number, multiplier: number, spread: number): [number, number] {
  const mid = curve.base * Math.pow(level, curve.growth) * multiplier;
  return [Math.max(1, Math.round(mid * (1 - spread))), Math.max(1, Math.round(mid * (1 + spread)))];
}

/** What a Pentili becomes under a config — used for the godmaster preview and for applying. */
export function computePentili(config: PentiliBalanceConfig, own: PentiliOwnSettings): PentiliComputed {
  const zone = config.zones[own.zoneKey] ?? ZONE(1, 2, 'pioneer', 0.02);
  const level = own.levelOverride ?? zone.startLevel + own.orderInZone * zone.step;
  const multiplier = zone.strength * own.strength;
  const { stats, rewards } = config;
  return {
    level,
    maxHp: value(stats.hp, level, multiplier),
    attack: value(stats.attack, level, multiplier),
    defense: value(stats.defense, level, multiplier),
    xpReward: value(stats.xp, level, multiplier),
    metal: range(rewards.metal, level, multiplier, rewards.spread),
    crystal: range(rewards.crystal, level, multiplier, rewards.spread),
  };
}

/** The saved config merged over the defaults (new fields get their default). */
export async function loadPentiliBalance(db: Db): Promise<PentiliBalanceConfig> {
  const row = await db.balanceConfig.findUnique({ where: { key: PENTILI_BALANCE_KEY } });
  const saved = (row?.data ?? {}) as Partial<PentiliBalanceConfig>;
  return {
    stats: { ...DEFAULT_PENTILI_BALANCE.stats, ...(saved.stats ?? {}) },
    rewards: {
      metal: saved.rewards?.metal ?? DEFAULT_PENTILI_BALANCE.rewards.metal,
      crystal: saved.rewards?.crystal ?? DEFAULT_PENTILI_BALANCE.rewards.crystal,
      spread: saved.rewards?.spread ?? DEFAULT_PENTILI_BALANCE.rewards.spread,
    },
    zones: Object.fromEntries(
      Object.entries({ ...DEFAULT_PENTILI_BALANCE.zones, ...(saved.zones ?? {}) }).map(([key, zone]) => [key, { ...DEFAULT_PENTILI_BALANCE.zones[key], ...zone }]),
    ),
  };
}

/**
 * Writes every Pentili's level, stats, XP and loot table from the config.
 * Pentili rows are updated in place (battle reports keep pointing at them);
 * their loot rows are replaced.
 */
export async function applyPentiliBalance(db: Db, config: PentiliBalanceConfig): Promise<void> {
  const pentili = await db.pentili.findMany({ include: { zone: { select: { key: true } } } });
  const itemKeys = new Set<string>(['energy_pack_small']);
  for (const zone of Object.values(config.zones)) {
    for (const suffix of SLOT_SUFFIXES) itemKeys.add(`${zone.itemTier}_${suffix}`);
    itemKeys.add(`${zone.itemTier}_fragment`);
    itemKeys.add(`${zone.itemTier}_upgrade`);
  }
  for (const p of pentili) if (p.specialItemKey) itemKeys.add(p.specialItemKey);
  const items = await db.itemDefinition.findMany({ where: { key: { in: [...itemKeys] } }, select: { id: true, key: true } });
  const itemId = new Map(items.map((i) => [i.key, i.id]));

  const loot: Prisma.LootDropCreateManyInput[] = [];
  for (const p of pentili) {
    const zone = config.zones[p.zone.key];
    const computed = computePentili(config, {
      zoneKey: p.zone.key,
      orderInZone: p.orderInZone,
      levelOverride: p.levelOverride,
      strength: p.strength,
      specialItemKey: p.specialItemKey,
      specialItemChance: p.specialItemChance,
    });
    await db.pentili.update({
      where: { id: p.id },
      data: { level: computed.level, maxHp: computed.maxHp, attack: computed.attack, defense: computed.defense, xpReward: computed.xpReward },
    });
    const item = (key: string, chance: number) => {
      const id = itemId.get(key);
      if (id && chance > 0) loot.push({ pentiliId: p.id, itemDefinitionId: id, dropChance: chance, minQuantity: 1, maxQuantity: 1 });
    };
    loot.push(
      { pentiliId: p.id, resourceType: 'METAL', dropChance: 1, minQuantity: computed.metal[0], maxQuantity: computed.metal[1] },
      { pentiliId: p.id, resourceType: 'CRYSTAL', dropChance: 1, minQuantity: computed.crystal[0], maxQuantity: computed.crystal[1] },
    );
    if (zone) {
      for (const suffix of SLOT_SUFFIXES) item(`${zone.itemTier}_${suffix}`, zone.itemChance);
      item(`${zone.itemTier}_fragment`, zone.fragmentChance);
      item(`${zone.itemTier}_upgrade`, zone.upgradeStoneChance);
      item('energy_pack_small', zone.energyPackChance);
    }
    if (p.specialItemKey && p.specialItemChance) item(p.specialItemKey, p.specialItemChance);
  }
  await db.lootDrop.deleteMany({ where: { pentiliId: { in: pentili.map((p) => p.id) } } });
  await db.lootDrop.createMany({ data: loot });
}
