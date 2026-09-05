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
  },
} as const;
