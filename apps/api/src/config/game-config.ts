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
    // Regeneration rate is UNDEFINED in GAME_SYSTEMS.md — this interval is a placeholder.
    regenIntervalMinutes: 30,
  },
  itemUpgrade: {
    // Cost curve and success/failure rules are UNDEFINED — M1 always succeeds
    // if the player can pay; no failure/protection-stone mechanics yet.
    stonesPerLevel: 5,
  },
  combat: {
    // Combat formula is UNDEFINED — placeholder linear model:
    // stat = sum(equipped baseStats) * (1 + upgradeLevel * bonusPerUpgradeLevel).
    bonusPerUpgradeLevel: 0.1,
    // Ships without hp-boosting gear equipped would otherwise start combat
    // with ~0 HP; this floor is a placeholder, not a real ship-hull rule.
    basePlayerHp: 100,
    // Damage variance per round and a hard round cap so combat always
    // terminates even if both sides' stats are near-identical.
    damageVariance: 0.1,
    maxRounds: 30,
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
} as const;
