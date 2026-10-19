import { Prisma, PrismaClient } from '@prisma/client';

/**
 * XP per level (owner decision, 2026-10-19): edited in godmaster → Balance →
 * XP, next to the Pentili, since together they set how fast players level.
 * XP to go from level L to L+1 = base × L^growth.
 * One curve for every level, no per-level values (owner decision,
 * 2026-10-19 — like the Pentili: set the curve, read the table). Lives in
 * src/config because the seed uses it too.
 *
 * Default 15 × L^2.28: as light as the old hand-picked start (level 5: ~590
 * XP, level 10: ~2 860), a little faster in the middle, about the same at the
 * top (level 99: ~533 000). If a faster start is ever wanted, add one
 * "first N levels × factor" setting rather than per-level values.
 */

export interface XpBalanceConfig {
  base: number;
  growth: number;
}

// The level cap is 100 (instructions/GAME_SYSTEMS.md); the last row is the cost of 99 -> 100.
export const XP_MAX_LEVEL = 100;
export const XP_BALANCE_KEY = 'xp';

export const DEFAULT_XP_BALANCE: XpBalanceConfig = { base: 15, growth: 2.28 };

type Db = PrismaClient | Prisma.TransactionClient;

/** XP needed for each level 1..99 (to reach the next one). */
export function computeXpThresholds(config: XpBalanceConfig): { level: number; xpRequired: number }[] {
  const rows: { level: number; xpRequired: number }[] = [];
  for (let level = 1; level < XP_MAX_LEVEL; level++) {
    rows.push({ level, xpRequired: Math.max(1, Math.round(config.base * Math.pow(level, config.growth))) });
  }
  return rows;
}

export async function loadXpBalance(db: Db): Promise<XpBalanceConfig> {
  const row = await db.balanceConfig.findUnique({ where: { key: XP_BALANCE_KEY } });
  const saved = (row?.data ?? {}) as Partial<XpBalanceConfig>;
  return {
    base: saved.base ?? DEFAULT_XP_BALANCE.base,
    growth: saved.growth ?? DEFAULT_XP_BALANCE.growth,
  };
}

/** Writes the level thresholds. Players keep their level and XP; a lower threshold just levels them up on their next XP gain. */
export async function applyXpBalance(db: Db, config: XpBalanceConfig): Promise<void> {
  for (const row of computeXpThresholds(config)) {
    await db.levelThreshold.upsert({ where: { level: row.level }, update: { xpRequired: row.xpRequired }, create: row });
  }
}
