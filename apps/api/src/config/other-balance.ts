import { Prisma, PrismaClient } from '@prisma/client';
import { GAME_BALANCE } from './game-config';

/**
 * "Other values" (owner decision, 2026-10-19): the single numbers of
 * GAME_BALANCE that are game balance, edited in godmaster → Balance → Other
 * values. A saved value overrides the one in game-config.ts in place, so every
 * place that reads GAME_BALANCE gets it at once — which is why only values
 * that are read at the moment they're used are listed here (nothing copied
 * into a constant at start-up). Technical limits (logins, chat, e-mail…) go to
 * Settings → Technical (the second list below), the lists (daily tasks,
 * achievements, level rewards) to their own
 * page, and the option percentages wait until their texts take the number
 * from the server. godmaster holds the Bulgarian labels.
 */

export type OtherValueKind = 'int' | 'number' | 'percent';

export interface OtherValueDef {
  path: string;
  kind: OtherValueKind;
  min: number;
  max: number;
  // When set, only these values are allowed (godmaster shows a dropdown).
  oneOf?: number[];
}

const I = (path: string, min: number, max: number): OtherValueDef => ({ path, kind: 'int', min, max });
const N = (path: string, min: number, max: number): OtherValueDef => ({ path, kind: 'number', min, max });
const P = (path: string, max = 1): OtherValueDef => ({ path, kind: 'percent', min: 0, max });

export const OTHER_VALUES: OtherValueDef[] = [
  // Energy
  I('newPlayer.actionEnergy', 1, 100),
  I('actionEnergy.regenIntervalMinutes', 1, 1440),
  I('inventory.baseCapacity', 1, 500),
  // Combat
  I('combat.basePlayerHp', 0, 100_000),
  I('combat.baseAttack', 0, 100_000),
  I('combat.baseDefense', 0, 100_000),
  P('combat.damageVariance', 0.9),
  I('combat.maxRounds', 1, 500),
  P('combat.criticalChance'),
  N('combat.criticalMultiplier', 1, 10),
  // Quality and race lock of dropped items
  P('rarity.rareChance'),
  P('boxOpen.epicChance'),
  P('raceLock.ascendantUniversalChance'),
  // Attribute points
  I('robotAttributes.basePointsPerLevel', 0, 100),
  N('robotAttributes.pointsGrowthRate', 0, 1),
  I('robotAttributes.baseAttributeCost', 1, 100),
  N('robotAttributes.attributeCostGrowthRate', 0, 1),
  N('robotAttributes.damagePointValue', 0, 1000),
  N('robotAttributes.defensePointValue', 0, 1000),
  N('robotAttributes.hpPointValue', 0, 10_000),
  N('robotAttributes.evasionPointValue', 0.01, 10),
  N('robotAttributes.maxEvasionPercent', 0, 90),
  // Recycling
  I('itemRecycle.fragmentsPerItem', 0, 100),
  I('recyclingExtraFragmentEvery', 1, 100),
  // Boss formations
  N('bossFormations.enrollmentWindowHours', 0.1, 168),
  N('bossFormations.visibilityEditWindowHours', 0, 168),
  // Hours between the cooldown resets; must divide 24 so the reset times repeat daily.
  { path: 'bossFormations.actionCooldownHours', kind: 'int', min: 1, max: 24, oneOf: [1, 2, 3, 4, 6, 8, 12, 24] },
  I('bossFormations.cooldownResetHour', 0, 23),
  P('bossFormations.maxDamageDecrease', 0.99),
  // Market
  P('market.creditsSaleFee', 0.5),
  // PvP
  I('pvp.minLevel', 1, 100),
  I('pvp.attackCostEnergy', 0, 100),
  P('pvp.resourceStealPercentage'),
  N('pvp.attackCooldownMinutes', 0, 10_080),
  N('pvp.revengeProtectionMinutes', 0, 10_080),
  P('pvp.levelDifferenceAdjustment'),
  N('pvp.minStealMultiplier', 0, 10),
  N('pvp.maxStealMultiplier', 0, 10),
  // Clan wars
  I('clanWar.minMembersToParticipate', 1, 100),
  N('clanWar.maxDurationHours', 1, 720),
  N('clanWar.rematchCooldownDays', 0, 365),
  N('clanWar.poolMultiplier', 0.01, 100_000),
  N('clanWar.targetProtectionMinutes', 0, 10_080),
  N('clanWar.attackCooldownMinutes', 0, 10_080),
  P('clanWar.conquestTreasuryStealPercentage'),
  P('clanWar.decisionTreasuryStealPercentage'),
  // The Core
  I('core.attackCostEnergy', 0, 100),
  I('core.attackCooldownSeconds', 0, 86_400),
  I('core.attack', 0, 10_000_000),
  I('core.defense', 0, 10_000_000),
  I('core.maxRounds', 1, 500),
  // Exchange
  N('exchange.metalPerCrystal', 0.01, 1000),
  P('exchange.baseRateFactor'),
  P('exchange.rateFactorPerLevel'),
  N('exchange.creditsPer100', 0, 100),
  // VIP
  I('vip.multiAttackCount', 1, 20),
  I('vip.maxEnergyBonus', 0, 100),
];

// Technical limits (owner decision, 2026-10-19), edited in godmaster →
// Settings → Technical: not balance, but kept the same way. Message lengths
// aren't here — the request checks and the game's input fields have them too.
export const TECHNICAL_VALUES: OtherValueDef[] = [
  I('loginLimits.maxFailures', 3, 100),
  I('loginLimits.windowMinutes', 1, 1440),
  I('loginLimits.adminMaxFailures', 3, 100),
  I('security.loginRetentionDays', 7, 365),
  I('security.refreshRecordHours', 1, 168),
  I('email.verifyTokenHours', 1, 720),
  I('email.resetTokenMinutes', 5, 1440),
  I('email.maxPerHour', 1, 50),
  I('support.maxNewPerDay', 1, 100),
  I('support.maxOpen', 1, 100),
  I('support.maxUnansweredMessages', 1, 50),
  I('moderation.reportsPerDay', 1, 1000),
  I('moderation.secondsBetweenReports', 0, 3600),
  I('moderation.minAccountAgeDays', 0, 365),
  I('moderation.minLevel', 1, 100),
  I('moderation.reputationWindow', 1, 100),
  I('moderation.maxDismissedInWindow', 1, 100),
  I('moderation.suspensionDays', 0, 365),
  I('presence.onlineThresholdMinutes', 1, 120),
  I('presence.activityUpdateThrottleSeconds', 10, 3600),
  I('clanChat.minSecondsBetweenMessages', 0, 600),
  I('clanChat.historyLimit', 10, 1000),
  I('directMessages.minSecondsBetweenMessages', 0, 600),
  I('directMessages.historyLimit', 10, 1000),
  I('core.standingsTopN', 3, 100),
  I('core.playerRankingPageSize', 5, 100),
];

type Db = PrismaClient | Prisma.TransactionClient;
type Mutable = Record<string, unknown>;

function read(path: string): number {
  return path.split('.').reduce<unknown>((o, k) => (o as Mutable)[k], GAME_BALANCE) as number;
}

function write(path: string, value: number): void {
  const keys = path.split('.');
  const parent = keys.slice(0, -1).reduce<unknown>((o, k) => (o as Mutable)[k], GAME_BALANCE) as Mutable;
  parent[keys[keys.length - 1]] = value;
}

/** One list of overridable values, saved under its own BalanceConfig key. */
export interface OverrideSet {
  key: string;
  defs: OtherValueDef[];
  // The values in game-config.ts, captured before any override.
  defaults: Record<string, number>;
  load(db: Db): Promise<Record<string, number>>;
  apply(values: Record<string, number>): void;
  current(): Record<string, number>;
}

function overrideSet(key: string, defs: OtherValueDef[]): OverrideSet {
  const defaults = Object.fromEntries(defs.map((d) => [d.path, read(d.path)]));
  return {
    key,
    defs,
    defaults,
    async load(db) {
      const row = await db.balanceConfig.findUnique({ where: { key } });
      const saved = (row?.data ?? {}) as Record<string, unknown>;
      return Object.fromEntries(defs.filter((d) => typeof saved[d.path] === 'number').map((d) => [d.path, saved[d.path] as number]));
    },
    // Every value into GAME_BALANCE: the saved one, or the default.
    apply(values) {
      for (const d of defs) write(d.path, values[d.path] ?? defaults[d.path]);
    },
    current() {
      return Object.fromEntries(defs.map((d) => [d.path, read(d.path)]));
    },
  };
}

export const OTHER_SET = overrideSet('other', OTHER_VALUES);
export const TECHNICAL_SET = overrideSet('technical', TECHNICAL_VALUES);
