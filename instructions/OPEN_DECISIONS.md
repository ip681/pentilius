# PENTILIUS — Open Decisions

Do not silently decide these as permanent product rules.

## Milestone 1 placeholders (implemented but NOT final)

To make Milestone 1 a working vertical slice, the following still-open items
below got a temporary, clearly-isolated, data-driven stand-in value. None of
these are design decisions — they are stubs so the loop runs end to end, and
every one can be retuned without touching application code:

- **XP curve** → `apps/api/prisma/seed.ts` `levelThresholds` (levels 1-9).
- **Land unlock thresholds** → `Zone.unlockLevel` seed rows in `seed.ts` (zone 2 unlocks at level 3).
- **Action Energy regeneration rate** → `apps/api/src/config/game-config.ts` (`actionEnergy.regenIntervalMinutes`).
- **Item upgrade cost/success rules** → `game-config.ts` (`itemUpgrade.stonesPerLevel`); Milestone 1 has no failure chance or protection stones at all yet.
- **Final damage formula** → `apps/api/src/pve/combat.service.ts` (a simple power-ratio win-probability model); isolated in one service specifically so it can be replaced without touching callers.
- **Robot item catalog and Core Attributes** → the ship concept was replaced by a combat robot (owner decision) with a LOCKED 7-slot anatomy (Head/Left Arm/Right Arm/Armor/Core/Left Leg/Right Leg, see `instructions/GAME_SYSTEMS.md`). `apps/api/prisma/seed.ts`'s `itemData` is now 3 named sets — Pioneer/Ascendant/Coreforged (owner-named, see `instructions/GAME_SYSTEMS.md`) — one item per slot per set, not a final content list. The Core Attributes point-buy system's curves live in `game-config.ts`'s `robotAttributes` block. Owner decision (2026-09-09): both curves are now flat, not compounding — `pointsGrowthRate`/`attributeCostGrowthRate` are `0`, so every level grants a flat 3 points and every point in a stat costs a flat 1, regardless of level or current rank (previously 15%/20% compounding growth respectively). This removes the old "spreading points across stats is cheaper than stacking one" soft-cap and makes Evasion's hard cap (still 40 ranks = 20%, unaffected) trivially reachable early. Existing players' already-*paid* cost under the old exponential curve was refunded as available points via a one-off, uncommitted script run directly against production once, immediately after this change deployed — not part of the codebase, not re-runnable. Already-*earned* points from leveling were left untouched (the old growing curve already gave more than the new flat one would have, so there was no shortfall to top up there). If flat/flat proves too easy in practice, the owner's planned fix is a full attribute respec (reset spent points, refund the total, let players reallocate) rather than quietly reintroducing growth — not built, since it's only needed if this change turns out to be wrong. Evasion, critical hits (flat chance + multiplier), Damage Decrease and Damage Reflect are now built (`game-config.ts`'s `combat`/`itemOptionValues`/`itemOptionPools` blocks); Defense Success Rate and a "Combat Power" summary score remain deferred.
- **Epic items ("boxes/caches")** → the box item + opening mechanic is now built: 3 tier-matched boxes (`pioneer_box`/`ascendant_box`/`coreforged_box`, `seed.ts`) can be opened (`inventory.service.ts`'s `openBox`) for a guaranteed RARE (90%) or EPIC (10%, 2 Excellent options) item of that tier — `GAME_BALANCE.boxOpen.epicChance`, owner-specified. Race-locking on the granted item still follows the normal tier-based `rollRace()` rule, unchanged. Still undefined/deferred (owner decision): which activity actually drops a box, and at what chance — boxes are **Shop-only for now** (not in any loot table yet).
- **Construction costs/times, building production rates** → `BuildingLevelCost` seed rows in `seed.ts`.
- **Final resource list** → Milestone 1 ships Metal, Crystal, Oxygen, Credits, and Upgrade Stones (Oxygen currently has no producing building or use — placeholder field only).
- **Race** → chosen at registration (`Player.race`, one of the five LOCKED races in `instructions/PRODUCT_SPEC.md`) but purely identity for now — no stat bonus is applied. Group synergy (`instructions/GAME_SYSTEMS.md`) only needs to count distinct races in a group, so it doesn't require per-race bonuses to exist yet.
- **Expedition durations/rewards and the early-cancel payout** → `apps/api/prisma/seed.ts` `expeditionTypes` (60/300/600 minutes, GAME_SYSTEMS.md's own example) and `game-config.ts` (`expeditions.earlyCancelPercentage`, owner-specified at 70%, not a placeholder guess).
- **Research branches/technology list/costs/effects** → Milestone 2 ships 4 technologies (`apps/api/prisma/seed.ts` `researchTypes`/`researchLevelCosts`: Metal Production, Crystal Production, Weapon Systems, Hull Engineering) each granting +5%/level (placeholder rate) up to level 5, applied in `EconomyService.getResearchMultiplier` (production) and `CombatService.computePlayerStats` (combat). Each technology has its own independent timer and can run in parallel with the others, unlike the single-slot expedition rule.
- **Boss Hunts: group size, attempts, loot, boss timers, contribution calculation** → Milestone 2 ships 2 bosses (`apps/api/prisma/seed.ts` `bossData`/`BossLootDrop`: Ridgeback Alpha, Frost Sovereign). Since clans (Milestone 4) don't exist yet, joining is an open lobby per zone, not an invite system: any player with the boss's zone unlocked may freely join its current OPEN encounter during a join window (`Boss.encounterWindowSeconds`, placeholder). No group-size cap. Any participant may trigger early resolution; otherwise it auto-resolves once the window elapses (checked lazily, same elapsed-time pattern as buildings/research). Resolution combines every participant's combat stats (`pve/combat.service.ts`) into one party vs. the boss, applying the LOCKED racial-synergy percentages (`instructions/GAME_SYSTEMS.md`) to total party attack. Rewards (XP, loot) are split by each player's share of total party attack — a placeholder for "contribution calculation," isolated in `boss/boss.service.ts`.
- **PvP: exact power range, cooldowns, defender losses, protected resources, online defense bonus, PvP cost, ranking formula** → Milestone 3 ships a working foundation in `apps/api/src/pvp/`. Owner-specified (not placeholders): PvP unlocks at player level 5, and players below level 5 cannot be targeted; the attack spends 1 Action Energy (`game-config.ts` `pvp.attackCostEnergy`), reusing the existing resource rather than a separate PvP currency; a loss costs the defender a flat percentage of their current Metal/Crystal/Credits (`pvp.resourceStealPercentage`, 10%), transferred to the attacker. Placeholders: targeting is "random suitable opponent" among all level-5+ players (clan-filtered targeting waits for Milestone 4's clans); a per-attacker/defender cooldown (`pvp.attackCooldownMinutes`) excludes a recently-attacked defender from that attacker's next random pick; a losing defender gets a short revenge-protection window (`pvp.revengeProtectionMinutes`, `Player.pvpProtectedUntil`) excluding them from anyone's target pool. No ranking/leaderboard yet.
- **Clans: member cap, roles, clan building list, contribution rules, clan-war rules** → Milestone 4 ships create/join/leave/roles, a shared treasury, and three clan buildings funded by it, in `apps/api/src/clans/`. Owner-specified: joining any clan is open (no invite/request system), mirroring the Boss Hunts precedent from before clans existed; the treasury is donate-only — nothing may be withdrawn back to a player, only spent on clan buildings; the three buildings are Member Hall (raises the effective member cap), Clan Forge (a combat attack/defense bonus for every member) and Clan Depot (a Metal/Crystal production bonus for every member) — chosen with the owner. Placeholders: three roles (LEADER/OFFICER/MEMBER — exact role set is UNDEFINED), a flat base member cap of 10 (`Clan.memberCap`, owner-specified) topped up by Member Hall's level × its bonusPerLevel (+2 slots/level, a flat count not a percentage), all three buildings develop up to level 10 (owner-specified), Clan Forge/Depot's bonusPerLevel (+5%/level, mirroring Research's rate, now up to +50% at level 10) stacks additively on top of a member's own personal research bonus (`player/clan-bonus.service.ts`), leader succession on leave goes to the longest-tenured officer, else the longest-tenured member, else the clan disbands, and lifetime per-member donation tracking (`ClanMembership.contributedMetal/Crystal/Credits`, resets on leaving) as a placeholder for "contribution rules." Only the leader or an officer may start a clan-building upgrade. Deliberately NOT built yet: clan-scoped boss hunts, contribution tracking toward the Core, and clan-vs-clan war systems.

## Races
- individual per-race stat bonuses (group synergy by race *count* is separate and already specified in instructions/GAME_SYSTEMS.md)
- race symbols/visual art (names and lore are LOCKED — see instructions/PRODUCT_SPEC.md)
- Race-restricted advanced robot parts are now built, but as an **instance-level** stamp, not a per-definition restriction: `ItemInstance.race` is set at grant time (`inventory-capacity.ts`'s `grantItem`/`rollRace`), not `ItemDefinition.race`. Owner-specified odds per tier (see `instructions/GAME_SYSTEMS.md`): Pioneer always universal, Ascendant a 1/6-universal-vs-5/6-locked split (evenly across the 5 races), Coreforged always locked. Applies identically to loot and Shop purchases. `ItemDefinition.race` still exists (nullable, every seeded item `null`) and is reserved for a possible different future mechanic — a definition that's *always* one fixed race — which remains undecided/unbuilt.

## Progression
- XP curve
- maximum level
- land unlock thresholds
- exact XP sources and values
- catch-up rules

## Combat
- final damage formula
- defense formula
- critical mechanics beyond the flat 10% chance / ×1.5 base multiplier now built (`game-config.ts`'s `combat.criticalChance`/`criticalMultiplier`) — e.g. whether chance itself should ever be itemized
- reflect caps — Damage Reflect itself is built (fixed +4% per item, no stacking cap yet)
- damage reduction caps — Damage Decrease itself is built (fixed +4% per item, no stacking cap yet)
- online defense bonus

## PvP
- defender losses
- protected resources
- attack cooldowns
- matchmaking range
- PvP ranking
- PvP costs

## Items
- Smelting/Recycling (GAME_SYSTEMS.md): both halves are now built. "Sell" gives flat Metal/Crystal by tier+quality (`game-config.ts`'s `GAME_BALANCE.itemSell`, `inventory.service.ts`'s `sellItem`), ignoring upgradeLevel by design. "Recycle" instead grants 1 tier-matched fragment per item regardless of quality/upgradeLevel (`GAME_BALANCE.itemRecycle`, `inventory.service.ts`'s `recycleItem`), auto-converting every 20 fragments into that tier's own upgrade stone; the two remain independent choices on the same item, neither replacing the other.
- System Shop (owner decision, not in GAME_SYSTEMS.md — distinct from the separate, still-unbuilt player-to-player Trading/auction): players can buy any `ItemDefinition` for a combination of Metal/Crystal/Credits (`apps/api/src/shop/`). Price lives per-item on `ItemDefinition.shopPriceMetal/shopPriceCrystal/shopPriceCredits` (0 = not required), so real pricing is a data change, not a code change. Currently seeded (`seed.ts`'s `SHOP_PRICE_COMBOS`) with small placeholder combinations purely to exercise every price-display case in the UI — final live pricing per item is UNDEFINED. A bought item is always NORMAL quality (no Rare/Excellent options from the Shop, owner decision) but rolls the same tier-based race-lock chance as a loot drop (see the Races section below) — the Shop displays the odds before purchase (`ShopItemDto.raceLockInfo`).
- final slot list
- rarity tiers beyond Rare — Epic's source (which activity's "box/cache") is undecided, see the bullet above
- Excellent option values are fixed for the built options (game-config.ts's itemOptionValues); Defense Success Rate and stacking caps across multiple items remain undecided
- upgrade maximum
- success/failure rules
- race restrictions beyond Coreforged's instance-level stamp (see the Races section above)

## Resources
- final resource list
- production formulas
- Oxygen mechanics
- population mechanics
- Power capacity formulas
- resource caps

## Base
- final building list
- max building levels
- construction costs/times
- hideout rules

## Research
- branches
- technology list
- costs
- effects

## Clans
- member cap
- roles
- clan building list
- contribution rules
- clan-war rules

## Bosses
- group size
- attempts
- loot
- boss timers
- contribution calculation

## Seasons/Core
- season length
- Core unlock condition
- Core stages
- Core costs
- Pentili escalation
- activation duration
- how rival clans interfere
- what persists after season reset

## Monetization
- VIP tiers
- exact benefits
- premium currency
- shop contents
- limits preventing pay-to-win

## Art
(race symbols moved to the "Races" section below — names/lore are LOCKED)
- final robot part layering
- final Pentili visual catalogue
- final zone art direction

## Mobile
- mobile framework choice (candidate: React Native + Expo, for TS/React consistency)