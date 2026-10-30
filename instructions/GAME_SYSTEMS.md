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

**Owner decisions (2026-10-19):**
- Rewards grow with the player's level: an expedition pays as much as a set
  number of fights against a Pentil of the player's level (Metal, Crystal,
  XP).
- No Credits.
- The bonus item is a random item of the set of the player's highest
  unlocked zone.

Exact values are **PROVISIONAL** and edited in godmaster → Balance →
Expeditions.

## Boss Hunts
**LOCKED direction:** Multiple players may join or be invited.

Combined player power is used together with racial synergy.

Boss rewards may include:
- XP;
- resources;
- upgrade materials;
- boxes/caches;
- item drops.

**Owner decisions (2026-10-19):**
- Metal and Crystal follow the Pentili reward curves, as a number of fights
  at the boss's minimum level.
- Bosses give no Credits; the setting stays, default 0.

Values are **PROVISIONAL** and edited in godmaster → Balance → Bosses.

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
**LOCKED:** One combat-robot progression concept based on equipped parts/items — no separate robot classes/types, the robot is entirely defined by what's equipped. Owner decision (2026-09-09): a small universal innate Attack/Defense floor was added on top of this (`GAME_BALANCE.combat.baseAttack`/`baseDefense`, alongside the pre-existing `basePlayerHp` floor) so an unequipped robot isn't literally helpless — every player gets the exact same flat amount regardless of race/build, so this doesn't reintroduce class-like differentiation.

**LOCKED direction:** Equipment is organized into 3 named sets, one item per anatomical slot per set, each roughly doubling the previous set's base stats:
- **Pioneer** — starter tier. Owner decision (2026-09-09): no longer granted free at registration — reached via this zone's own PvE loot or the Shop instead, using the innate combat floor above to win that first fight.
- **Ascendant** — advanced tier, introduced in the second zone.
- **Coreforged** — elite tier, introduced in the third zone and continuing into the fourth zone and both bosses.

Race-locking is stamped at the *dropped/granted instance* level, not the item type: "Coreforged Head Scanner" is one definition for every player, but each instance (whether looted or bought in the Shop) independently rolls whether it's locked to one of the 5 races, and only a player of that race can equip that specific copy. Owner-specified odds per tier:
- **Pioneer** — always universal (100%), never locked.
- **Ascendant** — a 6-way equal split: 1/6 stays universal, the other 5/6 splits evenly across the 5 races (1/6 each).
- **Coreforged** — always locked to one of the 5 races (never universal).

**Full-set bonus (owner decision, 2026-10-27):** with all 7 slots wearing a set or a better one, the player gets that set's bonus — its own % per stat (attack, defense, HP), added to the same sums as research and the Forge. A better part still counts for a weaker set, so the bonus never drops while upgrading piece by piece; only the best full set applies. Defaults: attack only — Pioneer +3%, Ascendant +5%, Coreforged +8% (**PROVISIONAL**, godmaster → Balance → Sets). Shown on the Robot page under the attributes.

`ItemDefinition.race` also exists in the schema, reserved for a possible future fixed-race item *type* — unrelated to and unused by the instance-stamping above.

Slot schema — **LOCKED** (7 anatomical slots):
- Head;
- Left Arm;
- Right Arm;
- Armor;
- Core;
- Left Leg;
- Right Leg.

## Core Attributes
**LOCKED direction:** Alongside equipment, the player allocates personal stat points earned from leveling — Damage, Defense, HP, Evasion. Pure point-buy: no resource cost. A reset (every spent point back) is bought in Settings for Credits, with a waiting time (owner decision, 2026-10-30; 300 Credits and 1 day, edited in godmaster); there are no free resets any more. Owner decision (2026-09-09): no starting point grant at registration — a new account has 0 unspent points; every point comes from leveling.

- Points awarded per level and the cost to raise a stat both grow with a percentage curve (compounding), so higher levels grant proportionally more points, and each successive point in the *same* stat costs progressively more. Cost resets per stat, so spreading points across stats is cheaper than dumping everything into one.
- Exact starting points, growth rates, and how much each point contributes to combat are **PROVISIONAL** — see `apps/api/src/config/game-config.ts`'s `robotAttributes` block, not hard-coded anywhere else.
- Evasion has a real combat effect (per-round dodge chance). Critical hits, Damage Decrease and Damage Reflect are also built now (see "Item quality and Excellent options" below). Defense Success Rate and a "Combat Power" summary score remain **UNDEFINED** and deferred.
- Critical hits: a flat 10% chance on every attack (same for every combatant, not itemized), dealing a ×1.5 base multiplier — see `apps/api/src/config/game-config.ts`'s `combat.criticalChance`/`combat.criticalMultiplier`.

## Item quality and Excellent options
**LOCKED direction:** Equipment can roll a quality tier with bonus "Excellent options":
- **Normal** — no bonus option (the common case).
- **Rare** — 1 bonus option, a flat 5% chance on every granted equipment drop (`GAME_BALANCE.rarity.rareChance`), across all 3 sets.
- **Epic** — 2 bonus options. Comes from loot boxes. Bosses drop tier-matched boxes, and opening one always yields RARE or EPIC. Boxes are also sold in the Shop for now, for testing only; they will be removed from the Shop before a real launch (owner decision, 2026-10-13).

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

## Trading
**LOCKED direction:** Player trade/item transfer is built as the fixed-price player Market. An auction with bidding was dropped (owner decision, 2026-10-13).

**Sale fee (owner decision, 2026-10-27):** 10% of a sale's Credits is kept back from the seller and leaves the game (rounded up, at least 1 Credit); the buyer pays the listed price. Metal and Crystal pay no fee. Listing stays free and listings still never expire. The share is **PROVISIONAL** (godmaster → Balance → Other values → Market).

Exact restrictions and binding rules are **UNDEFINED**.

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
- power generation;
- research.

**Defense System (owner decision, 2026-10-12):** shown as the 4 corner towers of the base's wall frame. It gives +0.5% defense per level, up to level 30 (+15%; base balance, 2026-10-14 — it was +1% up to level 10), and applies **only while another player attacks you**: as the PvP defender, or as the defender in a clan-war duel. It never applies to your own attacks, and never against Pentili, bosses or the Core. Costs are **PROVISIONAL** (`seed.ts`). **Defensive Wall (owner decision, same date):** the wall segments between the towers. +2 minutes per level, up to level 30, added to the regular-PvP revenge protection you get after **losing** a defense: a base of 10 minutes, so 70 minutes at level 30 (base balance, 2026-10-14 — it was +5 minutes up to level 10). Regular PvP only; clan-war protection is deliberately unaffected, so wars can't be stalled.

**Hideout (owner decision, same date):** a terrain building. A fixed amount of each resource per level can't be stolen when another player defeats you, in PvP and in clan-war duels; the steal percentage is taken only from the amount above it. Since the base balance (2026-10-14), the Metal and Crystal amounts grow with mine production, so the Hideout always protects about 3 hours of that level's income. These are still placeholders. **Credits are never stolen** — not in PvP, not in clan-war duels (owner decision, 2026-10-19, since Credits can be bought for real money), so the Hideout guards only Metal and Crystal. The same holds for a clan's treasury when it loses a clan war: the winner takes a share of its Metal and Crystal, never its Credits (owner decision, same date). A fixed amount was chosen over a percentage on purpose, because it protects small and weaker players most.

The three defense buildings each have one role:
- the towers help you **win** the fight;
- the Hideout limits what you **lose**;
- the Wall gives you **time** before the next attack.

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

### Credits
Economic currency.

Possible uses:
- trade (Market);
- fees;
- services;
- item-related costs.

### Action Energy
Used for reward-generating actions such as normal PvE.

Example:
- standard max: 10
- VIP: +3 (owner decision, 2026-10-14; `GAME_BALANCE.vip.maxEnergyBonus`), on top of the Reactor and clan Generator

Exact regeneration rate is **UNDEFINED**.

Do not confuse base `Power` with player `Action Energy`.

## Daily tasks/events
**LOCKED direction:** Daily tasks exist.

Tasks may unlock sequentially.

Repeated-action milestones may grant rewards.

Timed events should use participation windows rather than requiring one exact login time.

**Built (2026-10-13):** a fixed daily task list (PvE chain 10 → 15 → 20 battles,
1 completed expedition, 1 PvP battle, 1 boss formation, a clan donation), reset
at 00:00 Bulgarian time, rewards scaling with level, and a small energy pack
for completing everything. Unclaimed rewards are granted automatically after
the day ends. Values live in `apps/api/src/config/game-config.ts`'s
`dailyTasks` block; details in `instructions/DECISIONS_LOG.md`.

## Achievements
**LOCKED direction:** Achievements exist.

**Built (2026-10-13):** season achievements (tiered chains) and per-level
rewards. Every 5th level also gives a set box. Level 20 also gives 2 days of VIP (2026-10-30, editable). Everything is claimed by hand
and resets each season. Lists and rewards are in `game-config.ts`
(`achievements`, `levelRewards`). Details are in
`instructions/DECISIONS_LOG.md`.

## Notifications
**LOCKED:** Notify the player when Action Energy is fully regenerated.

Other notifications may be added later.

**Built (2026-10-13):**
- **Kinds:** full energy, construction finished, research finished,
  expedition finished, a PvP attack on you, and a finished boss battle
  (2026-10-27). Each can be switched off in
  Settings; the setting is server-side and shared by all devices.
- **Delivery:**
  - an in-game notice while the game is in front of the player;
  - a browser notification while it's open in the background;
  - Web Push when the game is closed.
- **Server-side design:** the server decides what and when, and the
  browser is one delivery channel, so the future mobile app adds a channel
  without new rules. Details are in `instructions/DECISIONS_LOG.md`.

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
**LOCKED (owner decision, 2026-10-12 — replaces the earlier "clans build the Core, then activate/defend it" concept, which was dropped entirely):**
- The Core is the clan endgame and is **attacked, not built**.
- It opens at a time set from the godmaster **Settings** tab and stays open for a configurable number of days (default 14). Once it has opened, neither value can be changed — no postponing, shortening or extending.
- Only clan members can attack it. No minimum level.
- One attack costs 1 Action Energy. Points = the damage dealt.
- The Core fights back, so every combat stat matters: the fight lasts until the robot falls or a round cap passes. The Core itself never falls — damage just accumulates.
- A per-player anti-flood gap between attacks (10 s to start, tunable).
- Points belong to the clan the player was in at attack time — they stay with that clan if the player leaves. No waiting period after switching clans.
- When the window closes, the clan with the most damage wins. On equal damage, whoever reached that total first ranks higher.
- Live sliders show the top 10 clans plus the viewer's own, each relative to the leading clan (always 100%). Top-10 is provisional.
- Below the clan standings (the more important block), two player rankings sit side by side, each paged 10 per page with the viewer's own place shown above the list:
  - **your clan:** every current member, ranked by damage dealt *for this clan*. Members who haven't attacked are listed last, unranked, so leaders can see who isn't taking part.
  - **the server:** every player with damage this season, ranked by total personal damage across any clan.
- There are no season rewards. Each clan's final placement is recorded permanently so it can be shown on profiles later.
- At a new season player accounts are kept, but all progress resets. The reset itself is not built yet.

**Tavern (clan building, LOCKED direction, same date):** +1% damage per level against bosses and the Core only (Clan Forge stays the general combat bonus). Capped at level 30 like the other buildings (owner decision, 2026-10-19 — it first had no cap, so the richest clan's Core bonus could grow without end). The bonus only applies while the Tavern is **active**: a leader/officer activates it from the treasury for 12 h. It is **not** renewed automatically — once it expires, a leader/officer has to activate it again by hand (owner decision, revised the same day from an initial auto-renew design). The activation cost grows with level. While active, the Tavern and its countdown are shown in every member's Command Center. An inactive Tavern shows nothing there, to avoid noise. Called "Кръчма" in Bulgarian and "Cantina" in English.

Core combat stats, round cap, Tavern costs and activation cost are **PROVISIONAL** (Core: `apps/api/src/config/game-config.ts`'s `core` block; Tavern levels, costs and activation: godmaster → Balance → Clan buildings since 2026-10-19).
