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

Early weak parts may be universal.

Advanced parts may be race-specific. Not built yet — deferred to a later milestone (see `instructions/OPEN_DECISIONS.md`) — but `ItemDefinition.race` exists in the schema so this doesn't require another migration later.

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
- Evasion is tracked and spendable but has no combat effect yet — critical rate, damage reduction, reflect damage, and defense success rate (see "Item quality and Excellent options" below) are **UNDEFINED** and deferred to a later phase, along with rarity tiers and a "Combat Power" summary score.

## Item quality and Excellent options
**LOCKED direction:** Some items have special bonus options.

Examples:
- Defense Success Rate;
- Damage Decrease;
- additional Hull/HP;
- Reflect Damage.

Exact rarity tiers, ranges and caps are **UNDEFINED**.

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
