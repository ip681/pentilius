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
- **Construction costs/times, building production rates** → `BuildingLevelCost` seed rows in `seed.ts`.
- **Final resource list** → Milestone 1 ships Metal, Crystal, Oxygen, Credits, and Upgrade Stones (Oxygen currently has no producing building or use — placeholder field only).
- **Race** → chosen at registration (`Player.race`, one of the five LOCKED races in `instructions/PRODUCT_SPEC.md`) but purely identity for now — no stat bonus is applied. Group synergy (`instructions/GAME_SYSTEMS.md`) only needs to count distinct races in a group, so it doesn't require per-race bonuses to exist yet.
- **Expedition durations/rewards and the early-cancel payout** → `apps/api/prisma/seed.ts` `expeditionTypes` (60/300/600 minutes, GAME_SYSTEMS.md's own example) and `game-config.ts` (`expeditions.earlyCancelPercentage`, owner-specified at 70%, not a placeholder guess).
- **Research branches/technology list/costs/effects** → Milestone 2 ships 4 technologies (`apps/api/prisma/seed.ts` `researchTypes`/`researchLevelCosts`: Metal Production, Crystal Production, Weapon Systems, Hull Engineering) each granting +5%/level (placeholder rate) up to level 5, applied in `EconomyService.getResearchMultiplier` (production) and `CombatService.computePlayerStats` (combat). Each technology has its own independent timer and can run in parallel with the others, unlike the single-slot expedition rule.
- **Boss Hunts: group size, attempts, loot, boss timers, contribution calculation** → Milestone 2 ships 2 bosses (`apps/api/prisma/seed.ts` `bossData`/`BossLootDrop`: Ridgeback Alpha, Frost Sovereign). Since clans (Milestone 4) don't exist yet, joining is an open lobby per zone, not an invite system: any player with the boss's zone unlocked may freely join its current OPEN encounter during a join window (`Boss.encounterWindowSeconds`, placeholder). No group-size cap. Any participant may trigger early resolution; otherwise it auto-resolves once the window elapses (checked lazily, same elapsed-time pattern as buildings/research). Resolution combines every participant's combat stats (`pve/combat.service.ts`) into one party vs. the boss, applying the LOCKED racial-synergy percentages (`instructions/GAME_SYSTEMS.md`) to total party attack. Rewards (XP, loot) are split by each player's share of total party attack — a placeholder for "contribution calculation," isolated in `boss/boss.service.ts`.
- **PvP: exact power range, cooldowns, defender losses, protected resources, online defense bonus, PvP cost, ranking formula** → Milestone 3 ships a working foundation in `apps/api/src/pvp/`. Owner-specified (not placeholders): PvP unlocks at player level 5, and players below level 5 cannot be targeted; the attack spends 1 Action Energy (`game-config.ts` `pvp.attackCostEnergy`), reusing the existing resource rather than a separate PvP currency; a loss costs the defender a flat percentage of their current Metal/Crystal/Credits (`pvp.resourceStealPercentage`, 10%), transferred to the attacker. Placeholders: targeting is "random suitable opponent" among all level-5+ players (clan-filtered targeting waits for Milestone 4's clans); a per-attacker/defender cooldown (`pvp.attackCooldownMinutes`) excludes a recently-attacked defender from that attacker's next random pick; a losing defender gets a short revenge-protection window (`pvp.revengeProtectionMinutes`, `Player.pvpProtectedUntil`) excluding them from anyone's target pool. No ranking/leaderboard yet.
- **Clans: member cap, roles, clan building list, contribution rules, clan-war rules** → Milestone 4 ships a create/join/leave/roles foundation only, in `apps/api/src/clans/`. Owner-specified: joining any clan is open (no invite/request system), mirroring the Boss Hunts precedent from before clans existed. Placeholders: three roles (LEADER/OFFICER/MEMBER — exact role set is UNDEFINED), a flat member cap of 30 per clan (`Clan.memberCap`, no member-capacity building yet), leader succession on leave goes to the longest-tenured officer, else the longest-tenured member, else the clan disbands. Deliberately NOT built yet: clan buildings/resources, a member-capacity building, clan-scoped boss hunts, contribution tracking toward the Core, and clan-vs-clan war systems — all UNDEFINED and larger than this foundation slice.

## Races
- individual per-race stat bonuses (group synergy by race *count* is separate and already specified in instructions/GAME_SYSTEMS.md)
- race symbols/visual art (names and lore are LOCKED — see instructions/PRODUCT_SPEC.md)

## Progression
- XP curve
- maximum level
- land unlock thresholds
- exact XP sources and values
- catch-up rules

## Combat
- final damage formula
- defense formula
- critical mechanics
- reflect caps
- damage reduction caps
- online defense bonus

## PvP
- defender losses
- protected resources
- attack cooldowns
- matchmaking range
- PvP ranking
- PvP costs

## Items
- final slot list
- rarity tiers
- Excellent option ranges
- upgrade maximum
- success/failure rules
- race restrictions

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
- final ship part layering
- final Pentili visual catalogue
- final zone art direction

## Mobile
- mobile framework choice (candidate: React Native + Expo, for TS/React consistency)