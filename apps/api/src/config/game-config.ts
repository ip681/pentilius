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
    // if the player can pay; no failure/protection-stone mechanics yet.
    stonesPerLevel: 5,
  },
  inventory: {
    // Owner-specified: 30 unequipped-item slots, before any Warehouse bonus
    // (BuildingType.capacityBonusPerLevel). Equipped items don't count.
    baseCapacity: 30,
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
