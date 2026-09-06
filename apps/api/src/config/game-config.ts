import { EquipmentSlot, ItemOption, ItemQuality, ItemTier } from '@prisma/client';

/**
 * Data-driven balance values (see instructions/GAME_SYSTEMS.md,
 * instructions/OPEN_DECISIONS.md). Every value here stands in for something
 * still marked UNDEFINED for the real game design — they exist only so
 * Milestone 1 has a working vertical slice. Never inline these numbers
 * elsewhere; import from here so they stay tunable in one place. See
 * instructions/OPEN_DECISIONS.md for the list of what is still placeholder.
 */
export const GAME_BALANCE = {
  actionEnergy: {
    // Regeneration rate is UNDEFINED in GAME_SYSTEMS.md — owner-specified at
    // 15 minutes per point (not a placeholder guess).
    regenIntervalMinutes: 15,
  },
  itemUpgrade: {
    // Cost curve and success/failure rules are UNDEFINED — M1 always succeeds
    // if the player can pay; no failure/protection-stone mechanics yet. Each
    // set has its own upgrade material (seed.ts's pioneer_upgrade/ascendant_upgrade/
    // coreforged_upgrade), same cost curve for every tier — owner-specified:
    // reaching level N costs N materials (level 1 -> 1, level 2 -> 2, ...).
    // cost(level) = materialsPerLevel * (level + 1).
    materialsPerLevel: 1,
  },
  inventory: {
    // Owner-specified: 30 unequipped-item slots, before any Warehouse bonus
    // (BuildingType.capacityBonusPerLevel). Equipped items don't count.
    baseCapacity: 30,
  },
  itemSell: {
    // Recycling value is UNDEFINED in GAME_SYSTEMS.md — flat by tier and quality,
    // deliberately ignoring upgradeLevel to keep the formula simple (owner
    // preference). Returns raw Metal/Crystal rather than Credits or the tier's
    // own upgrade material (kept scarce on purpose).
    baseMetalByTier: { PIONEER: 15, ASCENDANT: 40, COREFORGED: 100 } as Record<ItemTier, number>,
    baseCrystalByTier: { PIONEER: 5, ASCENDANT: 15, COREFORGED: 35 } as Record<ItemTier, number>,
    qualityMultiplier: { NORMAL: 1, RARE: 1.5, EPIC: 2 } as Record<ItemQuality, number>,
  },
  combat: {
    // Combat formula is UNDEFINED — placeholder linear model:
    // stat = sum(equipped baseStats) * (1 + upgradeLevel * bonusPerUpgradeLevel).
    bonusPerUpgradeLevel: 0.1,
    // Robots without hp-boosting gear equipped would otherwise start combat
    // with ~0 HP; this floor is a placeholder, not a real robot-frame rule.
    basePlayerHp: 100,
    // Damage variance per round and a hard round cap so combat always
    // terminates even if both sides' stats are near-identical.
    damageVariance: 0.1,
    maxRounds: 30,
    // Critical hits (instructions/GAME_SYSTEMS.md "Item quality and Excellent
    // options"): flat chance for every attack, same for all combatants — items
    // only add to the damage multiplier via the CRITICAL_DAMAGE option below,
    // never to the chance itself.
    criticalChance: 0.1,
    criticalMultiplier: 1.5,
  },
  // Fixed magnitudes for rolled "Excellent options" (owner-specified, not
  // ranges) — see ItemOption. Applied in pve/combat.service.ts's
  // computePlayerStats() by summing each equipped item's rolledOptions.
  itemOptionValues: {
    INCREASE_DAMAGE: 0.02,
    CRITICAL_DAMAGE: 0.1,
    INCREASE_MAX_HP: 0.04,
    DAMAGE_DECREASE: 0.04,
    DAMAGE_REFLECT: 0.04,
  } as Record<ItemOption, number>,
  // Which options a slot can roll — weapon slots deal damage, every other
  // slot is defensive.
  itemOptionPools: {
    WEAPON: ['INCREASE_DAMAGE', 'CRITICAL_DAMAGE'] as ItemOption[],
    ARMOR: ['INCREASE_MAX_HP', 'DAMAGE_DECREASE', 'DAMAGE_REFLECT'] as ItemOption[],
  },
  rarity: {
    // Chance any newly granted EQUIPMENT ItemInstance rolls RARE (1 option)
    // instead of NORMAL. EPIC (2 options) isn't rollable through grantItem yet
    // — reserved for a future boss box/cache mechanic, see OPEN_DECISIONS.md.
    rareChance: 0.05,
  },
  robotAttributes: {
    // "Core Attributes" point-buy system (instructions/GAME_SYSTEMS.md has no
    // prior ruling — new system, owner-specified curves, all tunable here).
    // New accounts start with this many unspent points — matches
    // Player.attributePointsAvailable's DB default; keep both in sync.
    startingPoints: 20,
    // points(level) = round(basePointsPerLevel * (1 + pointsGrowthRate)^(level-1))
    basePointsPerLevel: 3,
    pointsGrowthRate: 0.15,
    // cost(rank) = round(baseAttributeCost * (1 + attributeCostGrowthRate)^rank)
    // — cost resets per stat, so spreading points across stats is cheaper
    // than dumping everything into one (an accepted side-effect, not a bug).
    baseAttributeCost: 1,
    attributeCostGrowthRate: 0.2,
    // How much each spent point contributes to the real combat stat.
    damagePointValue: 2,
    defensePointValue: 1,
    hpPointValue: 5,
    // Evasion: personal chance to fully dodge an incoming attack (0 damage
    // that round) — self-contained, not compared against any opponent stat.
    // Owner-specified: 0.5% per point, hard-capped at 20% (rank 40). The
    // exponential attributeCostGrowthRate above is a natural soft-cap on top.
    evasionPointValue: 0.5,
    maxEvasionPercent: 20,
  },
  expeditions: {
    // Owner-specified: cancelling early pays out 70% of the reward earned
    // proportionally to elapsed time (not a placeholder — an actual decision).
    earlyCancelPercentage: 0.7,
  },
  bossHunts: {
    // Racial group synergy percentages are PROVISIONAL but explicitly
    // specified in instructions/GAME_SYSTEMS.md — not a guess, unlike the
    // per-boss encounter window (Boss.encounterWindowSeconds, seed data) and
    // the attack-share contribution split, both UNDEFINED ("boss timers",
    // "contribution calculation").
    synergyBonusByUniqueRaceCount: { 1: 0, 2: 0.05, 3: 0.1, 4: 0.15, 5: 0.25 } as Record<number, number>,
  },
  pvp: {
    // Owner-specified: PvP unlocks at level 5, and players below level 5
    // cannot be targeted either — not a placeholder guess.
    minLevel: 5,
    // Reuses Action Energy rather than a separate PvP resource — owner-specified.
    attackCostEnergy: 1,
    // Exact power range, cooldowns, defender losses, protected resources,
    // online defense bonus and ranking formula are all UNDEFINED
    // (instructions/OPEN_DECISIONS.md: "PvP"). These are placeholders so a
    // working, non-abusive loop exists — retune once real values are decided.
    resourceStealPercentage: 0.1,
    attackCooldownMinutes: 10,
    revengeProtectionMinutes: 10,
  },
  presence: {
    // No real-time system (instructions/ARCHITECTURE.md prefers elapsed-time
    // computation over a background job/socket per player) — "online" is just
    // "made an authenticated request within the last N minutes." No prior
    // ruling in GAME_SYSTEMS.md; owner-specified for the clan roster.
    onlineThresholdMinutes: 5,
    // How stale Player.lastActiveAt must be before JwtStrategy bothers
    // rewriting it — keeps this from adding a DB write to every request.
    activityUpdateThrottleSeconds: 60,
  },
  clanChat: {
    // Owner-specified, not placeholders: plain text only, no formatting/
    // attachments/edit/delete. Rate limit and history cap keep this cheap
    // to serve via polling (no WebSockets/Redis — see instructions/ARCHITECTURE.md's
    // "compute on read" preference).
    maxMessageLength: 500,
    minSecondsBetweenMessages: 2,
    historyLimit: 200,
  },
} as const;

/** Attribute points awarded for reaching the given level (see GAME_BALANCE.robotAttributes). */
export function attributePointsForLevel(level: number): number {
  const { basePointsPerLevel, pointsGrowthRate } = GAME_BALANCE.robotAttributes;
  return Math.round(basePointsPerLevel * (1 + pointsGrowthRate) ** (level - 1));
}

/** Cost to raise a Core Attribute from `currentRank` to `currentRank + 1`. */
export function attributeCostForRank(currentRank: number): number {
  const { baseAttributeCost, attributeCostGrowthRate } = GAME_BALANCE.robotAttributes;
  return Math.round(baseAttributeCost * (1 + attributeCostGrowthRate) ** currentRank);
}

/** The pool of rollable "Excellent options" for a given equipment slot. */
export function getOptionPool(slot: EquipmentSlot): ItemOption[] {
  return slot === 'LEFT_ARM' || slot === 'RIGHT_ARM' ? GAME_BALANCE.itemOptionPools.WEAPON : GAME_BALANCE.itemOptionPools.ARMOR;
}
