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
  itemRecycle: {
    // Owner-specified: recycling an item always yields 1 tier-matched fragment
    // (seed.ts's pioneer_fragment/ascendant_fragment/coreforged_fragment),
    // regardless of quality/upgradeLevel — the alternative to itemSell above.
    // Reaching fragmentsPerStone auto-converts into that tier's own upgrade
    // stone (see inventory.service.ts's recycleItem), no separate combine step.
    fragmentsPerItem: 1,
    fragmentsPerStone: 20,
  },
  combat: {
    // Combat formula is UNDEFINED — placeholder linear model:
    // stat = sum(equipped baseStats) * (1 + upgradeLevel * bonusPerUpgradeLevel).
    bonusPerUpgradeLevel: 0.1,
    // Robots without hp-boosting gear equipped would otherwise start combat
    // with ~0 HP; this floor is a placeholder, not a real robot-frame rule.
    basePlayerHp: 100,
    // Owner decision (2026-09-09): a small innate Attack/Defense floor, same
    // idea as basePlayerHp above but sized so a brand-new, unequipped robot
    // (no starter kit, no attribute points — see Player.attributePointsAvailable
    // and auth.service.ts's register()) can beat the single weakest Pentili
    // (zone_verdant_flats' pentili_skitterling: 4 attack/1 defense/20 hp) but
    // loses to the next-weakest (pentili_mossback: 6 attack/3 defense/35 hp).
    baseAttack: 3,
    baseDefense: 2,
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
  boxOpen: {
    // Owner-specified: opening a loot box always yields RARE or EPIC, never
    // NORMAL — distinct from rarity.rareChance (the 5% chance on ordinary
    // loot/Shop grants). See inventory.service.ts's openBox().
    epicChance: 0.1,
  },
  raceLock: {
    // Owner-specified (instructions/GAME_SYSTEMS.md): a newly granted
    // ASCENDANT item has 6 equally likely outcomes — universal, or locked to
    // one of the 5 races — so a 1/6 chance of staying universal (the other
    // 5/6 split evenly across the 5 races, 1/6 each). PIONEER always stays
    // universal; COREFORGED is always locked to one of the 5 races (never
    // universal) — both are fixed rules, not configurable percentages.
    ascendantUniversalChance: 1 / 6,
  },
  robotAttributes: {
    // "Core Attributes" point-buy system (instructions/GAME_SYSTEMS.md has no
    // prior ruling — new system, owner-specified curves, all tunable here).
    // New accounts start with this many unspent points — matches
    // Player.attributePointsAvailable's DB default; keep both in sync. Owner
    // decision (2026-09-09): no starting freebie — was 20, now 0. Combat
    // viability for a brand-new robot instead comes from GAME_BALANCE.combat's
    // baseAttack/baseDefense/basePlayerHp floor; points are earned by leveling.
    startingPoints: 0,
    // points(level) = round(basePointsPerLevel * (1 + pointsGrowthRate)^(level-1))
    // Owner decision (2026-09-09): flat, no compounding growth — every level
    // grants the same 3 points, no matter how high. Was 0.15 growth/level.
    basePointsPerLevel: 3,
    pointsGrowthRate: 0,
    // cost(rank) = round(baseAttributeCost * (1 + attributeCostGrowthRate)^rank)
    // Owner decision (2026-09-09): flat cost too — every point costs 1,
    // forever, regardless of how many are already in that stat. Was 0.2
    // growth/rank, which made spreading points across stats cheaper than
    // stacking one — that soft-cap is intentionally gone now. If this proves
    // too easy, the planned fix is a full attribute respec (not reintroducing
    // growth silently), see instructions/OPEN_DECISIONS.md.
    baseAttributeCost: 1,
    attributeCostGrowthRate: 0,
    // How much each spent point contributes to the real combat stat.
    damagePointValue: 2,
    defensePointValue: 1,
    hpPointValue: 5,
    // Evasion: personal chance to fully dodge an incoming attack (0 damage
    // that round) — self-contained, not compared against any opponent stat.
    // Owner-specified: 0.5% per point, hard-capped at 20% (rank 40) — this
    // hard cap is unaffected by the cost-growth removal above, still the
    // only ceiling on evasion now that cost no longer soft-caps it.
    evasionPointValue: 0.5,
    maxEvasionPercent: 20,
  },
  expeditions: {
    // Owner-specified: cancelling early pays out 70% of the reward earned
    // proportionally to elapsed time (not a placeholder — an actual decision).
    earlyCancelPercentage: 0.7,
  },
  bossFormations: {
    // Owner decision (2026-09-11) — fully replaces the old open-lobby Boss
    // Hunts model (see instructions/OPEN_DECISIONS.md's Bosses section and
    // the project_boss_formations.md design memory). A formation is a squad
    // of 5 hard race-locked slots; unfilled slots aren't blocked, they just
    // weaken the party — deliberately no separate "reduced reward" formula,
    // a weaker party already produces a smaller win chance and a loss gives
    // nothing.
    //
    // Flat for every boss (previously a per-boss Boss.encounterWindowSeconds
    // column — dropped, since the owner wants one uniform window).
    enrollmentWindowHours: 3,
    // Creator may edit visibleToClanOnly/visibleToFriendsOnly only during
    // this many hours from creation; locked for the rest of the window.
    visibilityEditWindowHours: 2,
    // The shared rolling cooldown (Player.nextBossFormationActionAt) covering
    // BOTH creating a new formation AND joining an existing one — one action
    // per rolling day, not two independent limits (owner decision: a personal
    // rolling window, not a fixed global reset hour, to stay fair across
    // timezones — see instructions/ARCHITECTURE.md's elapsed-time preference).
    actionCooldownHours: 24,
    // Starting placeholder — owner explicitly deferred the exact value
    // ("после ще го измислим"). Flat minimum for the whole feature, not a
    // per-zone Zone.unlockLevel gate like the old system.
    minLevel: 10,
    // Excellent-option percentages are SUMMED ACROSS every filled slot, then
    // applied once to the formation's combined stats (owner decision,
    // deliberately stronger than solo combat's per-player-then-summed
    // model — see combat.service.ts's aggregateFormationCombatStats).
    // DAMAGE_REFLECT is excluded entirely (PvP-only going forward). Summed
    // DAMAGE_DECREASE across up to 5 slots could reach/exceed 100% and make
    // the boss deal ~0 damage — capped here as a safety net, not a tuned value.
    maxDamageDecrease: 0.9,
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
    // Owner decision (2026-09-11): the steal rate scales with the level gap
    // instead of being flat, so punching down at a much weaker player is no
    // longer strictly efficient (same energy cost, same reward regardless of
    // difficulty) — see instructions/GAME_SYSTEMS.md's "anti-harassment
    // protection must exist". multiplier = 1 + (defenderLevel - attackerLevel)
    // * levelDifferenceAdjustment, clamped to [minStealMultiplier,
    // maxStealMultiplier] — attacking someone lower-level than you shrinks the
    // reward, attacking someone higher-level grows it. Starting values, not
    // tuned against real play yet.
    levelDifferenceAdjustment: 0.05,
    minStealMultiplier: 0.2,
    maxStealMultiplier: 2.5,
  },
  clanWar: {
    // Clan-vs-clan war (owner decision, 2026-09-10 — instructions/OPEN_DECISIONS.md's
    // "clan-vs-clan war systems" was previously out of scope). See
    // schema.prisma's comment on ClanWar/ClanWarAttack for the full mechanic.
    // A flat floor on both sides, not a power-ratio matchmaking system —
    // deliberately as unsolved as regular PvP's own undefined power range.
    minMembersToParticipate: 5,
    // Owner-specified: a war auto-resolves after 3 days even if neither
    // pool hit 0 (whoever has more remaining pool wins by DECISION instead).
    maxDurationHours: 72,
    // Same specific attacking clan cannot re-declare on the same target
    // clan for this many days after their last war together resolves.
    rematchCooldownDays: 14,
    // War-pool size: sum of every current member's basePlayerHp + baseHp×
    // robotAttributes.hpPointValue (gear excluded on purpose — equipment is
    // swappable at will, attribute points are not) × this multiplier.
    // Snapshotted once at declaration, never recalculated. Starting value,
    // not tuned against real play yet — retune here once wars have actually
    // been fought.
    poolMultiplier: 100,
    // Two independent cooldowns, modeled directly on PvP's existing
    // pvpProtectedUntil/attackCooldownMinutes precedent (owner-specified
    // starting values): a defender who was just hit is protected from ANY
    // attacker for targetProtectionMinutes; the same attacker specifically
    // cannot re-hit the same defender for attackCooldownMinutes.
    targetProtectionMinutes: 5,
    attackCooldownMinutes: 60,
    // Attacks cost Action Energy like regular PvP — reuses pvp.attackCostEnergy
    // rather than a separate constant. Reward on a won individual duel also
    // reuses pvp.resourceStealPercentage directly (owner decision: no
    // separate war-specific per-duel steal rate) — see clan-wars.service.ts.
    //
    // War-level reward (owner decision, 2026-09-10, on top of the per-duel
    // steal above): when the war itself resolves with a winner, that clan's
    // treasury takes a percentage of the LOSING clan's current treasury
    // (Metal/Crystal/Credits) — a separate, bigger prize for the collective
    // outcome, not just individual loot. CONQUEST (a pool actually driven to
    // 0) pays out more than DECISION (won only by having more pool left when
    // the 3-day deadline hit) — deliberately, since DECISION didn't require
    // actually breaking the enemy. DRAW transfers nothing. Starting values,
    // not tuned against real play yet.
    conquestTreasuryStealPercentage: 0.15,
    decisionTreasuryStealPercentage: 0.05,
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
  directMessages: {
    // Owner decision (2026-09-10): friends-only 1:1 messaging, same limits as
    // clanChat for now — kept as its own block (not reused from clanChat) so
    // the two can be tuned independently later.
    maxMessageLength: 500,
    minSecondsBetweenMessages: 2,
    historyLimit: 200,
  },
  market: {
    // Owner decisions (2026-09-10): no listing fee, listings never expire
    // (only removed by sale or cancellation). Equipment only for now (see
    // MarketListing's schema comment). Listing capacity itself moved off
    // this flat constant on 2026-09-11 — it's now driven entirely by the
    // Trading Post building (base 0, +1 slot/level — see
    // schema.prisma's BuildingType.marketSlotBonusPerLevel and
    // MarketService.getEffectiveListingCapacity).
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
