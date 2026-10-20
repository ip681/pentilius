import { EquipmentSlot, ItemOption, ItemQuality, ItemTier } from '@prisma/client';

/**
 * Data-driven balance values (see instructions/GAME_SYSTEMS.md,
 * instructions/OPEN_DECISIONS.md). Every value here stands in for something
 * still marked UNDEFINED for the real game design — they exist only so
 * Milestone 1 has a working vertical slice. Never inline these numbers
 * elsewhere; import from here so they stay tunable in one place. See
 * instructions/OPEN_DECISIONS.md for the list of what is still placeholder.
 */
// Many single values here are DEFAULTS only since 2026-10-19: godmaster →
// Balance → Other values overrides them in place at start-up and on save
// (src/config/other-balance.ts lists which). Read them when needed — never
// copy one into a module-level constant, or a change won't reach it.
export type DamageFormula = 'subtract' | 'ratio';

export const GAME_BALANCE = {
  // What a player starts with — on registration (Player's schema defaults,
  // keep both in sync) and again after every season reset.
  newPlayer: {
    metal: 500,
    crystal: 100,
    credits: 50,
    actionEnergy: 10,
  },
  // Selling/recycling several set items at once (owner decision, 2026-10-20).
  itemBulk: {
    maxItems: 50,
  },
  // The Shop of a NEW database (owner decision, 2026-10-20). Afterwards the
  // owner picks what is sold and the prices — the seed never changes an
  // existing item's place in the Shop or its price.
  shopDefaults: {
    itemKeys: [
      'pioneer_head_scanner',
      'pioneer_left_arm_blaster',
      'pioneer_right_arm_guard',
      'pioneer_armor_plating',
      'pioneer_core_battery',
      'pioneer_left_leg_actuator',
      'pioneer_right_leg_actuator',
    ],
    priceMetal: 300,
    priceCrystal: 100,
    priceCredits: 0,
  },
  actionEnergy: {
    // Regeneration rate is UNDEFINED in GAME_SYSTEMS.md — owner-specified at
    // 15 minutes per point (not a placeholder guess).
    regenIntervalMinutes: 15,
  },
  itemUpgrade: {
    // Only the default since 2026-10-19: edited in godmaster → Balance → Sets
    // (src/config/equipment-balance.ts), and the game reads that.
    // Cost curve and success/failure rules are UNDEFINED — M1 always succeeds
    // if the player can pay; no failure/protection-stone mechanics yet. Each
    // set has its own upgrade material (seed.ts's pioneer_upgrade/ascendant_upgrade/
    // coreforged_upgrade), same cost curve for every tier — owner-specified:
    // reaching level N costs N materials (level 1 -> 1, level 2 -> 2, ...).
    // cost(level) = materialsPerLevel * (level + 1).
    materialsPerLevel: 1,
  },
  inventory: {
    // Owner-specified: 30 slots, before any Warehouse bonus
    // (BuildingType.capacityBonusPerLevel). Equipped items count too (owner decision,
    // changed from the first design where they didn't).
    // Within this many free slots the inventory counter turns gold as a warning.
    nearlyFullSlots: 3,
    baseCapacity: 30,
  },
  itemSell: {
    // Only the default since 2026-10-19: edited in godmaster → Balance → Sets
    // (src/config/equipment-balance.ts), and the game reads that.
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
    // fragmentsPerStone: Only the default since 2026-10-19: edited in godmaster → Balance → Sets
    // (src/config/equipment-balance.ts), and the game reads that.
    fragmentsPerStone: 10,
  },
  combat: {
    // Combat formula is UNDEFINED — placeholder linear model:
    // stat = sum(equipped baseStats) * (1 + upgradeLevel * bonusPerUpgradeLevel).
    // Only the default since 2026-10-19: edited in godmaster → Balance → Sets
    // (src/config/equipment-balance.ts), and the game reads that.
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
    // The first step of every hit (PvE, PvP, clan war, bosses, the Core) —
    // owner decision, 2026-10-20: 'ratio', together with the Pentili/boss
    // retune and new attribute point values:
    // - 'subtract': attack − defenseFactor × defense, the original model. A
    //   defense point barely matters until defense nears twice the enemy's
    //   attack, then makes you near-untouchable — so points went only into
    //   damage and HP.
    // - 'ratio': attack × attack / (attack + defense). Equal attack and
    //   defense halve the hit as before; more defense always helps, a little
    //   less each time, and never makes anyone untouchable.
    damageFormula: 'ratio' as DamageFormula,
    // Only used by 'subtract'.
    defenseFactor: 0.5,
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
    // How much each spent point contributes to the real combat stat. With the
    // 'ratio' hit formula (owner decision, 2026-10-20) these make every stat
    // worth taking — the best builds mix all four. Was 2 / 1 / 5 under 'subtract'.
    damagePointValue: 2,
    defensePointValue: 4,
    hpPointValue: 7,
    // Evasion: personal chance to fully dodge an incoming attack (0 damage
    // that round) — self-contained, not compared against any opponent stat.
    // 1.5% per point, hard-capped at 30% (rank 20) — owner decision,
    // 2026-10-20 with the 'ratio' formula; was 0.5% capped at 20%. The cap is
    // still the only ceiling on evasion now that cost no longer soft-caps it.
    evasionPointValue: 1.5,
    maxEvasionPercent: 30,
  },
  expeditions: {
    // Only the default since 2026-10-19: edited in godmaster → Balance →
    // Expeditions (src/config/expedition-balance.ts), and the game reads that.
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
    // minLevel moved to Boss.minLevel (owner decision, 2026-10-11) — per-boss
    // now (30/50/70/90), not a single flat value for all 4 bosses.
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
  core: {
    // Seasons and the Core (owner decision, 2026-10-12): any clan member
    // attacks the Core; damage dealt = points for their clan. When it opens
    // and how long it stays open live in the Season row (godmaster Settings),
    // not here — this block is only the per-attack combat/cost values.
    attackCostEnergy: 1,
    // Anti-flood gap between two attacks by the same player (owner-specified
    // starting value, expected to be retuned).
    attackCooldownSeconds: 10,
    // The Core fights back so every stat matters (owner decision): the fight
    // lasts until the robot falls or maxRounds pass. The Core itself never
    // falls — its HP is not a thing. Placeholder stats, roughly between the
    // first and second boss — not tuned against real play yet.
    attack: 180,
    defense: 90,
    maxRounds: 20,
    // Sliders show this many clans plus the viewer's own (owner decision).
    standingsTopN: 10,
    // Both player rankings (own clan / whole server) are paged at this many
    // rows, with the viewer's own place shown above the list (owner decision).
    playerRankingPageSize: 10,
  },
  clanTavern: {
    // Only the DEFAULTS since 2026-10-19: the activation is edited in
    // godmaster → Balance → Clan buildings (src/config/clan-balance.ts), and
    // the game reads that. Tavern clan building (owner decision, 2026-10-12):
    // +1%/level damage vs bosses and the Core, capped at level 30 since
    // 2026-10-19 (it had no cap before).
    //
    // Bonus only applies while active. One activation lasts activationHours
    // and is NOT renewed automatically (owner decision) — afterwards a
    // leader/officer has to activate it again by hand. Activation cost grows
    // with the level like mine production (owner decision; since the base
    // balance, 2026-10-14): perLevel * level * buildingEffects.amountGrowth^(level-1).
    // Keeping it always on costs a 20-member clan ~12% of its Metal income,
    // so activating stays a decision (before the Core or a boss). Placeholder.
    activationHours: 12,
    activationMetalPerLevel: 3000,
    activationCrystalPerLevel: 1200,
    activationCreditsPerLevel: 50,
  },
  // New base buildings (owner decision, 2026-10-14). Placeholder numbers.
  buildingKeys: {
    researchCenter: 'research_center',
    exchange: 'exchange',
    reactor: 'reactor',
  },
  clanGenerator: {
    // Generator clan building (owner decision, 2026-10-14): half the personal
    // Reactor — +0.5% regeneration per level and +1 max energy at each of
    // these levels. Only the default since 2026-10-19: edited in godmaster →
    // Balance → Clan buildings (src/config/clan-balance.ts).
    maxEnergyLevels: [15, 30],
  },
  security: {
    // Login records (owner decision, 2026-10-19): how long they're kept, and
    // how often a session refresh from the same address is recorded again.
    loginRetentionDays: 90,
    refreshRecordHours: 12,
  },
  loginLimits: {
    // Failed logins (owner decision, 2026-10-14): this many wrong attempts on
    // one account, or from one address, within the window block further tries
    // until the window ends. Usernames are public, so this stops guessing.
    maxFailures: 10,
    windowMinutes: 15,
    // Godmaster's login is stricter (owner decision, 2026-10-14).
    adminMaxFailures: 5,
  },
  buildingEffects: {
    // Base balance (2026-10-14). Mine production per level is
    // basePerHour * level * amountGrowth^(level-1) (prisma/seed.ts), and the
    // Hideout's Metal/Crystal and the Exchange's daily limit grow the same way,
    // so they stay worth the same number of hours of income at every level.
    amountGrowth: 1.08,
  },
  exchange: {
    // Crystal is rarer (produced ~1.7x less), so 1 crystal is worth 2 metal at par.
    metalPerCrystal: 2,
    // The rate improves with the level: factor = base + perLevel * level (max 1).
    baseRateFactor: 0.7,
    rateFactorPerLevel: 0.01,
    // Credits per 100 resources exchanged (rounded up).
    creditsPer100: 1,
  },
  // Recycling research: one extra fragment every this many levels.
  recyclingExtraFragmentEvery: 5,

  // Email links (owner decision, 2026-10-13).
  email: {
    verifyTokenHours: 72,
    resetTokenMinutes: 60,
    // Emails of one kind per player per hour (anti-abuse).
    maxPerHour: 3,
  },

  // "Contact the team" limits (owner decision, 2026-10-13).
  support: {
    maxNewPerDay: 3,
    maxOpen: 5,
    maxMessageLength: 2000,
    // Player messages in a row before staff must answer (anti-flood).
    maxUnansweredMessages: 3,
  },

  // VIP convenience perks (owner decision, 2026-10-13) — see Player.vipUntil.
  vip: {
    // "Attack xN" against Pentili: up to this many battles in one click
    // (fewer when energy is short; stops at the first loss).
    multiAttackCount: 3,
    // Extra max Action Energy while VIP (owner decision, 2026-10-14): more
    // room between sessions, no faster regeneration — no edge over an active
    // player. Added on top of the Reactor and the clan Generator.
    maxEnergyBonus: 3,
  },

  // Level rewards (owner decision, 2026-10-13): claimed by hand, one level at a
  // time. Placeholder amounts. Every boxEveryLevels-th level adds a box of the
  // set of the zone being entered (zones open at 1/20/40/60).
  levelRewards: {
    maxLevel: 100,
    metalPerLevel: 100,
    crystalPerLevel: 25,
    boxEveryLevels: 5,
    boxes: [
      { upToLevel: 15, itemKey: 'pioneer_box' },
      { upToLevel: 35, itemKey: 'ascendant_box' },
      { upToLevel: 100, itemKey: 'coreforged_box' },
    ],
  },

  // Season achievements (owner decision, 2026-10-13): each is a chain of
  // tiers; only the next unclaimed tier is shown. Placeholder rewards.
  achievements: [
    {
      key: 'pentili_wins',
      metric: 'PVE_WIN',
      tiers: [
        { target: 100, reward: { metal: 2000, crystal: 500 } },
        { target: 500, reward: { metal: 6000, crystal: 1500, itemKey: 'energy_pack_small' } },
        { target: 2000, reward: { metal: 15000, crystal: 4000, itemKey: 'energy_pack_large' } },
        { target: 10000, reward: { metal: 40000, crystal: 10000, itemKey: 'coreforged_box' } },
      ],
    },
    {
      key: 'expeditions',
      metric: 'EXPEDITION_COMPLETED',
      tiers: [
        { target: 10, reward: { metal: 1500, crystal: 400 } },
        { target: 50, reward: { metal: 5000, crystal: 1200, itemKey: 'energy_pack_small' } },
        { target: 200, reward: { metal: 15000, crystal: 4000, itemKey: 'energy_pack_large' } },
      ],
    },
    {
      // Regular PvP only — clan-war duels don't count.
      key: 'pvp_wins',
      metric: 'PVP_WIN',
      tiers: [
        { target: 10, reward: { metal: 2000, crystal: 500 } },
        { target: 50, reward: { metal: 6000, crystal: 1500, itemKey: 'energy_pack_small' } },
        { target: 200, reward: { metal: 15000, crystal: 4000, itemKey: 'energy_pack_large' } },
      ],
    },
    {
      key: 'boss_wins',
      metric: 'BOSS_WIN',
      tiers: [
        { target: 1, reward: { metal: 1000, crystal: 250 } },
        { target: 10, reward: { metal: 5000, crystal: 1200, itemKey: 'energy_pack_small' } },
        { target: 50, reward: { metal: 15000, crystal: 4000, itemKey: 'energy_pack_large' } },
      ],
    },
    {
      key: 'item_upgrade',
      metric: 'MAX_ITEM_UPGRADE',
      tiers: [
        { target: 5, reward: { metal: 2000, crystal: 500 } },
        { target: 10, reward: { metal: 8000, crystal: 2000, itemKey: 'energy_pack_small' } },
      ],
    },
    {
      // All 7 slots equipped with this set (or a stronger one).
      key: 'full_set',
      metric: 'FULL_SET',
      tiers: [
        { target: 7, setTier: 'PIONEER', reward: { metal: 2000, crystal: 500 } },
        { target: 7, setTier: 'ASCENDANT', reward: { metal: 8000, crystal: 2000, itemKey: 'energy_pack_small' } },
        { target: 7, setTier: 'COREFORGED', reward: { metal: 20000, crystal: 5000, itemKey: 'energy_pack_large' } },
      ],
    },
    {
      // Every base building at this level or higher.
      key: 'buildings',
      metric: 'MIN_BUILDING_LEVEL',
      tiers: [
        { target: 5, reward: { metal: 5000, crystal: 1200 } },
        { target: 10, reward: { metal: 15000, crystal: 4000, itemKey: 'energy_pack_large' } },
      ],
    },
    {
      key: 'clan_donations',
      metric: 'CLAN_DONATION',
      tiers: [
        { target: 10000, reward: { metal: 2000, crystal: 500 } },
        { target: 100000, reward: { metal: 10000, crystal: 2500, itemKey: 'energy_pack_small' } },
      ],
    },
    {
      key: 'core_attacks',
      metric: 'CORE_ATTACK',
      tiers: [
        { target: 1, reward: { metal: 500, crystal: 100 } },
        { target: 50, reward: { metal: 8000, crystal: 2000, itemKey: 'energy_pack_large' } },
      ],
    },
    {
      // Days on which the all-daily-tasks bonus was received.
      key: 'daily_all_done',
      metric: 'DAILY_ALL_DONE',
      tiers: [
        { target: 7, reward: { metal: 3000, crystal: 800, itemKey: 'energy_pack_small' } },
        { target: 30, reward: { metal: 12000, crystal: 3000, itemKey: 'energy_pack_large' } },
      ],
    },
  ] as AchievementConfig[],

  dailyTasks: {
    // Daily tasks (owner decision, 2026-10-13). Reset at 00:00 in this time
    // zone for everyone. Every battle counts (win or lose); the expedition
    // task counts a FINISHED expedition (collected), not a cancelled one;
    // the donation task counts donated resources (any mix of Metal/Crystal/
    // Credits), so smaller donations fill it proportionally. Rewards grow with
    // the player's level: amount = perLevel x level (energy is flat, capped
    // at max like an energy pack). Unclaimed rewards are granted automatically
    // after the day ends. Placeholder numbers — tune freely.
    timeZone: 'Europe/Sofia',
    tasks: [
      { key: 'pve_10', type: 'PVE_BATTLE', target: 10, chain: 'pve', reward: { metalPerLevel: 60, crystalPerLevel: 15, xpPerLevel: 8, energy: 0 } },
      { key: 'pve_15', type: 'PVE_BATTLE', target: 15, chain: 'pve', reward: { metalPerLevel: 80, crystalPerLevel: 20, xpPerLevel: 10, energy: 0 } },
      { key: 'pve_20', type: 'PVE_BATTLE', target: 20, chain: 'pve', reward: { metalPerLevel: 100, crystalPerLevel: 25, xpPerLevel: 12, energy: 2 } },
      { key: 'expedition_1', type: 'EXPEDITION_COMPLETED', target: 1, reward: { metalPerLevel: 80, crystalPerLevel: 20, xpPerLevel: 10, energy: 0 } },
      // Shown from the PvP unlock level (GAME_BALANCE.pvp.minLevel).
      { key: 'pvp_1', type: 'PVP_BATTLE', target: 1, minLevel: 'PVP', reward: { metalPerLevel: 80, crystalPerLevel: 20, xpPerLevel: 10, energy: 1 } },
      // Shown from the lowest boss's Boss.minLevel; counts creating or joining a formation.
      { key: 'boss_1', type: 'BOSS_FORMATION_JOIN', target: 1, minLevel: 'BOSS', reward: { metalPerLevel: 120, crystalPerLevel: 30, xpPerLevel: 15, energy: 2 } },
      // Only for clan members; target = resources donated that day.
      { key: 'clan_donation', type: 'CLAN_DONATION', target: 100, requiresClan: true, reward: { metalPerLevel: 60, crystalPerLevel: 15, xpPerLevel: 8, energy: 0 } },
    ] as DailyTaskConfig[],
    // Bonus for completing every task shown to the player that day.
    allDoneBonusItemKey: 'energy_pack_small',
    // Streak (owner decision, 2026-10-14): every daily task done on `days`
    // days gives the reward item, claimed by hand. Up to `allowedMisses` days
    // may be skipped along the way; one more and the series starts over.
    // The reward is a placeholder and may change later.
    streak: { days: 7, allowedMisses: 2, rewardItemKey: 'energy_pack_large' },
  },
  moderation: {
    // Report-abuse limits (owner decision, 2026-10-12). A report never acts on
    // its own (only an admin decides), so these only keep the moderation
    // queue from being flooded. Starting values, tune freely.
    reportsPerDay: 10,
    secondsBetweenReports: 30,
    // Eligible to report if EITHER is met — stops throwaway accounts.
    minAccountAgeDays: 3,
    minLevel: 5,
    // Reporter reputation: if at least maxDismissedInWindow of a player's last
    // reputationWindow decided reports were dismissed, reporting is suspended.
    reputationWindow: 10,
    maxDismissedInWindow: 5,
    suspensionDays: 7,
    maxCommentLength: 300,
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
    // Trading Post building (base 0, +1 slot every 2 levels since 2026-10-14 — see
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

export type DailyTaskType = 'PVE_BATTLE' | 'EXPEDITION_COMPLETED' | 'PVP_BATTLE' | 'BOSS_FORMATION_JOIN' | 'CLAN_DONATION';

export interface DailyTaskConfig {
  key: string;
  type: DailyTaskType;
  target: number;
  // Tasks sharing a chain are shown one at a time, in list order — the next
  // appears once the previous one's reward is claimed (10 -> 15 -> 20).
  chain?: string;
  // 'PVP' / 'BOSS' resolve to the PvP unlock level / lowest boss level.
  minLevel?: number | 'PVP' | 'BOSS';
  requiresClan?: boolean;
  reward: { metalPerLevel: number; crystalPerLevel: number; xpPerLevel: number; energy: number };
}

export type AchievementMetric =
  | 'PVE_WIN'
  | 'EXPEDITION_COMPLETED'
  | 'PVP_WIN'
  | 'BOSS_WIN'
  | 'CLAN_DONATION'
  | 'CORE_ATTACK'
  | 'DAILY_ALL_DONE'
  | 'MAX_ITEM_UPGRADE'
  | 'FULL_SET'
  | 'MIN_BUILDING_LEVEL';

export interface AchievementRewardConfig {
  metal: number;
  crystal: number;
  itemKey?: string;
}

export interface AchievementConfig {
  key: string;
  metric: AchievementMetric;
  tiers: { target: number; setTier?: 'PIONEER' | 'ASCENDANT' | 'COREFORGED'; reward: AchievementRewardConfig }[];
}
