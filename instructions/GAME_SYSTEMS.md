# PENTILIUS — Game Systems

## Player level and XP
**LOCKED:** XP raises player level.

Levels unlock new lands/zones where the player can:
- gain XP;
- obtain items;
- obtain resources;
- encounter stronger Pentili.

Exact XP curve, level cap and thresholds are **UNDEFINED**.

## Lands / Zones
**LOCKED:** Progression uses distinct lands/zones instead of a coordinate-based strategic map.

Zones may contain:
- different Pentili;
- difficulty ranges;
- loot/resource tables;
- bosses;
- expeditions.

Names and final zone list are **UNDEFINED**.

## PvE: Pentili
**LOCKED:** Players can attack Pentili/NPCs.

Combat is automatic.

Pentili can differ in stats and difficulty.

Stronger Pentili may give:
- more XP;
- more resources;
- better item-drop chances.

Combat formula and drop rates remain **UNDEFINED**.

## Expeditions
**PROVISIONAL:** Timed automatic missions such as 1h / 5h / 10h.

Short expeditions may be more efficient per hour.
Long expeditions are more convenient for offline players.

Exact values are **UNDEFINED**.

## Boss Hunts
**LOCKED direction:** Multiple players may join or be invited.

Combined player power is used together with racial synergy.

Boss rewards may include:
- XP;
- resources;
- upgrade materials;
- boxes/caches;
- item drops.

Exact rules remain **UNDEFINED**.

## PvP
**LOCKED direction:** PvP exists.

No world-map coordinates are required.

Targeting can include:
- random suitable opponent;
- search/filter by clan.

Matchmaking and anti-harassment protection must exist.

Still **UNDEFINED**:
- exact power range;
- cooldowns;
- defender losses;
- protected resources;
- online-defense bonus;
- PvP cost;
- ranking formula.

## Robot equipment
**LOCKED:** One combat-robot progression concept based on equipped parts/items — no separate robot classes/types, the robot is entirely defined by what's equipped.

**LOCKED direction:** Equipment is organized into 3 named sets, one item per anatomical slot per set, each roughly doubling the previous set's base stats:
- **Pioneer** — starter tier, granted free at registration, also loots in the first zone.
- **Ascendant** — advanced tier, introduced in the second zone.
- **Coreforged** — elite tier, introduced in the third zone and continuing into the fourth zone and both bosses.

Coreforged items are race-locked, but at the *dropped instance* level, not the item type: "Coreforged Head Scanner" is one definition for every player, but each time one drops it is stamped with one of the 5 races at random, and only a player of that race can equip that specific copy. Early (Pioneer/Ascendant) parts remain universal. `ItemDefinition.race` also exists in the schema, reserved for a possible future fixed-race item *type* — unrelated to and unused by the instance-stamping above.

Slot schema — **LOCKED** (7 anatomical slots):
- Head;
- Left Arm;
- Right Arm;
- Armor;
- Core;
- Left Leg;
- Right Leg.

## Core Attributes
**LOCKED direction:** Alongside equipment, the player allocates personal stat points earned from leveling — Damage, Defense, HP, Evasion. Pure point-buy: no resource cost, no respec (for now).

- Points awarded per level and the cost to raise a stat both grow with a percentage curve (compounding), so higher levels grant proportionally more points, and each successive point in the *same* stat costs progressively more. Cost resets per stat, so spreading points across stats is cheaper than dumping everything into one.
- Exact starting points, growth rates, and how much each point contributes to combat are **PROVISIONAL** — see `apps/api/src/config/game-config.ts`'s `robotAttributes` block, not hard-coded anywhere else.
- Evasion has a real combat effect (per-round dodge chance). Critical hits, Damage Decrease and Damage Reflect are also built now (see "Item quality and Excellent options" below). Defense Success Rate and a "Combat Power" summary score remain **UNDEFINED** and deferred.
- Critical hits: a flat 10% chance on every attack (same for every combatant, not itemized), dealing a ×1.5 base multiplier — see `apps/api/src/config/game-config.ts`'s `combat.criticalChance`/`combat.criticalMultiplier`.

## Item quality and Excellent options
**LOCKED direction:** Equipment can roll a quality tier with bonus "Excellent options":
- **Normal** — no bonus option (the common case).
- **Rare** — 1 bonus option, a flat 5% chance on every granted equipment drop (`GAME_BALANCE.rarity.rareChance`), across all 3 sets.
- **Epic** — 2 bonus options. Not obtainable through normal loot yet — reserved for a future boss "box/cache" mechanic (see `instructions/OPEN_DECISIONS.md`).

The option pool depends on the slot's category, and every value is fixed (no rolled ranges) — see `apps/api/src/config/game-config.ts`'s `itemOptionValues`/`itemOptionPools`:
- **Weapon slots** (Left Arm, Right Arm): Increase Damage +2%, Critical Damage +10%.
- **Armor slots** (Head, Armor, Core, Left Leg, Right Leg): Increase Max HP +4%, Damage Decrease +4%, Damage Reflect +4%.

Defense Success Rate and exact caps on stacking multiple rare/epic items remain **UNDEFINED**.

## Item upgrades
**LOCKED:** Items can be upgraded with stones/materials.

Exact:
- max upgrade;
- success rates;
- failure behavior;
- protection stones;
- VIP interaction

are **UNDEFINED**.

## Trading and auction
**LOCKED direction:** Player trade/item transfer and auction are planned.

Exact fees, restrictions and binding rules are **UNDEFINED**.

## Smelting / Recycling
**LOCKED direction:** Unwanted items may be smelted/recycled.

Preferred model:
- sell → Credits;
- smelt/recycle → construction/resource material.

Exact values remain **UNDEFINED**.

## Crafting
**LOCKED direction:** Crafting will exist later.

Do not implement a large crafting system in Milestone 1.

## Base
**LOCKED:** Each player has a base with development/resource buildings.

Discussed examples:
- resource production;
- warehouse;
- hideout;
- atmospheric/oxygen processing;
- power generation;
- research.

Final building list and costs are **UNDEFINED**.

## Resources — PROVISIONAL

### Metal
Main construction resource.

Possible uses:
- personal buildings;
- clan buildings;
- the Core.

### Crystal
Rarer advanced resource.

Possible uses:
- advanced buildings;
- research;
- higher technology.

### Power
Preferably base capacity rather than stockpiled currency.

Buildings consume Power.

### Oxygen
Produced by processing Pentilius' atmosphere.

Connected to colony survival/development.

### Credits
Economic currency.

Possible uses:
- auction/trade;
- fees;
- services;
- item-related costs.

### Action Energy
Used for reward-generating actions such as normal PvE.

Example:
- standard max: 10
- VIP max: 12

Exact regeneration rate is **UNDEFINED**.

Do not confuse base `Power` with player `Action Energy`.

## Daily tasks/events
**LOCKED direction:** Daily tasks exist.

Tasks may unlock sequentially.

Repeated-action milestones may grant rewards.

Timed events should use participation windows rather than requiring one exact login time.

## Achievements
**LOCKED direction:** Achievements exist.

Final achievement list should be defined only after the final action set is clearer.

## Notifications
**LOCKED:** Notify the player when Action Energy is fully regenerated.

Other notifications may be added later.

## Research / Technology Tree
**LOCKED:** Research exists.

Branches, costs and bonuses are **UNDEFINED**.

## Clans
**LOCKED:** Clans are central.

Planned clan systems:
- members from all five races;
- clan buildings;
- member-capacity building;
- cooperation;
- clan-vs-clan conflict;
- contribution toward the Core.

Exact member cap is **UNDEFINED**.

## Core / Endgame
**LOCKED:**
- The Core is human-built.
- It interfaces with/influences the ancient planetary system.
- It is the clan endgame.
- Pentili react more strongly as the Core advances.
- 100% construction leads to a final activation/defense phase.
- Rival clans can try to stop the leading clan.
- Successful activation ends the season.

Exact phases, costs, activation time, attack rules and Pentili waves are **UNDEFINED**.
