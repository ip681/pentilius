import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Base buildings and research balance (owner decision, 2026-10-19): edited in
 * godmaster → Balance → Buildings & research instead of only in code. One
 * model for everything, the one built for the base balance of 2026-10-14:
 *
 *   production(L) = perHour × L × growth^(L-1)            (the two mines)
 *   value(L)      = metal production(L) × L × costHours    (metal-equivalent)
 *   cost(L)       = value(L) × the building's/research's factors
 *   time(L)       = base seconds × L^growth × the building's time factor
 *
 * plus each building's own effect per level (Warehouse slots, Defense System %
 * …) and each research's bonus per level. The defaults reproduce the values
 * of 2026-10-14 exactly. Lives in src/config because the seed uses it too.
 */

export interface Curve {
  base: number;
  growth: number;
}

// The per-level effect columns on BuildingType that godmaster may edit.
export const BUILDING_EFFECT_FIELDS = [
  'capacityBonusPerLevel',
  'marketSlotBonusPerLevel',
  'defenseBonusPerLevel',
  'pvpProtectionMinutesPerLevel',
  'protectedMetalPerLevel',
  'protectedCrystalPerLevel',
  'protectedCreditsPerLevel',
  'researchCapPerLevel',
  'exchangeLimitPerLevel',
  'energyRegenBonusPerLevel',
  'maxEnergyBonusEvery',
] as const;
export type BuildingEffectField = (typeof BUILDING_EFFECT_FIELDS)[number];
// Whole numbers in the database (the rest are fractions).
const INT_EFFECT_FIELDS = new Set<BuildingEffectField>([
  'capacityBonusPerLevel',
  'pvpProtectionMinutesPerLevel',
  'protectedMetalPerLevel',
  'protectedCrystalPerLevel',
  'protectedCreditsPerLevel',
  'researchCapPerLevel',
  'exchangeLimitPerLevel',
  'maxEnergyBonusEvery',
]);

export interface BuildingBalance {
  // Cost factors against value(L), and the build-time factor.
  metal: number;
  crystal: number;
  time: number;
  maxLevel: number;
  // Only the effects this building has.
  effects: Partial<Record<BuildingEffectField, number>>;
}

export interface ResearchBalance {
  // Bonus per level as a fraction (0.02 = +2%).
  bonusPerLevel: number;
  maxLevel: number;
}

export interface BuildingBalanceConfig {
  production: { metalPerHour: number; crystalPerHour: number; growth: number };
  // value(L) = metal production(L) × L × costHours.
  costHours: number;
  buildTime: Curve;
  buildings: Record<string, BuildingBalance>;
  research: {
    metal: number;
    crystal: number;
    credits: number;
    time: Curve;
    items: Record<string, ResearchBalance>;
  };
}

const B = (metal: number, crystal: number, time: number, effects: Partial<Record<BuildingEffectField, number>> = {}): BuildingBalance => ({
  metal,
  crystal,
  time,
  maxLevel: 30,
  effects,
});
const R = (bonusPerLevel: number): ResearchBalance => ({ bonusPerLevel, maxLevel: 30 });

export const DEFAULT_BUILDING_BALANCE: BuildingBalanceConfig = {
  production: { metalPerHour: 100, crystalPerHour: 60, growth: 1.08 },
  costHours: 0.5,
  buildTime: { base: 60, growth: 2.2 },
  buildings: {
    metal_mine: B(0, 1, 1),
    crystal_extractor: B(1.6, 0, 1),
    warehouse: B(0.6, 0.25, 0.8, { capacityBonusPerLevel: 2 }),
    trading_post: B(0.6, 0.25, 0.8, { marketSlotBonusPerLevel: 0.5 }),
    defense_system: B(0.8, 0.35, 1, { defenseBonusPerLevel: 0.005 }),
    defensive_wall: B(0.8, 0.35, 1, { pvpProtectionMinutesPerLevel: 2 }),
    hideout: B(0.8, 0.35, 1, { protectedMetalPerLevel: 300, protectedCrystalPerLevel: 180 }),
    research_center: B(1, 0.5, 1.2, { researchCapPerLevel: 1 }),
    exchange: B(0.8, 0.35, 1, { exchangeLimitPerLevel: 1000 }),
    reactor: B(1.2, 0.6, 1.2, { energyRegenBonusPerLevel: 0.01, maxEnergyBonusEvery: 10 }),
  },
  research: {
    metal: 1.5,
    crystal: 0.6,
    credits: 0.03,
    time: { base: 120, growth: 2.1 },
    items: {
      research_metal_production: R(0.02),
      research_crystal_production: R(0.02),
      research_weapon_systems: R(0.01),
      research_hull_engineering: R(0.01),
      research_construction: R(0.01),
      research_methods: R(0.01),
      research_navigation: R(0.02),
      research_metallurgy: R(0.01),
      research_recycling: R(0.02),
    },
  },
};

export const BUILDING_BALANCE_KEY = 'buildings';
// Which mine produces what.
const PRODUCERS: Record<string, 'METAL' | 'CRYSTAL'> = { metal_mine: 'METAL', crystal_extractor: 'CRYSTAL' };

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Rounds a cost to 3 significant digits — one rule at every size (owner
 * decision, 2026-10-19): 75, 8 230, 11 200, 419 000, 1 680 000. Round prices
 * read and compare more easily than exact ones.
 */
export function niceRound(value: number): number {
  if (value < 100) return Math.round(value);
  const step = Math.pow(10, Math.floor(Math.log10(value)) - 2);
  return Math.round(value / step) * step;
}

function production(perHour: number, level: number, growth: number): number {
  return Math.round(perHour * level * Math.pow(growth, level - 1));
}

/** Metal-equivalent value of a level: L × costHours hours of a level-L metal mine. */
export function levelValue(config: BuildingBalanceConfig, level: number): number {
  const { metalPerHour, growth } = config.production;
  return metalPerHour * level * Math.pow(growth, level - 1) * level * config.costHours;
}

export interface BuildingLevelRow {
  level: number;
  metalCost: number;
  crystalCost: number;
  constructionSeconds: number;
  producesResourceType: 'METAL' | 'CRYSTAL' | null;
  producesPerHour: number | null;
}

export function computeBuildingLevels(config: BuildingBalanceConfig, key: string): BuildingLevelRow[] {
  const b = config.buildings[key];
  if (!b) return [];
  const produces = PRODUCERS[key] ?? null;
  return Array.from({ length: b.maxLevel }, (_, i) => {
    const level = i + 1;
    const perHour = produces === 'METAL' ? config.production.metalPerHour : config.production.crystalPerHour;
    return {
      level,
      metalCost: niceRound(levelValue(config, level) * b.metal),
      crystalCost: niceRound(levelValue(config, level) * b.crystal),
      constructionSeconds: Math.round(config.buildTime.base * Math.pow(level, config.buildTime.growth) * b.time),
      producesResourceType: produces,
      producesPerHour: produces ? production(perHour, level, config.production.growth) : null,
    };
  });
}

export interface ResearchLevelRow {
  level: number;
  metalCost: number;
  crystalCost: number;
  creditsCost: number;
  researchSeconds: number;
}

export function computeResearchLevels(config: BuildingBalanceConfig, key: string): ResearchLevelRow[] {
  const r = config.research.items[key];
  if (!r) return [];
  return Array.from({ length: r.maxLevel }, (_, i) => {
    const level = i + 1;
    const value = levelValue(config, level);
    return {
      level,
      metalCost: niceRound(value * config.research.metal),
      crystalCost: niceRound(value * config.research.crystal),
      creditsCost: niceRound(value * config.research.credits),
      researchSeconds: Math.round(config.research.time.base * Math.pow(level, config.research.time.growth)),
    };
  });
}

/** The saved config merged over the defaults (new buildings/research and fields get their default). */
export async function loadBuildingBalance(db: Db): Promise<BuildingBalanceConfig> {
  const row = await db.balanceConfig.findUnique({ where: { key: BUILDING_BALANCE_KEY } });
  const saved = (row?.data ?? {}) as Partial<BuildingBalanceConfig>;
  const d = DEFAULT_BUILDING_BALANCE;
  return {
    production: { ...d.production, ...(saved.production ?? {}) },
    costHours: saved.costHours ?? d.costHours,
    buildTime: { ...d.buildTime, ...(saved.buildTime ?? {}) },
    buildings: Object.fromEntries(
      Object.entries(d.buildings).map(([key, def]) => {
        const s = saved.buildings?.[key];
        // Only the effects the building has by default (a dropped effect, like the
        // Hideout's Credits, disappears even from an older saved config).
        const effects = Object.fromEntries(Object.entries(def.effects).map(([f, v]) => [f, s?.effects?.[f as BuildingEffectField] ?? v]));
        return [key, { ...def, ...(s ?? {}), effects }];
      }),
    ),
    research: {
      metal: saved.research?.metal ?? d.research.metal,
      crystal: saved.research?.crystal ?? d.research.crystal,
      credits: saved.research?.credits ?? d.research.credits,
      time: { ...d.research.time, ...(saved.research?.time ?? {}) },
      items: Object.fromEntries(Object.entries(d.research.items).map(([key, def]) => [key, { ...def, ...(saved.research?.items?.[key] ?? {}) }])),
    },
  };
}

/**
 * Writes the building types (max level, effects), their level rows, and the
 * research types (bonus, max level) with their level rows. Rows above a
 * lowered max level are kept (players may already be there) but can't be
 * built any more.
 */
export async function applyBuildingBalance(db: Db, config: BuildingBalanceConfig): Promise<void> {
  const types = await db.buildingType.findMany({ where: { key: { in: Object.keys(config.buildings) } } });
  for (const type of types) {
    const b = config.buildings[type.key];
    // Every effect column: the building's own values, null for the ones it doesn't have.
    const effects = Object.fromEntries(
      BUILDING_EFFECT_FIELDS.map((f) => [f, b.effects[f] === undefined ? null : INT_EFFECT_FIELDS.has(f) ? Math.round(b.effects[f]!) : b.effects[f]!]),
    );
    await db.buildingType.update({ where: { id: type.id }, data: { maxLevel: b.maxLevel, ...effects } });
    for (const row of computeBuildingLevels(config, type.key)) {
      const data = { buildingTypeId: type.id, ...row };
      await db.buildingLevelCost.upsert({ where: { buildingTypeId_level: { buildingTypeId: type.id, level: row.level } }, update: data, create: data });
    }
  }
  const researchTypes = await db.researchType.findMany({ where: { key: { in: Object.keys(config.research.items) } } });
  for (const type of researchTypes) {
    const r = config.research.items[type.key];
    await db.researchType.update({ where: { id: type.id }, data: { bonusPerLevel: r.bonusPerLevel, maxLevel: r.maxLevel } });
    for (const row of computeResearchLevels(config, type.key)) {
      const data = { researchTypeId: type.id, ...row };
      await db.researchLevelCost.upsert({ where: { researchTypeId_level: { researchTypeId: type.id, level: row.level } }, update: data, create: data });
    }
  }
}
