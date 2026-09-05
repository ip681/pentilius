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
- final race names
- race symbols
- final ship part layering
- final Pentili visual catalogue
- final zone art direction

## Mobile
- mobile framework choice (candidate: React Native + Expo, for TS/React consistency)