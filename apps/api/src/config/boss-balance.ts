import { Prisma, PrismaClient } from '@prisma/client';
import { PentiliBalanceConfig } from './pentili-balance';

/**
 * Bosses balance (owner decision, 2026-10-19): edited in godmaster → Balance
 * → Bosses. Stats, XP, minimum level and the guaranteed box per boss; Metal
 * and Crystal pay "as much as N fights against a Pentil of the boss's minimum
 * level" (the Pentili reward curves, ± their spread), so they stay in step
 * with the rest of the game; items and Credits are rows with a chance and an
 * amount. Credits default to none (owner decision, same date: bosses
 * shouldn't give Credits, but the setting stays). Every rewarded participant
 * rolls the loot separately. The stats default to the values of 2026-10-11;
 * the old loot rows were examples and were replaced. Lives in src/config
 * because the seed uses it too.
 */

export interface BossItemDrop {
  itemKey: string;
  chance: number;
  min: number;
  max: number;
}

export interface BossBalance {
  minLevel: number;
  maxHp: number;
  attack: number;
  defense: number;
  // Split evenly between the filled slots.
  xpReward: number;
  boxKey: string;
  // Metal and Crystal for each participant, like this many Pentili fights at minLevel.
  resourceFights: number;
  credits: { chance: number; min: number; max: number };
  items: BossItemDrop[];
}

export interface BossBalanceConfig {
  bosses: Record<string, BossBalance>;
}

export const BOSS_BALANCE_KEY = 'bosses';

const STONES = (tier: string): BossItemDrop[] => [{ itemKey: `${tier}_upgrade`, chance: 0.5, min: 1, max: 2 }];
const NO_CREDITS = { chance: 0, min: 0, max: 0 };

export const DEFAULT_BOSS_BALANCE: BossBalanceConfig = {
  bosses: {
    boss_verdant_warden: { minLevel: 15, maxHp: 1400, attack: 130, defense: 60, xpReward: 16000, boxKey: 'pioneer_box', resourceFights: 12, credits: NO_CREDITS, items: STONES('pioneer') },
    boss_ridgeback_alpha: { minLevel: 25, maxHp: 2500, attack: 210, defense: 180, xpReward: 32000, boxKey: 'ascendant_box', resourceFights: 12, credits: NO_CREDITS, items: STONES('ascendant') },
    boss_crimson_harbinger: { minLevel: 45, maxHp: 4700, attack: 380, defense: 350, xpReward: 68000, boxKey: 'coreforged_box', resourceFights: 12, credits: NO_CREDITS, items: STONES('coreforged') },
    boss_frost_sovereign: { minLevel: 65, maxHp: 6100, attack: 490, defense: 440, xpReward: 110000, boxKey: 'coreforged_box', resourceFights: 12, credits: NO_CREDITS, items: STONES('coreforged') },
  },
};

type Db = PrismaClient | Prisma.TransactionClient;

/** Metal and Crystal ranges a participant gets from this boss. */
export function bossResourceRanges(boss: BossBalance, pentili: PentiliBalanceConfig): { metal: [number, number]; crystal: [number, number] } {
  const range = (curve: { base: number; growth: number }): [number, number] => {
    const mid = boss.resourceFights * curve.base * Math.pow(boss.minLevel, curve.growth);
    const spread = pentili.rewards.spread;
    return [Math.max(0, Math.round(mid * (1 - spread))), Math.max(0, Math.round(mid * (1 + spread)))];
  };
  return { metal: range(pentili.rewards.metal), crystal: range(pentili.rewards.crystal) };
}

export async function loadBossBalance(db: Db): Promise<BossBalanceConfig> {
  const row = await db.balanceConfig.findUnique({ where: { key: BOSS_BALANCE_KEY } });
  const saved = (row?.data ?? {}) as Partial<BossBalanceConfig>;
  return {
    bosses: Object.fromEntries(
      Object.entries(DEFAULT_BOSS_BALANCE.bosses).map(([key, def]) => {
        const s = saved.bosses?.[key];
        return [key, { ...def, ...(s ?? {}), credits: { ...def.credits, ...(s?.credits ?? {}) }, items: s?.items ?? def.items }];
      }),
    ),
  };
}

/** Writes each boss's stats and box, and replaces its loot rows. */
export async function applyBossBalance(db: Db, config: BossBalanceConfig, pentili: PentiliBalanceConfig): Promise<void> {
  const itemKeys = new Set(Object.values(config.bosses).flatMap((b) => [b.boxKey, ...b.items.map((i) => i.itemKey)]));
  const items = await db.itemDefinition.findMany({ where: { key: { in: [...itemKeys] } }, select: { id: true, key: true } });
  const itemId = new Map(items.map((i) => [i.key, i.id]));
  const bosses = await db.boss.findMany({ where: { key: { in: Object.keys(config.bosses) } } });
  for (const boss of bosses) {
    const b = config.bosses[boss.key];
    const boxId = itemId.get(b.boxKey);
    await db.boss.update({
      where: { id: boss.id },
      data: {
        minLevel: b.minLevel,
        maxHp: b.maxHp,
        attack: b.attack,
        defense: b.defense,
        xpReward: b.xpReward,
        ...(boxId ? { guaranteedBoxItemDefinitionId: boxId } : {}),
      },
    });
    const { metal, crystal } = bossResourceRanges(b, pentili);
    const loot: Prisma.BossLootDropCreateManyInput[] = [];
    if (metal[1] > 0) loot.push({ bossId: boss.id, resourceType: 'METAL', dropChance: 1, minQuantity: metal[0], maxQuantity: metal[1] });
    if (crystal[1] > 0) loot.push({ bossId: boss.id, resourceType: 'CRYSTAL', dropChance: 1, minQuantity: crystal[0], maxQuantity: crystal[1] });
    if (b.credits.chance > 0 && b.credits.max > 0) {
      loot.push({ bossId: boss.id, resourceType: 'CREDITS', dropChance: b.credits.chance, minQuantity: b.credits.min, maxQuantity: b.credits.max });
    }
    for (const drop of b.items) {
      const id = itemId.get(drop.itemKey);
      if (id && drop.chance > 0 && drop.max > 0) loot.push({ bossId: boss.id, itemDefinitionId: id, dropChance: drop.chance, minQuantity: drop.min, maxQuantity: drop.max });
    }
    await db.bossLootDrop.deleteMany({ where: { bossId: boss.id } });
    await db.bossLootDrop.createMany({ data: loot });
  }
}
