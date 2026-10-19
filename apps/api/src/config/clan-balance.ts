import { Prisma, PrismaClient } from '@prisma/client';
import { BuildingBalanceConfig, levelValue, loadBuildingBalance, niceRound } from './building-balance';
import { GAME_BALANCE } from './game-config';

/**
 * Clan buildings balance (owner decision, 2026-10-19): edited in godmaster →
 * Balance → Clan buildings. Costs follow the same model as the personal
 * buildings (value(L) from the mines in the buildings balance) × a clan
 * factor, since the whole clan pays. A building with few levels (the Member
 * Hall) can cost like several levels of the others per level (levelStep),
 * and each building has its own cost factor (the Cantina 0.8, since it's
 * only active part of the time). The Cantina is capped at level 30 like the rest (owner decision,
 * 2026-10-19 — it had no cap before, so the richest clan's Core bonus grew
 * without end). Also here: the Cantina's activation (cost and hours) and the
 * Generator's "+1 max energy" levels, which the game reads while running.
 * The defaults reproduce the values of 2026-10-14 exactly (Cantina: levels 1-30). Lives in
 * src/config because the seed uses it too.
 */

export interface ClanBuildingBalance {
  bonusPerLevel: number;
  maxLevel: number;
  // Each level costs like this many levels of the model (Member Hall: 3).
  levelStep: number;
  // This building's cost against the others (the Cantina: 0.8).
  cost: number;
}

export interface ClanBalanceConfig {
  costFactor: number;
  crystal: number;
  credits: number;
  buildTime: { base: number; growth: number };
  buildings: Record<string, ClanBuildingBalance>;
  // The Cantina's activation (its levels are in `buildings` like the rest).
  tavern: {
    activationHours: number;
    // Activation cost per level, growing like production.
    activationMetal: number;
    activationCrystal: number;
    activationCredits: number;
  };
  generatorMaxEnergyLevels: number[];
}

export const CLAN_BALANCE_KEY = 'clan';

export const DEFAULT_CLAN_BALANCE: ClanBalanceConfig = {
  costFactor: 10,
  crystal: 0.4,
  credits: 0.03,
  buildTime: { base: 90, growth: 2.2 },
  buildings: {
    member_hall: { bonusPerLevel: 2, maxLevel: 10, levelStep: 3, cost: 1 },
    clan_forge: { bonusPerLevel: 0.01, maxLevel: 30, levelStep: 1, cost: 1 },
    clan_depot: { bonusPerLevel: 0.01, maxLevel: 30, levelStep: 1, cost: 1 },
    clan_generator: { bonusPerLevel: 0.005, maxLevel: 30, levelStep: 1, cost: 1 },
    clan_tavern: { bonusPerLevel: 0.01, maxLevel: 30, levelStep: 1, cost: 0.8 },
  },
  tavern: {
    activationHours: GAME_BALANCE.clanTavern.activationHours,
    activationMetal: GAME_BALANCE.clanTavern.activationMetalPerLevel,
    activationCrystal: GAME_BALANCE.clanTavern.activationCrystalPerLevel,
    activationCredits: GAME_BALANCE.clanTavern.activationCreditsPerLevel,
  },
  generatorMaxEnergyLevels: [...GAME_BALANCE.clanGenerator.maxEnergyLevels],
};

// Safety net: rows stop where a cost would no longer fit the database column.
const INT_LIMIT = 2_000_000_000;

type Db = PrismaClient | Prisma.TransactionClient;

export interface ClanLevelRow {
  level: number;
  metalCost: number;
  crystalCost: number;
  creditsCost: number;
  constructionSeconds: number;
}

export function computeClanLevels(config: ClanBalanceConfig, buildings: BuildingBalanceConfig, key: string): ClanLevelRow[] {
  const b = config.buildings[key];
  if (!b) return [];
  const rows: ClanLevelRow[] = [];
  for (let level = 1; level <= b.maxLevel; level++) {
    const step = level * b.levelStep;
    const value = levelValue(buildings, step) * config.costFactor * b.cost;
    if (value > INT_LIMIT) break;
    rows.push({
      level,
      metalCost: niceRound(value),
      crystalCost: niceRound(value * config.crystal),
      creditsCost: niceRound(value * config.credits),
      constructionSeconds: Math.round(config.buildTime.base * Math.pow(step, config.buildTime.growth)),
    });
  }
  return rows;
}

export async function loadClanBalance(db: Db): Promise<ClanBalanceConfig> {
  const row = await db.balanceConfig.findUnique({ where: { key: CLAN_BALANCE_KEY } });
  const saved = (row?.data ?? {}) as Partial<ClanBalanceConfig>;
  const d = DEFAULT_CLAN_BALANCE;
  return {
    costFactor: saved.costFactor ?? d.costFactor,
    crystal: saved.crystal ?? d.crystal,
    credits: saved.credits ?? d.credits,
    buildTime: { ...d.buildTime, ...(saved.buildTime ?? {}) },
    buildings: Object.fromEntries(Object.entries(d.buildings).map(([key, def]) => [key, { ...def, ...(saved.buildings?.[key] ?? {}) }])),
    tavern: {
      activationHours: saved.tavern?.activationHours ?? d.tavern.activationHours,
      activationMetal: saved.tavern?.activationMetal ?? d.tavern.activationMetal,
      activationCrystal: saved.tavern?.activationCrystal ?? d.tavern.activationCrystal,
      activationCredits: saved.tavern?.activationCredits ?? d.tavern.activationCredits,
    },
    generatorMaxEnergyLevels: saved.generatorMaxEnergyLevels ?? d.generatorMaxEnergyLevels,
  };
}

/** Writes the clan building types (bonus, max level) and their level rows. */
export async function applyClanBalance(db: Db, config: ClanBalanceConfig): Promise<void> {
  const buildings = await loadBuildingBalance(db);
  const types = await db.clanBuildingType.findMany({ where: { key: { in: Object.keys(config.buildings) } } });
  for (const type of types) {
    const rows = computeClanLevels(config, buildings, type.key);
    await db.clanBuildingType.update({ where: { id: type.id }, data: { bonusPerLevel: config.buildings[type.key].bonusPerLevel, maxLevel: rows.length } });
    for (const r of rows) {
      const data = { clanBuildingTypeId: type.id, ...r };
      await db.clanBuildingLevelCost.upsert({ where: { clanBuildingTypeId_level: { clanBuildingTypeId: type.id, level: r.level } }, update: data, create: data });
    }
  }
  setClanRuntime(config);
}

// What the running game reads (Cantina activation, Generator levels) — set
// when the API starts and on every save, so godmaster changes apply at once.
let runtime: ClanBalanceConfig = DEFAULT_CLAN_BALANCE;
export function setClanRuntime(config: ClanBalanceConfig): void {
  runtime = config;
}
export function clanRuntime(): ClanBalanceConfig {
  return runtime;
}
