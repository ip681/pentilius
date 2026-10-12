# PENTILIUS — Open Decisions

Do not silently decide these as permanent product rules. For the history and
rationale behind decisions already made, see `instructions/DECISIONS_LOG.md`
(not auto-loaded — read on demand) — this file only tracks what is still
open or still a placeholder value.

## Milestone 1 placeholders (implemented but NOT final)

Still-isolated, data-driven stand-in values — not final balance, but the
system around each one is built end-to-end and can be retuned without
touching application code. Full rationale: `instructions/DECISIONS_LOG.md`.

- **XP curve (levels 15-99)** → `apps/api/prisma/seed.ts`'s `levelThresholds`, a provisional power-law curve. Not yet balanced against real Pentili/boss XP income.
- **Pentili stats across the expanded roster** → `seed.ts`'s `pentiliData` (`maxHp`/`attack`/`defense`/`xpReward` power-law formulas). First pass, not final balance.
- **Action Energy regeneration rate** → `game-config.ts` (`actionEnergy.regenIntervalMinutes`).
- **Item upgrade cost/success rules** → `game-config.ts` (`itemUpgrade.stonesPerLevel`); no failure chance or protection stones yet.
- **Final damage formula** → `apps/api/src/pve/combat.service.ts` (a simple power-ratio win-probability model), isolated so it can be replaced without touching callers.
- **Core Attributes point-buy curves** → flat, not compounding (`game-config.ts`'s `robotAttributes`). Defense Success Rate and a "Combat Power" summary score remain undecided (see Combat below).
- **Epic items ("boxes/caches")** → built, Shop-only for now. Still undecided: which activity should drop a box, and at what chance.
- **Construction costs/times, building production rates** → `BuildingLevelCost` seed rows.
- **Research tree size/rate** → 4 technologies, +5%/level, cap level 5 — placeholder numbers, not a final tree.
- **PvP placeholders** → targeting pool (random among level-5+ players), attack cooldown minutes, revenge-protection window minutes — see `game-config.ts`'s `pvp` block.
- **Clan placeholders** → exact role set beyond LEADER/OFFICER/MEMBER, flat base member cap (10), Member Hall/Forge/Depot bonus rates — see `game-config.ts`.
- **Boss Formations** → the 4 bosses' names/art are still placeholder-named (`boss_verdant_warden` etc. — combat stats themselves are now calibrated, see the log); no ranking/reward-tier UI for `BossFormationDailyPoints` yet.

## Races
- individual per-race stat bonuses (group synergy by race *count* is separate and already specified in `instructions/GAME_SYSTEMS.md`)
- race symbols/visual art (names and lore are LOCKED — see `instructions/PRODUCT_SPEC.md`)
- `ItemDefinition.race` — a possible future always-one-fixed-race item *type*, distinct from the built instance-level race-lock stamp. Reserved, unbuilt, undecided.

## Progression
- XP curve shape beyond the level-100 cap — levels 15-99 are still a provisional formula (see Milestone 1 placeholders above)
- catch-up rules

## Combat
- final damage formula
- defense formula
- critical mechanics beyond the flat 10% chance / ×1.5 base multiplier (e.g. whether chance itself should ever be itemized)
- reflect caps (Damage Reflect itself is built, fixed +4%/item, no stacking cap yet)
- damage reduction caps (Damage Decrease itself is built, fixed +4%/item, no stacking cap yet)
- online defense bonus
- Defense Success Rate and a "Combat Power" summary score

## PvP
- defender losses beyond the flat 10% resource steal
- protected resources
- matchmaking range
- PvP ranking
- PvP costs beyond the flat 1 Action Energy

## Items
- final slot list
- rarity tiers beyond Rare — Epic's drop source is undecided (see Milestone 1 placeholders above)
- Excellent option stacking caps across multiple items; Defense Success Rate
- upgrade maximum
- success/failure rules
- race restrictions beyond Coreforged's instance-level stamp (see Races above)

## Resources
- final resource list beyond Metal/Crystal/Credits (Power exists only as an unbuilt base-capacity concept; Oxygen was dropped entirely, see `instructions/DECISIONS_LOG.md`)
- production formulas
- population mechanics
- Power capacity formulas
- resource caps

## Base
- final building list
- max building levels
- construction costs/times
- Hideout protected amounts and Defense System / Defensive Wall / Hideout costs (placeholders in `seed.ts`; the mechanics were decided 2026-10-12)

## Research
- final branch/technology list beyond the current 4 (see Milestone 1 placeholders above)
- costs/effects beyond the current flat +5%/level

## Clans
- final role set, clan building list beyond the current 3, contribution rules, clan-war rules (see Milestone 1 placeholders above)

## Notifications
`instructions/GAME_SYSTEMS.md`'s Notifications section is LOCKED only for the
Action Energy case ("notify when fully regenerated") and explicitly leaves
"other notifications may be added later" open. Discussed but deferred
(2026-09-10):
- Friends chat: an unread-message dot per friend, conversation list sorted by
  recent activity instead of fixed order. Needs a real read/unread tracking
  mechanism first — no such schema exists yet.
- Two separate badges on the "Friends" nav button — pending friend requests
  (cheap to count now) and unread messages (needs the tracking above).
  Deliberately two distinct indicators, not one combined count.
- A Command Center notification for pending requests/unread messages —
  presentation undecided (dismissable banner vs. badging the existing
  Quick Access tile). Should reuse the same counts as the nav badges, not a
  separate calculation.
- A notification when someone buys a Market listing — not designed at all.

## Daily tasks/events
`instructions/GAME_SYSTEMS.md` has this as LOCKED direction (tasks exist, may
unlock sequentially, repeated-action milestones may grant rewards, timed
events use participation windows rather than one exact login time) but no
specifics exist yet — task list, unlock sequencing, reward values, and how a
"daily" reset lines up against server time are all still open (owner wants to
think this through properly later, discussed 2026-09-10).

## Seasons/Core
The attacked-Core model was decided on 2026-10-12 (see `instructions/GAME_SYSTEMS.md`'s Core / Endgame section). Still open:
- the Core's lore now that it isn't human-built
- Core combat stats and round cap (placeholders: `game-config.ts`'s `core` block)
- Tavern level-cost curve and activation cost (placeholders: `seed.ts`'s Tavern block, `game-config.ts`'s `clanTavern` block)
- Pentili escalation as the season advances
- the season reset is built (2026-10-13, see `instructions/DECISIONS_LOG.md`). Still open: Pentili escalation, and the Core's lore

## Monetization
- VIP tiers
- exact benefits
- premium currency
- shop contents
- limits preventing pay-to-win

## Art
- final robot part layering
- final Pentili visual catalogue
- final zone art direction
(race symbols are tracked in the Races section above)

## Mobile
- mobile framework choice (candidate: React Native + Expo, for TS/React consistency)
- app-store compliance — report/block, in-app account deletion, the
  registration terms checkbox, and the public pages (About, History/Lore,
  Rules, Privacy, Support, Delete account) were built on 2026-10-12, and so
  was a content filter; see `instructions/DECISIONS_LOG.md`. Still open:
  - growing the Bulgarian banned-word list (owner);
  - a legal review of the Rules and Privacy texts;
  - checking the current Apple/Google terms before submission;
  - filling in the store age-rating and data-safety forms;
  - a real support@pentilius.com mailbox;
  - a password-reset flow (the game can't send email yet, so password resets
    currently go through support).