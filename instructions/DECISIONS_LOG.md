# PENTILIUS — Decisions Log

Historical record of confirmed decisions and the reasoning behind them, for
context the code/schema alone doesn't carry. This is a log of what happened
and why — it is **not** a tracker of what's still open; see
`instructions/OPEN_DECISIONS.md` for that. Deliberately **not** referenced
via `@` from `CLAUDE.md` (see `instructions/OPERATIONS.md`'s "Decisions log"
section) — it's long and rarely needed turn-to-turn, so it's read on demand
rather than loaded into every conversation.

Entries are grouped by topic, each dated.

## Level cap, XP curve, zone/boss unlocks (2026-10-11)

Player level cap raised to 100, for a seasonal (~6-month reset) model with
the Core as true endgame rather than unbounded leveling — a flat max level is
dramatically easier to balance PvE/PvP combat stats around than an
open-ended one. There's no separate "max level" flag anywhere in the code;
`applyXp()` (`economy.service.ts`) simply stops once no `LevelThreshold` row
exists for the player's current level, so the cap is purely "don't seed a
level-100 row" (level 99's row is the cost to go 99→100, the last one that
matters). Levels 1-14 are untouched from the original curve (already live in
production with real player progress). Levels 15-99 are new: a provisional
power-law curve (`xpRequired = a * level^2.126`, fit to meet the existing
level-14 value with no visible seam) — chosen over continuing the old
curve's compounding-percentage growth, which was checked and blows up
catastrophically past ~20 levels (an earlier attempt put level 100 alone at
253 million XP).

Alongside the cap, zones now unlock at levels 1 / 20 / 40 / 60 (previously
1 / 3 / ... under the old 1-14 curve) — spread across the new wider level
range. Boss formations unlock per-boss at 15 / 25 / 45 / 65 (`Boss.minLevel`,
one boss per zone): the first boss is a fixed 15 rather than its zone's own
unlock level of 1 (too early), and each later boss is its own zone's
`unlockLevel + 5`, giving a little gearing-up room after entering a new zone
before its boss becomes available. This replaced the old single flat
`GAME_BALANCE.bossFormations.minLevel` that gated all 4 bosses at the same
player level regardless of difficulty.

## Pentili roster expansion (2026-10-11)

Rather than commission new art for the wider level range, every zone now has
a full 10-entry roster reusing all 8 existing Pentili "looks" (same
`nameKey`/`iconAssetId`), power-ordered (Skitterling weakest → Stormcaller
strongest), with the strongest 2 (Voidling, Stormcaller) repeated once more
per zone as a second, stronger encounter — no "Elite" wording anywhere, only
the existing "(Lv. X)" label communicates the difference. The original 8 keys
keep their original `zoneId` (only their `level`/stats moved to fit the
zone's new, wider level slice) specifically so their existing tier-matched
loot tables (Pioneer in zone 1, Ascendant in zone 2, Coreforged in zones 3-4)
stay correct; every "borrowed" appearance of a creature in a zone it doesn't
canonically belong to is a new key (e.g. `pentili_ridgefang_z1`). Stats follow
a provisional power-law fit against the original 8 data points
(`maxHp = 20*level^1.07`, `attack = 4*level^0.916`, `defense = level^1.249`,
`xpReward = 8*level^1.3`).

Owner decision: Pentili are **not** level-gated within an already-unlocked
zone — all 10 are shown and attackable immediately, the player judges for
themselves whether a given one is too strong (unlike bosses, which do have a
per-boss `minLevel` gate and show greyed-out/inactive below it). This was an
explicit, deliberate rejection of adding a second gating mechanism: "Играчът
сам ще си преценява кой може да нападне и кой не."

Loot rule for the 32 new ("borrowed") Pentili entries (2026-10-11): no
Credits ever (unlike the original 8, which can drop Credits). Metal and
Crystal always drop (100% each, tier-matched to the zone). On top of that, a
combined ~10-14% chance per kill of some set-related reward: one of the 7
equipment-slot items at 2% each (~14% combined, tier-matched), plus two
separate smaller rolls — 5% for an upgrade-stone fragment, 1% for a complete
upgrade stone. Implemented as a generated (not hand-written) block in
`seed.ts` right before the existing `lootDrop.createMany` call.

## Boss combat-stat rescale against the formation model (2026-10-11)

Bosses had never been rescaled after Boss Formations (below) replaced the
old solo-contribution model — their stats predated the "5 players' stats
summed into one combined combatant" fight model entirely, so they were
badly under-tuned relative to real expected player power at their unlock
level (some Pentili were stronger than the boss meant to gate them).

Rescale methodology: derived an approximate player combat-power model from
`game-config.ts` (`robotAttributes`'s `damagePointValue`/`defensePointValue`/
`hpPointValue`, equipment tier base stats × `(1 + upgradeLevel*0.1)`, the
`GAME_BALANCE.combat` floor), projected what a reasonable 5-player formation
at each boss's `minLevel` would sum to, and set each boss's
`maxHp`/`attack`/`defense`/`xpReward` to be a meaningful but beatable fight
against that — not a guess. Final values: Verdant Warden (Lv.15 gate) HP
1400/ATK 130/DEF 60/XP 16000; Ridgeback Alpha (Lv.25) HP 2500/ATK 210/DEF
180/XP 32000; Crimson Harbinger (Lv.45) HP 4700/ATK 380/DEF 350/XP 68000;
Frost Sovereign (Lv.65) HP 6100/ATK 490/DEF 440/XP 110000. A full explanatory
comment documenting this methodology lives directly above `bossData` in
`seed.ts`.

## Core Attributes and robot equipment (2026-09-09)

The ship concept was replaced by a combat robot with a LOCKED 7-slot anatomy
(Head/Left Arm/Right Arm/Armor/Core/Left Leg/Right Leg, see
`instructions/GAME_SYSTEMS.md`). `seed.ts`'s `itemData` is 3 named sets —
Pioneer/Ascendant/Coreforged — one item per slot per set.

Both Core Attributes curves (points granted per level, cost per point) are
flat, not compounding — `pointsGrowthRate`/`attributeCostGrowthRate` are `0`,
so every level grants a flat 3 points and every point in a stat costs a flat
1, regardless of level or current rank (previously 15%/20% compounding
growth respectively). This removes the old "spreading points across stats is
cheaper than stacking one" soft-cap and makes Evasion's hard cap (40 ranks =
20%, unaffected) trivially reachable early. Existing players' already-*paid*
cost under the old exponential curve was refunded as available points via a
one-off, uncommitted script run directly against production once,
immediately after this change deployed — not part of the codebase, not
re-runnable. Already-*earned* points from leveling were left untouched (the
old growing curve already gave more than the new flat one would have, so
there was no shortfall to top up there). If flat/flat proves too easy in
practice, the owner's planned fix is a full attribute respec (reset spent
points, refund the total, let players reallocate) rather than quietly
reintroducing growth.

A fresh registration no longer grants the Pioneer starter kit or any starting
attribute points (`Player.attributePointsAvailable` default 20→0;
`ItemDefinition.isStarterItem` removed entirely from the schema, since
nothing read it anymore). In its place, `GAME_BALANCE.combat` gained a small
universal `baseAttack: 3`/`baseDefense: 2` floor (alongside the pre-existing
`basePlayerHp: 100`), sized so a bare, unequipped, 0-point robot beats only
the single weakest Pentili in the first zone (`pentili_skitterling`) and
loses to the next-weakest (`pentili_mossback`). Registration-time only — does
not retroactively strip items/points from already-registered players, but
the baseAttack/baseDefense floor is a combat-formula constant, so it applies
immediately to every existing player's combat stats.

## Epic items / boxes (date untracked, pre-2026-10)

3 tier-matched boxes (`pioneer_box`/`ascendant_box`/`coreforged_box`) can be
opened (`inventory.service.ts`'s `openBox`) for a guaranteed RARE (90%) or
EPIC (10%, 2 Excellent options) item of that tier
(`GAME_BALANCE.boxOpen.epicChance`). Race-locking on the granted item follows
the normal tier-based `rollRace()` rule, unchanged. Boxes are Shop-only for
now (not in any loot table).

## Research: single active slot (2026-09-11)

Reversed from letting all 4 technologies research in parallel — with only 4
techs capped at level 5, parallel research let players exhaust the whole
tree too quickly. Now one slot, same rule as expeditions and base building.

## Boss Formations (2026-09-11, replacing the old open-lobby "Boss Hunts")

4 bosses, one per zone/Territory (Verdant Warden, Ridgeback Alpha, Crimson
Harbinger, Frost Sovereign — the middle two pre-existing, the outer two new
content). A formation is a squad of exactly 5 hard race-locked slots
(`BossFormationSlot`, one per `Race`) built against one boss — creating one
auto-fills the creator's own race slot. Visibility
(`visibleToClanOnly`/`visibleToFriendsOnly`) mirrors `MarketListing`'s
boolean-union semantics exactly, editable by the creator only during the
first `GAME_BALANCE.bossFormations.visibilityEditWindowHours` (2h) of the 3h
enrollment window (`enrollmentWindowHours`). A single rolling 24h cooldown
(`Player.nextBossFormationActionAt`, `actionCooldownHours`) covers both
creating and joining — deliberately personal/rolling rather than a fixed
global reset hour, to stay fair across timezones. No kick, and no self-leave
once joined — both create and join are gated behind `ConfirmButton`.

Combat is one combined party-vs-boss fight (`combat.service.ts`'s
`aggregateFormationCombatStats`, built on a `computeCombatBreakdown`/
`PlayerCombatBreakdown` split of the existing per-player
`computePlayerStats`): raw stats sum per-player-factor-first, then
Excellent-option percentages (`INCREASE_DAMAGE`/`CRITICAL_DAMAGE`/
`INCREASE_MAX_HP`/`DAMAGE_DECREASE`, capped via `maxDamageDecrease`) are
summed across every filled slot and applied ONCE to the combined total —
deliberately stronger than solo combat's per-player-then-summed model.
`DAMAGE_REFLECT` is excluded entirely (PvP-only).

No contribution-weighted rewards: every participant of a WIN gets an equal
XP split (`Math.floor(xpReward / filledSlotCount)`), the same guaranteed
tier-matched box (`Boss.guaranteedBoxItemDefinitionId`, on top of the
pre-existing independent `BossLootDrop` chance rolls, unchanged), and the
fight's full `damageDealt` credited (not divided) to every winner's
`BossFormationDailyPoints` row for that UTC calendar day — a separate fixed
00:00-UTC clock from the personal action cooldown, collected now but with no
ranking/reward-tier UI yet. A loss gives nothing at all. Resolution is lazy
(checked on next read, no cron), same pattern as buildings/research/
expeditions.

(See also the 2026-10-11 boss combat-stat rescale entry above — the stats
here were later recalibrated against the real formation-combat math; this
entry covers the system design, not the numbers.)

## PvP foundation (Milestone 3)

PvP unlocks at player level 5, and players below level 5 cannot be targeted;
the attack spends 1 Action Energy (`game-config.ts` `pvp.attackCostEnergy`),
reusing the existing resource rather than a separate PvP currency; a loss
costs the defender a flat percentage of their current Metal/Crystal/Credits
(`pvp.resourceStealPercentage`, 10%), transferred to the attacker. Targeting
is "random suitable opponent" among all level-5+ players (clan-filtered
targeting waits for Milestone 4's clans); a per-attacker/defender cooldown
excludes a recently-attacked defender from that attacker's next random pick;
a losing defender gets a short revenge-protection window
(`Player.pvpProtectedUntil`) excluding them from anyone's target pool.

## Clans foundation (Milestone 4)

Joining any clan is open (no invite/request system), mirroring the Boss
Hunts precedent from before clans existed. The treasury is donate-only —
nothing may be withdrawn back to a player, only spent on clan buildings. The
three clan buildings are Member Hall (raises the effective member cap), Clan
Forge (a combat attack/defense bonus for every member) and Clan Depot (a
Metal/Crystal production bonus for every member). Base member cap is a flat
10, topped up by Member Hall's level × its bonusPerLevel (+2 slots/level, a
flat count not a percentage); all three buildings develop up to level 10;
Clan Forge/Depot's bonusPerLevel (+5%/level, mirroring Research's rate, up to
+50% at level 10) stacks additively on top of a member's own personal
research bonus. Leader succession on leave goes to the longest-tenured
officer, else the longest-tenured member, else the clan disbands. Only the
leader or an officer may start a clan-building upgrade. Deliberately NOT
built: clan-scoped boss hunts, contribution tracking toward the Core,
clan-vs-clan war systems.

## Race-locked equipment: instance-level stamp (date untracked)

Race-restricted advanced robot parts are stamped at the dropped/granted
*instance* level, not the item type: `ItemInstance.race` is set at grant time
(`rollRace()`), not `ItemDefinition.race`. Odds per tier: Pioneer always
universal, Ascendant a 1/6-universal-vs-5/6-locked split (evenly across the 5
races), Coreforged always locked. Applies identically to loot and Shop
purchases. `ItemDefinition.race` still exists (nullable, every seeded item
`null`) and is reserved for a possible different future mechanic — a
definition that's *always* one fixed race — unrelated to and unused by the
instance-stamping above.

## Smelting/Recycling and the System Shop (date untracked)

Both Smelting/Recycling halves are built as independent choices on the same
item, neither replacing the other: "Sell" gives flat Metal/Crystal by
tier+quality (ignoring upgradeLevel by design); "Recycle" grants 1
tier-matched fragment regardless of quality/upgradeLevel, auto-converting
every 20 fragments into that tier's own upgrade stone.

The System Shop (distinct from the still-unbuilt player-to-player
Trading/auction) lets players buy any `ItemDefinition` for a combination of
Metal/Crystal/Credits — price lives per-item on `ItemDefinition.shopPrice*`
(0 = not required), so real pricing is a data change, not a code change. A
bought item is always NORMAL quality (no Rare/Excellent options from the
Shop) but rolls the same tier-based race-lock chance as a loot drop; the Shop
displays the odds before purchase.

## Oxygen and generic Upgrade Stones dropped (2026-09-07)

Oxygen never got a producing building or any use after being seeded as a
placeholder resource — dropped entirely, not just deferred. The generic
"Upgrade Stones" resource was dropped at the same time, replaced by 3
tier-specific consumable materials (Pioneer/Ascendant/Coreforged Upgrade,
seeded in `seed.ts`) tracked as inventory items instead of a `Player`
currency field. `ResourceType` shrank from 5 values to 3 (METAL/CRYSTAL/
CREDITS) in migration `20260907090000_remove_oxygen_upgrade_stones`, which
also dropped the now-unused `oxygen`/`upgradeStones` columns from `players`.
This was a real code change at the time, but `GAME_SYSTEMS.md` and
`OPEN_DECISIONS.md` kept referencing Oxygen as a live placeholder for over a
month afterward — caught and fixed only during the 2026-10-11
documentation cleanup. Confirmed again on 2026-10-11 ("от старите идеи,
които отпаднаха... нямаме такъв ресурс") when the owner was asked about
candidate new buildings and ruled out an Oxygen Processor on these grounds.

## Expedition durations and early-cancel payout (date untracked)

Owner-specified, not placeholder guesses: 60/300/600 minute durations
(`GAME_SYSTEMS.md`'s own example) and a 70% early-cancel payout
(`expeditions.earlyCancelPercentage`).

## Seasons and the Core (2026-10-12)

The earlier "clans build the Core, then activate and defend it" concept was
dropped by the owner. It was replaced by an **attacked** Core: any clan
member attacks it for 1 Action Energy, and the damage dealt becomes points
for their clan. When a configurable window closes (default 14 days), the clan
with the most damage wins the season. Discussed alternatives:
- a shared Core HP pool, where the last hit or the most damage wins;
- per-clan 0-100% progress bars, where the first to 100% wins.

The plain cumulative total was chosen as the most predictable and calm
competition. "Tug-of-war" (attacks lowering other clans' totals) was raised
but not adopted.

Key owner decisions and why:
- **Opening time and duration are set from a godmaster Settings tab**, not
  hard-coded, and both lock once the Core opens. Postponing or changing the
  rules mid-race would be unfair to the clans already competing.
- **The Core fights back** (the fight ends when the robot falls or the round
  cap passes) so every stat matters: Defense, HP, Evasion and Reflect, not
  just Attack. A Core that only took hits would make pure-damage builds
  the only viable option.
- **1 energy per attack, points = damage**: equal attack budgets for
  everyone, so strength comes from the robot rather than from playtime.
- **Clan members only, no minimum level**: the ranking is per clan.
- **Clan switching**: there is no waiting period, and points stay with the
  clan the player was in when they attacked. Late clan-hopping can only
  bring the new clan at most one energy bar's worth of attacks.
- **10 s anti-flood gap** between a player's attacks.
- **Sliders show the top 10 plus your own clan**, relative to the leader
  (100%). The leader-relative view shows "how far behind first place" more
  clearly than a share of total damage.
- **No season rewards.** Final placements are snapshotted permanently
  (`SeasonClanResult`) for future profile display.
- **Accounts persist across seasons, but everything else resets.** The reset
  itself is not built yet.

**Tavern ("Кръчма" in Bulgarian, "Cantina" in English).** Lore: soldiers get
braver. It is a new clan building giving +1% damage per level against
**bosses and the Core only**. That keeps it useful all season, through
bosses, and keeps it distinct from Clan Forge's general bonus. There is no
level cap; rising cost limits it naturally, so players don't feel an
artificial wall. Rows are seeded up to the 32-bit cost limit (level 104).
The bonus only applies while the Tavern is **active**: a leader or officer
activates it from the treasury for 12 h, at a cost that grows with level. It
was first built with auto-renewal from the treasury. The owner reversed that
the same day: it must **not** renew on its own. Once it expires, someone has to
activate it again by hand, so the bonus is a deliberate, recurring clan
decision rather than a passive drain. This keeps Metal and Crystal meaningful
late in the season, which was the original worry: resources going dead once
research and gear max out.

## Base as a fortress, Defense System (2026-10-12)

The Base page was reworked to match the clan buildings:
- buildings are tiles (picture, "Name (level)") inside the wall-and-tower frame, which was previously a "visual mockup only";
- details and actions open in a sheet on click;
- the old per-building cards were removed.

The owner wants the frame itself to become buildings. The **corner towers are the Defense System**: +1% defense per level, max level 10 for now. It is deliberately **defense-only**: it applies when another player attacks you (PvP, and clan-war duels where you are the defender) and also shows in the attacker's scout/target preview of you, but never on your own attacks. Max level 10 and +1% were kept as the owner's first-pass values, and real play will show whether +1%/level is too subtle. Later the same day the walls became the **Defensive Wall**: longer regular-PvP protection after a lost defense, +5 min per level. It deliberately does not apply to clan wars, where long protection could stall a whole war. Resource protection went into a separate **Hideout** building instead of the wall, at the owner's suggestion. The Hideout is the classic genre model: a fixed amount per level can't be stolen, in both PvP and clan-war duels. That favors small and weak players, whereas a percentage would protect the rich equally.

The Crystal Extractor's display name became "Кристална мина" / "Crystal Mine", for symmetry with the Metal Mine. Only the translation changed; the stable key `crystal_extractor` stays.

