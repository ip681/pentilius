# PENTILIUS — Development Milestones

## Milestone 0 — Project foundation
Goal: establish architecture before gameplay.

Deliver:
- repository structure;
- local development environment;
- database;
- migrations;
- authentication foundation;
- API versioning;
- i18n foundation;
- test setup;
- seed-data system;
- configuration/balance-data approach.

Do not build broad game systems yet.

## Milestone 1 — Single-player vertical slice
Goal: a locally playable core loop.

Implement:
1. register/login;
2. player profile;
3. base overview;
4. initial resources;
5. basic resource production;
6. building upgrade with server timer;
7. ship page;
8. inventory;
9. equipment slots;
10. equip/unequip;
11. Action Energy with regeneration;
12. first land;
13. several Pentili;
14. automatic PvE combat;
15. XP reward;
16. level-up;
17. unlock second land;
18. resource/item loot;
19. item upgrade using a stone;
20. basic battle report.

Success condition:
A new player can start locally and experience:

`base → collect/develop → equip ship → spend energy → fight Pentili → receive XP/loot → level up → unlock land → improve equipment`

## Milestone 2 — PvE depth
Planned:
- more lands;
- more Pentili;
- expeditions;
- bosses;
- group boss participation;
- racial synergy;
- research foundation;
- richer loot tables.

## Milestone 3 — PvP
Planned:
- matchmaking;
- player attacks;
- defensive state;
- battle reports;
- anti-harassment protection;
- PvP economy/ranking after design approval.

## Milestone 4 — Clans
Planned:
- create/join/leave clan;
- roles/permissions;
- member-capacity building;
- clan resources/buildings;
- clan cooperation;
- clan bosses;
- clan-vs-clan systems.

## Milestone 5 — Economy
Planned:
- trade;
- auction;
- smelting/recycling;
- crafting foundation;
- anti-abuse controls.

## Milestone 6 — Seasons and Core
Planned:
- seasonal state;
- Core construction;
- Core phases;
- increasing Pentili reaction;
- final activation/defense;
- season winner;
- reset/persistence logic.

Do not implement later milestones until the earlier loop is stable and approved.
