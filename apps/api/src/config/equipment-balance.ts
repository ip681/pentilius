import { Prisma, PrismaClient } from '@prisma/client';
import { GAME_BALANCE } from './game-config';

/**
 * Equipment sets balance (owner decision, 2026-10-19): edited in godmaster →
 * Balance → Sets. What each slot of each set gives, how far a set can be
 * upgraded, what an upgrade gives and costs, and what selling pays. Items in
 * players' hands read their definition, so a change applies to every owned
 * item at once. The defaults reproduce the values of 2026-10-19 exactly.
 * Lives in src/config because the seed uses it too.
 */

export const SET_TIERS = ['pioneer', 'ascendant', 'coreforged'] as const;
export type SetTier = (typeof SET_TIERS)[number];
export const EQUIPMENT_SLOTS = ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'ARMOR', 'CORE', 'LEFT_LEG', 'RIGHT_LEG'] as const;
export type EquipmentSlotKey = (typeof EQUIPMENT_SLOTS)[number];
// Item key = "<set>_<part>", the same part word per slot in every set.
const SLOT_PART: Record<EquipmentSlotKey, string> = {
  HEAD: 'head_scanner',
  LEFT_ARM: 'left_arm_blaster',
  RIGHT_ARM: 'right_arm_guard',
  ARMOR: 'armor_plating',
  CORE: 'core_battery',
  LEFT_LEG: 'left_leg_actuator',
  RIGHT_LEG: 'right_leg_actuator',
};

export function equipmentItemKey(tier: SetTier, slot: EquipmentSlotKey): string {
  return `${tier}_${SLOT_PART[slot]}`;
}

export interface SlotStats {
  attack: number;
  defense: number;
  hp: number;
}

export interface SetBalance {
  maxUpgradeLevel: number;
  // What selling one item of this set pays (before the quality multiplier).
  sellMetal: number;
  sellCrystal: number;
  slots: Record<EquipmentSlotKey, SlotStats>;
}

export interface EquipmentBalanceConfig {
  sets: Record<SetTier, SetBalance>;
  upgrade: {
    // Each upgrade level adds this fraction of the base stats (0.1 = +10%).
    bonusPerLevel: number;
    // Reaching level N costs materialsPerLevel × N stones of the set.
    materialsPerLevel: number;
    // Recycling gives fragments; this many make one stone.
    fragmentsPerStone: number;
  };
  qualitySellMultiplier: { NORMAL: number; RARE: number; EPIC: number };
}

export const EQUIPMENT_BALANCE_KEY = 'equipment';

const S = (attack: number, defense: number, hp: number): SlotStats => ({ attack, defense, hp });
const SET = (maxUpgradeLevel: number, tier: 'PIONEER' | 'ASCENDANT' | 'COREFORGED', slots: SlotStats[]): SetBalance => ({
  maxUpgradeLevel,
  sellMetal: GAME_BALANCE.itemSell.baseMetalByTier[tier],
  sellCrystal: GAME_BALANCE.itemSell.baseCrystalByTier[tier],
  slots: Object.fromEntries(EQUIPMENT_SLOTS.map((slot, i) => [slot, slots[i]])) as Record<EquipmentSlotKey, SlotStats>,
});

// Slot order: Head, Left Arm, Right Arm, Armor, Core, Left Leg, Right Leg.
export const DEFAULT_EQUIPMENT_BALANCE: EquipmentBalanceConfig = {
  sets: {
    pioneer: SET(5, 'PIONEER', [S(1, 0, 0), S(5, 0, 0), S(0, 5, 0), S(0, 2, 15), S(2, 2, 0), S(0, 0, 5), S(0, 0, 5)]),
    ascendant: SET(8, 'ASCENDANT', [S(4, 0, 0), S(12, 0, 0), S(0, 10, 0), S(0, 5, 30), S(6, 4, 0), S(0, 0, 20), S(0, 0, 20)]),
    coreforged: SET(10, 'COREFORGED', [S(8, 0, 0), S(24, 0, 0), S(0, 20, 0), S(0, 10, 60), S(12, 8, 0), S(0, 0, 40), S(0, 0, 40)]),
  },
  upgrade: {
    bonusPerLevel: GAME_BALANCE.combat.bonusPerUpgradeLevel,
    materialsPerLevel: GAME_BALANCE.itemUpgrade.materialsPerLevel,
    fragmentsPerStone: GAME_BALANCE.itemRecycle.fragmentsPerStone,
  },
  qualitySellMultiplier: { ...GAME_BALANCE.itemSell.qualityMultiplier },
};

type Db = PrismaClient | Prisma.TransactionClient;

/** The saved config merged over the defaults. */
export async function loadEquipmentBalance(db: Db): Promise<EquipmentBalanceConfig> {
  const row = await db.balanceConfig.findUnique({ where: { key: EQUIPMENT_BALANCE_KEY } });
  const saved = (row?.data ?? {}) as Partial<EquipmentBalanceConfig>;
  const d = DEFAULT_EQUIPMENT_BALANCE;
  return {
    sets: Object.fromEntries(
      SET_TIERS.map((tier) => {
        const s = saved.sets?.[tier];
        const def = d.sets[tier];
        return [
          tier,
          {
            maxUpgradeLevel: s?.maxUpgradeLevel ?? def.maxUpgradeLevel,
            sellMetal: s?.sellMetal ?? def.sellMetal,
            sellCrystal: s?.sellCrystal ?? def.sellCrystal,
            slots: Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, { ...def.slots[slot], ...(s?.slots?.[slot] ?? {}) }])),
          },
        ];
      }),
    ) as Record<SetTier, SetBalance>,
    upgrade: { ...d.upgrade, ...(saved.upgrade ?? {}) },
    qualitySellMultiplier: { ...d.qualitySellMultiplier, ...(saved.qualitySellMultiplier ?? {}) },
  };
}

/** The stats an item definition stores: only the ones it has ("{ attack: 5 }"). */
export function slotBaseStats(stats: SlotStats): Partial<SlotStats> {
  return Object.fromEntries(Object.entries(stats).filter(([, v]) => v > 0));
}

/** Writes every set item's stats and max upgrade level, and the runtime values. */
export async function applyEquipmentBalance(db: Db, config: EquipmentBalanceConfig): Promise<void> {
  for (const tier of SET_TIERS) {
    const set = config.sets[tier];
    for (const slot of EQUIPMENT_SLOTS) {
      await db.itemDefinition.updateMany({
        where: { key: equipmentItemKey(tier, slot) },
        data: { baseStats: slotBaseStats(set.slots[slot]) as Prisma.InputJsonValue, maxUpgradeLevel: set.maxUpgradeLevel },
      });
    }
  }
  setEquipmentRuntime(config);
}

/** Stones needed to go from +0 to +maxLevel (no research discount). */
export function stonesToMax(config: EquipmentBalanceConfig, maxLevel: number): number {
  let total = 0;
  for (let level = 0; level < maxLevel; level++) total += Math.max(1, Math.round(config.upgrade.materialsPerLevel * (level + 1)));
  return total;
}

// What the running game reads (upgrade bonus and cost, fragments per stone,
// sell values) — set when the API starts and on every save.
let runtime: EquipmentBalanceConfig = DEFAULT_EQUIPMENT_BALANCE;
export function setEquipmentRuntime(config: EquipmentBalanceConfig): void {
  runtime = config;
}
export function equipmentRuntime(): EquipmentBalanceConfig {
  return runtime;
}
