import { Prisma, PrismaClient } from '@prisma/client';
import { GAME_BALANCE } from './game-config';
import { PentiliBalanceConfig } from './pentili-balance';

/**
 * Expeditions balance (owner decision, 2026-10-19): edited in godmaster →
 * Balance → Expeditions. An expedition pays "as much as N fights against a
 * Pentil of your level" — Metal, Crystal and XP from the Pentili reward
 * curves at the player's level — so it stays worth doing all season (fixed
 * amounts were worthless after the first days). Short ones pay more per hour,
 * long ones more in total (GAME_SYSTEMS.md). No Credits (owner decision, same
 * date). The bonus item is a random item of the set of the player's highest
 * unlocked zone. Lives in src/config because the seed uses it too.
 */

export interface ExpeditionBalance {
  durationMinutes: number;
  // Pays like this many fights against a Pentil of the player's level.
  fights: number;
  bonusItemChance: number;
  requiredNavigationLevel: number;
}

export interface ExpeditionBalanceConfig {
  expeditions: Record<string, ExpeditionBalance>;
  // Cancelling early pays this share of what was earned so far.
  earlyCancelPercentage: number;
}

export const EXPEDITION_BALANCE_KEY = 'expeditions';

export const DEFAULT_EXPEDITION_BALANCE: ExpeditionBalanceConfig = {
  expeditions: {
    // ~3 fights per hour for the short one against 4 per hour from energy;
    // less per hour the longer it is. Level 1 is close to the old fixed amounts.
    expedition_short: { durationMinutes: 60, fights: 3, bonusItemChance: 0.03, requiredNavigationLevel: 0 },
    expedition_medium: { durationMinutes: 300, fights: 12, bonusItemChance: 0.06, requiredNavigationLevel: 1 },
    expedition_long: { durationMinutes: 600, fights: 22, bonusItemChance: 0.1, requiredNavigationLevel: 2 },
  },
  earlyCancelPercentage: GAME_BALANCE.expeditions.earlyCancelPercentage,
};

type Db = PrismaClient | Prisma.TransactionClient;

export interface ExpeditionRewards {
  metal: number;
  crystal: number;
  xp: number;
}

/** What an expedition pays a player of this level (before the Navigation research). */
export function expeditionRewards(expedition: ExpeditionBalance, pentili: PentiliBalanceConfig, level: number): ExpeditionRewards {
  const at = (curve: { base: number; growth: number }) => Math.max(1, Math.round(expedition.fights * curve.base * Math.pow(level, curve.growth)));
  return { metal: at(pentili.rewards.metal), crystal: at(pentili.rewards.crystal), xp: at(pentili.stats.xp) };
}

export async function loadExpeditionBalance(db: Db): Promise<ExpeditionBalanceConfig> {
  const row = await db.balanceConfig.findUnique({ where: { key: EXPEDITION_BALANCE_KEY } });
  const saved = (row?.data ?? {}) as Partial<ExpeditionBalanceConfig>;
  const d = DEFAULT_EXPEDITION_BALANCE;
  return {
    expeditions: Object.fromEntries(Object.entries(d.expeditions).map(([key, def]) => [key, { ...def, ...(saved.expeditions?.[key] ?? {}) }])),
    earlyCancelPercentage: saved.earlyCancelPercentage ?? d.earlyCancelPercentage,
  };
}

/**
 * Writes duration, unlock level and bonus chance to the expedition rows. The
 * reward columns keep what a level-1 player gets, for reference only — the
 * game computes rewards from the player's level. No Credits, no fixed item.
 */
export async function applyExpeditionBalance(db: Db, config: ExpeditionBalanceConfig, pentili: PentiliBalanceConfig): Promise<void> {
  for (const [key, e] of Object.entries(config.expeditions)) {
    const level1 = expeditionRewards(e, pentili, 1);
    await db.expeditionType.updateMany({
      where: { key },
      data: {
        durationMinutes: e.durationMinutes,
        requiredNavigationLevel: e.requiredNavigationLevel,
        bonusItemChance: e.bonusItemChance,
        bonusItemDefinitionId: null,
        metalReward: level1.metal,
        crystalReward: level1.crystal,
        xpReward: level1.xp,
        creditsReward: 0,
      },
    });
  }
}
