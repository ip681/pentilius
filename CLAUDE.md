# PENTILIUS — Claude Project Instructions

See @instructions/PRODUCT_SPEC.md for game concept and product principles.
See @instructions/ARCHITECTURE.md for technical architecture rules.
See @instructions/GAME_SYSTEMS.md for detailed game mechanics.
See @instructions/I18N.md for internationalization requirements.
See @instructions/ASSETS.md for visual asset strategy.
See @instructions/MILESTONES.md for development roadmap.
See @instructions/OPEN_DECISIONS.md for undecided design questions.


## Purpose
Pentilius is a seasonal browser strategy/RPG game for busy working players. The browser client is first, but the project MUST be API-first so a future iOS/Android app can use the same backend, authentication, game state, combat logic, timers, economy and progression.

## Rules for the coding agent
- Read all project markdown files before making architectural decisions.
- Do not invent permanent game rules marked as `UNDEFINED`.
- Treat `LOCKED` decisions as fixed unless the owner changes them.
- Treat `PROVISIONAL` values as configurable balance values.
- Build one working vertical slice before broad feature expansion.
- Core game logic must be server-authoritative.
- Timers, combat, loot, XP, resources, upgrades and inventory changes are calculated by the backend.
- Never hard-code user-facing text. Use translation keys.
- Never couple game entities to specific image filenames. Use asset identifiers/URLs.
- Keep economy and balance values data-driven.
- Use database transactions for inventory, resources, currencies and trades.
- When a missing design decision blocks implementation, document it in `OPEN_DECISIONS.md` instead of silently deciding it.

## First development target
Build Milestone 1 only:

Authentication → player profile → base/resources → buildings/timers → ship → inventory/equipment → action energy → Pentili PvE → XP/level → land unlocks → loot → item upgrades.

The first version must run locally and be playable end-to-end with seeded data.

## Product principles
- Short sessions must be useful.
- Offline time must be respected.
- No manual movement or piloting.
- Combat is automatic/simulated.
- Strategy comes from build, equipment, upgrades, target choice, timing, clan cooperation and economy.
- Avoid mechanics requiring constant online presence.
- Seasonal reset is fundamental.
- The five human races cooperate inside clans; races are not opposing factions.
