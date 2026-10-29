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

## Blocking and reporting (2026-10-12)

Built as the first step toward app-store compliance: Apple and Google require
UGC apps to let players block others, report content, and have it moderated.
The current store terms still need checking before submission.

**Blocking** is one-directional and affects communication only. The blocker
stops seeing the blocked player's clan-chat messages, and the two can't be
friends, so there are no DMs or friend requests between them. Blocking deletes
any existing friendship or pending request.
- The blocked player is never told: their attempts fail with a generic error,
  to avoid provoking conflict.
- Gameplay is untouched: PvP, wars, market and rankings.
- If two clanmates block each other, only chat is affected; the clan itself
  is not.
- There is no limit on how many players you can block.

**Reports** can target:
- a player profile;
- a clan;
- a clan-chat message, which only current members of that clan can report;
- a direct message, which only its recipient can report.

The server snapshots the content itself, so the evidence survives later edits
and deletions. **A report never acts automatically**: only a godmaster admin
decides, so false reports can at worst waste moderation time. That queue is
protected by the following, all in `GAME_BALANCE.moderation`:
- 10 reports per day and a 30-second gap between reports;
- an account at least 3 days old OR at least level 5;
- no duplicate open report of the same thing;
- reporter reputation: 5 dismissed among the last 10 decided reports
  automatically suspends reporting for 7 days.

The godmaster **Доклади** tab groups reports by target, shows each reporter's
total and dismissed counts, flags when several reporters share a clan (possible
organized reporting), and supports resolving or dismissing individually or per
group. It can also delete a reported clan-chat message, which clan chat could
not do before. Every decision is written to the admin action log. Report abuse
is meant to be listed as a rule violation once the Rules page exists.

## Godmaster staff accounts and sessions (2026-10-12)

The owner was being logged out of godmaster every 2 hours, because the admin
token was fixed at `ADMIN_JWT_EXPIRES_IN: 2h` with no renewal, and asked never
to be logged out automatically.

**Sessions** now slide: the token lasts 30 days and godmaster renews it on load
and every 6 hours, so an account in use never expires.

This is safe only because the admin JWT strategy now **re-checks the account
in the database on every request**:
- `AdminUser.isActive` must still be true;
- `AdminUser.tokenVersion` must still match the token;
- the role is read from the database, not trusted from the token.

Bumping `tokenVersion` (a new password, a role change, deactivation, or a
password change by the user) revokes every existing session of that account
immediately.

**Account management** is ADMIN only. An ADMIN can change another account's
role, issue a new random password (shown once), and deactivate or re-activate
an account. Accounts are deactivated, never deleted, so the action log stays
readable. Your own account can't be changed this way, which prevents locking
yourself out, and at least one active ADMIN must always remain. Any staff
account can change its own password. Every action is logged.

**Still open:** both roles can currently grant resources and items to players
and download DB backups. Backups contain every player's email and password
hash. Restricting these to ADMIN was proposed but not yet decided.

## Account deletion (2026-10-12)

App-store requirement: Apple and Google both require in-app account deletion,
and Google also requires a web path. This needs checking against the current
store terms before submission.

**Confirmation.** The player enters their current password and retypes a
one-time code shown on screen (6 characters, no ambiguous ones, valid 10
minutes, not copyable). A code was chosen over typing a word like "ИЗТРИЙ"
because it is language-independent and can't be typed from habit. An emailed
code would be stronger, but the game can't send email yet.

**Grace period.** Deletion happens after a grace period: 3 days by default,
editable by an ADMIN in the godmaster Settings tab (`GameSettings`). During it
the player plays normally, sees a banner on every page, and can cancel. It is
never cancelled automatically just by logging in.

**What happens.** An in-process background job, every 10 minutes, finds due
accounts and anonymizes them. There is no cron infrastructure; deletions only
need to happen around their scheduled time.
- Personal data is wiped: email, password, bio, items, buildings, research,
  expeditions, friends, DMs, blocks, reports they filed, and resources.
- Their seat in any still-open boss formation is freed.
- The player leaves their clan through the normal path, so leadership passes
  on, or a solo clan disbands.
- The Player row stays, with the username replaced by a `~deleted~…` marker
  (`~` is impossible in real usernames). Clients render it as a translated
  "Deleted player", so all history keeps working: battles, PvP, wars, market,
  Core points, clan donations and clan-chat messages.
- The old username and email are freed immediately for re-registration.
- `AccountDeletionLog` keeps only the old username, for support.

**Banned players** can't log in to use this, so they request deletion via the
support email. A godmaster "delete this account" button may come later.

Backups are deliberately not addressed beyond not promising instant removal
from them in the Privacy Policy.

## Public information pages and registration terms (2026-10-12)

Public pages that work without login, in both bg and en:
- `/about`, `/lore`, `/rules`, `/privacy`, `/support`, `/delete-account`;
- linked under the login/registration form, in a Settings "Информация"
  section, and in every page's footer.

All text lives in `messages/*.json` under `pages.*`.

**Operator** (owner-provided): ОПТИСКЕЙЛ СЪЛЮШЪНС ЕООД (OPTISCALE SOLUTIONS
EOOD), ЕИК 208772002, Sofia, Bulgaria; support@pentilius.com. These values,
the minimum age and the default grace days are in one place,
`apps/web/src/lib/legal.ts`, and are filled into the texts. The page texts use
the static default of 3 grace days; keep it in step with the godmaster setting.

**Minimum age 13** (owner decision). It was discussed against 14, the
Bulgarian GDPR self-consent threshold. The texts therefore add that players
under 14 need parental permission. A minimum age matters for the store
target-audience declarations and because of player-to-player chat, not
because of the game content.

**Registration** now requires the "I am at least {minAge} and accept the Rules
and Privacy Policy" checkbox. The API rejects it unless `acceptedTerms ===
true` and stores `Player.termsAcceptedAt`; all e2e register calls were updated.

The Rules and Privacy texts are drafts written by Claude and should be reviewed
by someone with legal knowledge before relying on them. The lore was written
from `PRODUCT_SPEC.md` for the owner to edit.

## Content filter (2026-10-12)

This covers Apple's "method for filtering objectionable material" requirement
for UGC apps.

**Where it applies:**
- **Rejected** (generic `INAPPROPRIATE_CONTENT`, never naming the word):
  usernames at registration, clan name, tag and description, and player bios.
- **Masked with asterisks** instead, so the conversation goes on: clan chat
  and direct messages. The owner chose to include DMs too.
- **Not filtered:** report comments (only moderators see them) and godmaster
  renames (staff are trusted). Existing names are not re-checked
  retroactively.

**Matching** (`apps/api/src/moderation/content-filter.ts`, unit-tested):
- text is reduced to a Latin "skeleton": Bulgarian transliteration, lowercase
  Cyrillic look-alikes, leetspeak, and Bulgarian chat-Latin `4`=ч / `6`=ш;
- separators and repeated letters are removed;
- `4` and `6` are ambiguous, so several readings are checked.

Each word is either **SUBSTRING** (anywhere, for long unambiguous words) or
**WHOLE_WORD** (standalone only, for short words that occur inside innocent
words, e.g. `ass` in "class"). Uppercase-only look-alikes (В/Н/Т/М) were
deliberately left out after they turned the name "Ева" into "eba".

**The word list** is the `BannedWord` table, managed from the new godmaster
**Филтър** tab by both roles: add, remove, and a test box that also shows how
chat would render the text. Every change is logged and applies immediately;
the cache is invalidated, with a 60 s safety TTL.
- The seed adds a starter list (en + bg). It never removes or overrides
  moderators' edits, because it only inserts missing words.
- Words dropped from the starter list as false positives: гъз ("газ"),
  педал (pedal), курат (куратор). ебан/ебана are WHOLE_WORD (небанален).
- A false-positive check against real names and common words found only
  acceptable hits, e.g. shitake and Penistone.

## Season reset (2026-10-13)

**Timing.** The season resets automatically **N days after the Core closes**
(`GameSettings.seasonResetDelayDays`, default 1, editable in godmaster
Settings). Players see a countdown on the Core page and in the Command
Center. The delay gives time to see the final standings and guarantees a
nightly backup of the final state. An ADMIN can also "reset now" from
godmaster Settings, only once the Core has closed, confirmed with the new
season's number and their password. Both paths are in
`season-reset.service.ts`.

**Wiped:**
- **All clans are disbanded** (owner decision: option b), with their
  buildings, treasury, wars and chat.
- Every player's progress resets to `GAME_BALANCE.newPlayer`: level, XP,
  attribute points, resources, energy, buildings, research, expeditions,
  inventory and market listings.
- All battle history: PvE, PvP, clan wars, bosses and Core attacks.

**Kept:** accounts, cosmetics, friends, DMs, blocks, reports/bans, and the
frozen season results.

**Race.** Everyone **re-picks their race** at the start of each season, via a
blocking modal, using `Player.needsRaceSelection` and `POST /player/me/race`.
This is an owner decision; `PRODUCT_SPEC.md`'s "chosen once at registration"
now means once per season.

**Profile season card** (`SeasonPlayerResult`), frozen when the Core
closes, not at the reset, so a last-day clan switch can't claim a placement.
It holds:
- race and final level;
- the clan the player was in **at the end of the season** (owner decision,
  not the clan they dealt the most damage for), with its rank and the
  player's role;
- personal Core damage and its rank.

It is shown as e.g. "Сезон 1 · Luxari · #3 с [STI] Sim Titans (Офицер) ·
Ниво 47 · Ядро: 184 520 щета (#12)". PvP/boss stats and podium badges were
offered and declined.

**At the moment of the reset** (owner decision, refined after live testing):
- Every page counts down to `profile.seasonResetAt`. At zero it calls
  `POST /core/season-check`, which resets right away if it is due by the
  server's clock, so clients can't trigger it early; a 1-minute server timer
  is the fallback. The page then reloads the profile.
- `needsRaceSelection` sends the player to the Command Center with the
  non-closable "Започна Сезон N!" race modal.
- Until a race is picked, the API refuses every non-GET request except race
  choice, account deletion and the season check (`RACE_SELECTION_REQUIRED`).

**Before the Core opens:**
- `/core` redirects to Zones.
- The planet's Core art is dimmed, with "Очаквайте скоро". It is bright only
  while open, or after the season shows "превзето от [clan]".
- Season results are written with skip-duplicates, so a re-run after a manual
  DB edit can't break the Core page or block the reset.

The reset was verified on a throwaway copy of the local DB. Every listed
table was emptied, friends and DMs were kept, all 63 players were flagged
for race selection, and 63 player cards plus 8 clan results were written. A
second reset is refused.

## Dropped ideas and Epic box source (2026-10-13)

- **Pentili escalation** (Pentili getting stronger or more aggressive as the
  Core race advances) is **dropped**. It is no longer a planned mechanic.
- **An auction with bidding** is **dropped**. Player trading stays the
  fixed-price Market.
- **Epic items** come from loot boxes, which bosses drop (tier-matched,
  guaranteed on a win; opening one yields RARE or EPIC). The Shop also sells
  boxes, but only while the game is in testing; they will be removed from the
  Shop before a real launch.

## Daily tasks (2026-10-13)

- **Task list** (fixed, from `GAME_BALANCE.dailyTasks`; not managed from
  godmaster for now):
  - Pentili battles, a chain of 10 → 15 → 20. Every battle counts, won or
    lost. Only the next unclaimed tier is shown.
  - 1 expedition. It counts when a finished expedition is collected; a
    cancelled one does not count.
  - 1 PvP battle, shown from the PvP minimum level.
  - 1 boss formation, either created or joined. Shown from the lowest boss
    minimum level.
  - Clan donation of 100 resources (Metal, Crystal and Credits in any mix).
    Smaller donations fill the bar proportionally. Shown only to clan
    members.
- **Rewards:** Metal, Crystal and XP scale with the player's level (a
  per-level amount × level). Some tasks also give flat Action Energy, capped
  at the player's max.
- **All-tasks bonus:** a small energy pack (`energy_pack_small`). If the
  inventory is full, its energy is added directly instead.
- **Reset:** at 00:00 Bulgarian time (`Europe/Sofia`, DST-aware).
- **Unclaimed rewards** (revised the same day, see VIP below): completed but
  unclaimed tasks from earlier days are granted automatically only to players
  who were VIP when that day ended. For everyone else they expire at
  midnight. The auto-granted bonus needs every task completed that day.
- **Display** (revised the same day): a "Daily tasks" tile in the Command
  Center opens the list in a popup. The tile has its own dot, and the Command
  Center nav item has a dot while something can be claimed here or in
  Achievements.

## VIP, first pass (2026-10-13)

The principle: VIP saves time and clicks. It never adds combat power, loot,
XP, build speed or Core points, so it does not become pay-to-win.

- **Status:** `Player.vipUntil`. A player is VIP while now is before it.
  There is no payment yet. An ADMIN grants VIP from the godmaster player view:
  +7 days, +30 days, or any number of days. Adding days extends an active VIP
  from its current end. "Remove VIP" ends it. Every change is written to the
  admin action log (`GRANT_VIP` / `REVOKE_VIP`). A future payment flow will
  extend the same date.
- **Perks:**
  - **Automatic daily-task rewards.** Unclaimed completed rewards are granted
    after midnight. Without VIP they expire.
  - **"Attack ×3" against Pentili.** A second button next to the normal
    attack. Energy, odds and rewards are the same as three single attacks.
    It runs ×2 with 2 energy and is inactive with 1. The series stops at the
    first loss. The size is `GAME_BALANCE.vip.multiAttackCount`.
  - **Build queue (one slot).** While a building is under construction, one
    more can be queued, including the next level of the same building. It is
    paid when queued and fully refunded on cancel. It starts by itself
    exactly when the current construction ends, even offline, and is no
    faster. If VIP expires, an already queued building still gets built.
  - **Chat name colour.** VIP names are pale yellow in clan chat and in direct
    messages.
- **Later:** VIP profile frames; possibly a VIP badge (not now). Max energy
  12 instead of 10 was left for a separate decision.

## Achievements and level rewards (2026-10-13)

- **Season-scoped:** both reset with the season, along with daily-task rows.
- **Claiming:** every reward is claimed by hand, never automatically. Once
  one is claimed, the next of the same kind appears, like the daily-task chain.
- **Level rewards:** one row at a time, for the lowest unclaimed level from 2
  up.
  - Metal and Crystal scale with the level: 100 and 25 × level
    (placeholders).
  - Every 5th level adds a box of the set of the zone being entered:
    - levels 5-15: Pioneer;
    - levels 20-35: Ascendant;
    - levels 40-100: Coreforged.
  - Config: `GAME_BALANCE.levelRewards`.
- **Achievements** (`GAME_BALANCE.achievements`, placeholder rewards):
  - Pentili wins: 100 / 500 / 2,000 / 10,000.
  - Expeditions completed: 10 / 50 / 200.
  - Regular-PvP wins: 10 / 50 / 200. Clan-war duels don't count. No extra
    anti-abuse rule is needed: opponents are picked at random by the server,
    with cooldown and protection.
  - Boss wins: 1 / 10 / 50.
  - Best item upgrade: +5 / +10.
  - Full set equipped: Pioneer / Ascendant / Coreforged, all 7 slots at that
    set or stronger.
  - Every base building at level 5 / 10.
  - Clan donations: 10,000 / 100,000 resources.
  - Core attacks: 1 / 50.
  - Days with the all-daily-tasks bonus received: 7 / 30.

  Upgrade, set and building achievements read the player's current state; the
  rest are counters. "First Rare / first Epic" was left out for now.
- **A full inventory** blocks claiming a reward that includes an item. Nothing
  is lost; the player claims it again after freeing space.
- **Display:** an "Achievements" tile next to "Daily tasks" in the Command
  Center, with its own dot, opening a popup. The level reward is on top, then
  the achievements with progress bars.
- **Later:** frames and titles as cosmetic rewards. They need art first.

## Contact the team (2026-10-13)

- **Player side:** a "Contact the team" section in Settings. The public
  Support page points to it.
  - The player picks a category (Idea, Problem, Question, Other) and writes
    up to 2000 characters.
  - "My messages" lists their conversations. The player can reply until
    staff close the conversation.
- **Staff side:** one shared inbox in a godmaster "Обратна връзка" tab.
  - Every moderator and admin sees and can answer every conversation.
  - Filters: status (new / answered / closed / all) and category.
  - The tab shows how many conversations are waiting.
  - Staff can close a conversation and reopen it.
  - Replies, closes and reopens go to the admin action log.
- **Anonymous replies (for now):** the player sees staff replies as "the
  Pentilius team". Each reply's author is stored and shown only in
  godmaster. Showing names later only changes what the player endpoint
  returns.
- **Statuses:**
  - OPEN means waiting for staff: new, or the player wrote again.
  - ANSWERED means staff replied. A staff reply sets the dot on the Settings
    icon in the top bar until the player opens it.
  - CLOSED means done. A staff reply reopens it as ANSWERED.
- **Limits** (`GAME_BALANCE.support`):
  - 3 new conversations per 24 hours;
  - 5 not-closed conversations at once;
  - 3 player messages in a row before staff answer.
- **Retention:** conversations survive season resets and are deleted with
  the account.

## Menu dots kept out of the profile (2026-10-13)

The daily-task, achievement and team-reply dots used to be computed inside
the player profile, which loads on nearly every page and after every action.
They are now one light `GET /player/me/notifications` call, the same way the
friends unread status works. It is checked once per page change and right
after a claim or after opening a team reply, with no polling. The Command
Center tiles, the daily-tasks popup and "Contact the team" no longer refresh
on a timer either. A dot set by a battle therefore shows up on the next page
change. Owner decision: the cheaper approach for the current single server;
revisit with more capacity.

## One refresh mechanism for every page (2026-10-13)

To keep server load low on the single small VPS, every page now uses one
shared helper (`apps/web/src/lib/use-refresh.ts`) with the same rules:

1. Load once when the page opens.
2. Nothing runs while the tab is hidden; coming back refreshes at once.
3. Refresh once when a known timer ends (construction, research, expedition,
   Core opening or close, war end).
4. Refresh right after the player's own actions, as before.

Periodic refresh exists only for data other players change, and only while
the tab is visible:

| Page | Refresh |
|---|---|
| Base, Research, Expeditions | none (timers only) |
| Command Center: base, robot, zones, research, expeditions, clan | timers only |
| Command Center: PvP status, clan war, Core, boss formations | 60 s |
| Core standings | 30 s |
| Clan chat, friends chat, boss formations, clan war | 5-10 s |

Before this the Command Center made 10 requests every 5 s, and Base and
Research polled every 3 s, even in hidden tabs. Rough, unmeasured estimate:
about 10x fewer requests per online player. Merging the Command Center into
one request was considered and deferred until the mobile app's home screen
needs it: more coupling, and one failing part could break the whole page.

## Notifications and Web Push (2026-10-13)

- **Principle:** the server decides what to notify and when; delivery
  channels plug in. Today: in-game notices, browser notifications and Web
  Push. Later: the mobile app. Browser first, built so the app is easy to
  add.
- **Kinds:**
  - `ENERGY_FULL` (LOCKED requirement);
  - `CONSTRUCTION_DONE`;
  - `RESEARCH_DONE`;
  - `EXPEDITION_DONE`;
  - `PVP_ATTACKED`.

  Each one can be switched off in Settings → Notifications, stored as
  `Player.notificationSettings` (missing = on). "Turn on" in Settings is per
  device: it asks the browser's permission and subscribes that browser to
  Web Push.
- **While the game is open:** the light notifications check (once per page
  change) also returns upcoming timers and the last PvP defense. The client
  schedules them: an in-game notice if the tab is visible, a browser
  notification if it's in the background (skipped when this device has Web
  Push, to avoid doubles).
- **Web Push (game closed):**
  - It uses our own VAPID keys (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in
    the API env) and the `web-push` library. No paid service; delivery goes
    through the browser vendors' push services.
  - A one-minute in-process scan finds timers that ended in the last 10
    minutes for subscribed players. This is one light scan, not a job per
    player.
  - PvP attacks are pushed right after the battle commits.
  - `PushDispatch` makes every notification go out once.
  - Subscriptions that the browser reports gone are deleted, and all of
    them are deleted with the account.
  - The service worker (`public/sw.js`) always shows the notification. An
    early version skipped it when the game looked open and focused, but on
    phones a locked screen can still look "visible", so pushes got lost.
  - Pushes are sent with high urgency, so Android delivers them right away
    even to a sleeping (Doze) phone.
- **Platform limits** (from secondary sources, checked 2026-10-13; recheck
  against Apple's docs before relying on them):
  - On iPhone, push works only once the game is added to the home screen
    (iOS 16.4+).
  - Android and desktop browsers work directly. On desktop the browser has
    to be running, at least in the background.
- **Fixes after the first test (same day):**
  - The energy-full time comes from the player profile, which refreshes
    after every action.
  - Timed actions (build, queue, speed-up, research, expedition) refresh the
    notification timers at once.
  - A construction or research that a page marks as done also triggers the
    push, with the same once-only key as the minute scan.
  - The service worker is re-registered on every load, so updates reach
    browsers.
  - Logging out removes this device's subscription. An expired session drops
    it on the next visit, so the next person on that browser doesn't get the
    previous account's notifications.
- **Devices vs kinds (owner decision):** the kinds a player picks apply to
  every device: browser, and later the app. There are no per-device kinds.
  Each device only has its own on/off (OS or browser permission).
- **Mobile app later (owner decision):** while the player is active on one
  device, the others stay silent, so nothing arrives twice.
- **Invitation card (owner decision, same day):** the Command Center shows
  a "Turn on notifications" card while notifications are off on this device.
  It is not shown when they are blocked or unsupported. "Turn on" opens the
  browser's permission prompt, same as Settings; "Not now" hides it for 7
  days. A once-per-moment prompt (first build, empty energy) was considered
  and judged overkill.
- **No inactivity cut-off (owner decision):** notifications keep going until
  the player turns them off, logs out or clears the browser. Timers notify
  only once each, so in practice only PvP attacks keep coming.
- **Texts:** push texts are rendered on the server
  (`apps/api/src/notifications/push-texts.ts`, bg/en) and kept generic,
  because the server has translation keys, not translated names. In-game
  notices include building, research and expedition names.

## Settings as cards (2026-10-13)

Settings is a grid of equal cards, each with a title and a one-line status
and no icons (owner decision):
- avatar and frame;
- language;
- password;
- notifications;
- contact the team (with a dot for a new reply);
- blocked players;
- account deletion (red).

A click opens the section in a popup, as the Command Center tiles do. The
old two-column layout looked uneven because the sections differed so much in
height. `#support` in the URL opens "Contact the team" directly.

## Godmaster: set a player's password (2026-10-13)

Until email-based password reset exists, an ADMIN can set a player's
password by hand in the godmaster player view. The password is typed by the
admin, not generated (owner decision). It needs at least 8 characters, like
registration. Moderators can't do it. The action log records
`SET_PLAYER_PASSWORD` with who and when, never the password. Existing
sessions on other devices are not logged out (not requested).

## Email: password reset and confirmation (2026-10-13)

Sent through Brevo (see `instructions/OPERATIONS.md`) from
`Pentilius <no-reply@pentilius.com>`.

- **Confirming the email is optional (owner decision):**
  - The player plays right away after registering; registration sends the
    confirmation email, and a failed send never blocks it.
  - The Command Center shows a "Confirm your email" card until it's done,
    like the notifications card, with "Send again" and "Not now". "Not now"
    hides it for 7 days.
  - The link is valid for 3 days.
- **Forgot password** is on the login page and works whether or not the
  email is confirmed (owner decision).
  - The link is valid for 1 hour and works once; a new request replaces the
    older link.
  - A successful reset also marks the email as confirmed, since the link
    proves ownership.
  - The answer is always the same, so it never reveals whether an email is
    registered.
- **Security:**
  - tokens are 32 random bytes, stored only as a SHA-256 hash, single-use and
    time-limited;
  - at most 3 emails of one kind per player per hour (`GAME_BALANCE.email`);
  - tokens are deleted with the account.
- **Texts:** bg/en email texts are rendered on the server
  (`apps/api/src/email/email-templates.ts`), in the language of the page the
  player used.
- **Mobile app check:** the links open web pages, which also work for app
  users. Deep links into the app can come later.

## What players see during an update (2026-10-13)

During a deploy the old version keeps running while the new one builds. The
only gap is the few seconds while the api/web containers restart.

- **Caddy** (`deploy/Caddyfile`, `deploy/maintenance/`) handles that gap:
  - **Pages** get a friendly "we're updating" page in the URL's language
    (`/en/...` gives English, everything else Bulgarian). The owner wrote the
    Bulgarian text. The page checks every 5 s and reloads by itself.
  - **API calls** get JSON `{"statusCode":503,"message":"MAINTENANCE"}` with
    `Retry-After: 15`. This is the same machine-readable answer the future
    mobile app will use.
  - **Old script chunks** (`/_next/*`) get a plain 503.
- **Inside the game:**
  - A lost connection (no answer, 502-504 or MAINTENANCE) shows a small
    "reconnecting" banner instead of error messages.
  - The banner polls `GET /api/v1/health`; when the server answers, every
    page refreshes via `useRefresh`. No reload, nothing lost.
  - Fixed along the way: a failed token refresh during a restart used to log
    the player out. Now only a real refusal (4xx) does.
- **Mobile app later:**
  - The app reads the same `MAINTENANCE` answer and `/health`.
  - The app must stay backward compatible with older installed versions. A
    "minimum supported app version" check can force an update when unavoidable.

## Energy packs at the attack buttons (2026-10-14)

When energy isn't enough for an action, the owned energy packs appear right
under the disabled attack button (`EnergyRefill`), like construction speed-ups
in the Base. Each pack shows its gain and how many you own. One click uses it;
the button becomes active again. With no packs, it shows when the next point
regenerates.

- **Where:** Pentili in the zone and on the planet, PvP, the Core, clan war.
  Boss formations cost no energy.
- **"Use and attack" in one click was rejected (owner decision):**
  - a pack is worth 5-10 attacks, so it saves only one click;
  - a failed attack (expedition, cooldown, opponent gone) would waste the pack
    unless every attack type checked everything first.
- **Overflow:** packs only appear when energy is (nearly) empty, so no energy
  is lost and no confirmation is needed.
- **Data:** the inventory DTO carries `energyGain` from the item's
  `baseStats.energy`, so the client never hard-codes pack sizes.

## Base buildings and research: agreed plan (2026-10-14, built the same day)

**Review of what exists:** all 7 base buildings and the 4 researches are kept
as ideas. The researches cover only attack and HP of the robot's stats; that
is accepted for now.

**Rule of thumb:**
- **Building:** something physical in the base that gives capacity, slots or
  a new action.
- **Research:** a permanent percentage bonus or a rule improvement.

**New buildings:**
- **Research Center.**
  - Its level caps every research's level, including the existing 4.
  - Its first (low) levels unlock the longer expeditions. They are meant to be
    easy to reach.
- **Exchange.**
  - Metal ↔ Crystal only.
  - Each exchange costs a small amount of Credits, proportional to the amount
    exchanged.
  - Never Credits → resources: that would be pay-to-win (owner decision).
- **Reactor.**
  - +1 max Action Energy at certain levels.
  - A small percentage of faster energy regeneration per level.
  - It stacks with VIP. It is available to everyone, so it counts as
    progression, not pay-to-win.

**New researches:**
- **Construction technologies:** less construction time.
- **Research methods:** less research time.
- **Navigation:** more expedition rewards.
- **Metallurgy:** fewer stones for item upgrades.
- **Recycling:** more resources from recycling, plus one extra *fragment* at
  every 5th level (recycling yields fragments).

**Dropped:**
- the Hangar (too few expedition types; the Research Center unlocks longer
  expeditions instead);
- the old "buildings consume Power" concept, replaced by the Reactor as a
  bonus building.

**Later or maybe:**
- Workshop, only if crafting ever comes;
- Defensive systems and Maneuverability researches.

**Levels and display:**
- All base buildings and researches, old and new, go up to level 30. Costs,
  times and effects are placeholders until one overall balancing pass once
  everything exists.
- In the UI: current and next level as now, a short list of "special levels"
  with a ✓ when reached (e.g. Reactor +1 max energy, the Recycling fragment).
  There is no full table of all levels (owner decision): what higher levels
  give stays a bit of a discovery.

### How it was built (2026-10-14)

All numbers below are placeholders for the later balancing pass.

- **Levels to 30:** a milder placeholder curve continues each building from
  its last defined level (×1.25 cost, ×1.12 time and production per level).
  Researches go ×1.3 cost and ×1.15 time per level.
- **Research Center** (`researchCapPerLevel` 1):
  - research level ≤ Research Center level;
  - the 5 h expedition needs level 1 and the 10 h expedition level 2
    (`ExpeditionType.requiredResearchCenterLevel`).
- **Exchange:**
  - Metal ↔ Crystal with 1 crystal = 2 metal at par;
  - rate factor 0.7 + 0.01 per level (max 1);
  - fee 1 Credit per 100 exchanged, rounded up;
  - daily limit 5,000 × level of input amount, counted per day in
    Europe/Sofia;
  - what a higher level gives (limit + rate) was my recommendation, applied
    while the owner was away.
- **Reactor:** 1% faster regeneration per level (`Player.energyRegenBonus`)
  and +1 max energy every 10 levels (`actionEnergyMax`). It applies as soon
  as the level finishes: finished constructions are now also finalized on
  profile load (`base/building-finalizer.ts`).
- **New researches:**

  | Research | Effect per level |
  |---|---|
  | Construction | −1% build time |
  | Methods | −1% research time |
  | Navigation | +2% expedition resources |
  | Metallurgy | −1% upgrade stones, minimum 1 |
  | Recycling | +2% sell resources, +1 fragment every 5 levels |

- **UI:** a "Special levels" list (Reactor energy, Research Center unlocks,
  the Recycling fragment) with a ✓ when reached; the Exchange form in its
  building sheet; "Requires Research Center level X" on research and
  expedition cards.

## Base balance for buildings and research (2026-10-14)

The owner asked for a first, basic balance of the base buildings and the
researches and approved the plan ("давай"). Clan buildings, Pentili, XP and
rewards were not touched. All numbers are still placeholders, but they now
follow one model instead of separate guesses.

**Assumption:** a season of about 6 months, with level 30 as a late-season
goal rather than something reached in the first weeks.

**One model for everything** (`prisma/seed.ts`):
- **Production:** 100 Metal/h × L × 1.08^(L−1) for the Metal Mine, 60 Crystal/h
  for the Crystal Extractor (L1 100, L10 ~2,000, L20 ~8,600, L30 ~28,000
  Metal/h). The growth factor is `GAME_BALANCE.buildingEffects.amountGrowth`.
- **Cost:** a "value" of L/2 hours of a level-L Metal Mine, times a factor per
  building. Each level costs ~×1.2 more while production grows ~×1.12, so late
  levels take more than a day of income. Factors:

  | Building | Metal | Crystal | Time |
  |---|---|---|---|
  | Metal Mine | — | 1 | 1 |
  | Crystal Extractor | 1.6 | — | 1 |
  | Warehouse, Trading Post | 0.6 | 0.25 | 0.8 |
  | Defense System, Wall, Hideout, Exchange | 0.8 | 0.35 | 1 |
  | Research Center | 1 | 0.5 | 1.2 |
  | Reactor | 1.2 | 0.6 | 1.2 |

- **Time:** 60 s × L^2.2 × the factor: 1 min at L1, ~35 min at L5, ~2.5 h at
  L10, ~12 h at L20, ~30 h at L30.
- **Researches:** value × 1.5 Metal, × 0.6 Crystal, × 0.03 Credits; time
  2 min × L^2.1 (~4 h at L10, ~42 h at L30).
- The seed now updates existing cost rows (`update: cost`, not `{}`), so a
  re-run applies a rebalance.

**Effects:**

| Building / research | Before | Now |
|---|---|---|
| Warehouse | +3 slots/level | +2 slots/level (+60 at L30) |
| Trading Post | +1 listing/level | +1 listing every 2 levels, rounded up (L1 = 1, L30 = 15) |
| Defense System | +1%/level | +0.5%/level (+15% at L30) |
| Defensive Wall | +5 min/level | +2 min/level (10 → 70 min at L30) |
| Hideout | 500 / 200 / 100 per level | ~3 h of that level's Metal and Crystal production (300 / 180 × L × 1.08^(L−1)); Credits stay 100 × L |
| Exchange daily limit | 5,000 × L | ~10 h of Metal production (1,000 × L × 1.08^(L−1)) |
| Metal / Crystal research | +5%/level | +2%/level (+60% at L30) |
| Weapon Systems / Hull | +5%/level | +1%/level (+30% at L30) |

The Research Center, Reactor and the 5 new researches keep their effects;
only their costs and times changed.

**How it was built:**
- `src/base/building-effects.ts` holds the non-linear effects
  (`productionScaled`, `marketSlots`, `hideoutProtection`). The Base screen,
  PvP theft (`player/base-defense.ts`) and the Market all use it, so the
  number shown is the number applied.
- `BuildingType.marketSlotBonusPerLevel` became a Float (migration
  `trading_post_fractional_slots`).
- Production deploy needs `prisma migrate deploy` **and** a seed re-run.

## Research opens from the Research Center (2026-10-14)

Owner decision: research is opened from the Research Center, not from the
menu.
- The "Research" menu item was removed (`nav-items.ts`). The Command Center's
  Quick Access tile stays, for players who use research often.
- The Research Center's sheet in the Base shows the running research with a
  countdown and a "Research" button that opens the research page.
- The Research Center tile shows a green progress bar while something is
  researched (and the usual construction bar while the building itself is
  being upgraded). `BaseResponseDto.activeResearch` carries it.
- The `/research` page keeps its own address, so the "research finished"
  notification still links straight to it, and the future mobile app can
  have the same screen. The API did not change otherwise.

## Longer expeditions unlock with Navigation (2026-10-14)

Owner decision: the longer expeditions now unlock with the **Navigation**
research instead of the Research Center, so everything about expeditions sits
in one place. Navigation unlocks them and also adds its +% to expedition
resources. The Research Center keeps one role: the research level cap.
- Navigation's special levels:
  - level 1 unlocks the 5 h expedition;
  - level 2 unlocks the 10 h expedition.
- Still easy at the start: Navigation 1 costs ~75 Metal and 2 minutes, but it
  needs Research Center level 1 first.
- `ExpeditionType.requiredResearchCenterLevel` was renamed to
  `requiredNavigationLevel` (migration `expedition_unlock_by_navigation`, a
  rename, so the values stay). The error code is `NAVIGATION_LEVEL_REQUIRED`.
- A Navigation level whose time is up counts at once, even before the
  research screen finalizes it.

## Progress bars on Command Center timers (2026-10-14)

Owner decision: timers in the Command Center's "Active operations" get a
progress bar, like the Base tiles.
- With a bar: construction, research (green, as on the Base), expedition, the
  open Core window, the active Tavern, clan war, open boss formation.
- Without a bar: "Core opens in…" and "season reset in…", since they have no
  start.
- Exact start times are now stored: `PlayerBuilding.constructionStartedAt`
  and `PlayerResearch.researchStartedAt` (migration `timer_started_at`).
  Timers started before that are estimated from the level's time. A
  speed-up moves the end, so the bar jumps forward, which is correct.
- The Tavern's start is its end minus one activation
  (`CoreTavernStatusDto.activeSince`).
- Using speed-ups from the Command Center was discussed and left out for now
  (owner, 2026-10-14).
- Shared helper: `apps/web/src/lib/timer-progress.ts`.

## Clan buildings: base balance and the Generator (2026-10-14)

Owner decisions after reviewing the clan buildings:

| Shown as | Key | Effect | Levels |
|---|---|---|---|
| Member Hall | `member_hall` | 10 places + 2 per level (unchanged) | 10 |
| Forge | `clan_forge` | +1% attack and defense per level (was +5%) | 30 (was 10) |
| Refinery | `clan_depot` | +1% Metal and Crystal production per level (was +5%) | 30 (was 10) |
| Generator (new) | `clan_generator` | +0.5% faster energy regeneration per level; +1 max energy at levels 15 and 30 | 30 |
| Cantina | `clan_tavern` | unchanged effect | no designed cap |

- **Why the cut:** +5% per level made the clan buildings stronger than the
  personal researches (now +1–2% per level).
- **Names:** the interface drops "Clan" from the names (the player is in the
  clan screen anyway); the keys keep `clan_` so the code still shows they are
  clan buildings. The old Depot is now shown as Refinery and keeps its level
  and image.
- **Generator:** half the personal Reactor. Bonuses add up against the base
  value (Reactor 20% + Generator 10% = 30% faster than base), not one on top
  of the other. Max energy also adds up (10 + Reactor + Generator).
  `building-finalizer.ts`'s `refreshEnergyBonuses` recomputes both on every
  profile load, so joining or leaving a clan and a finished Generator level
  apply on the player's next action. New enum value
  `ClanBuildingBonusType.ENERGY_REGEN` (migration `clan_generator`); the
  max-energy levels are `GAME_BALANCE.clanGenerator.maxEnergyLevels`.
- **Costs:** the personal model × 10 (`CLAN_COST_FACTOR` in `seed.ts`), since
  the whole clan pays. The Member Hall's 10 levels each cost like 3 levels of
  the others. The Cantina uses the same model × 0.8, time capped at 7 days.
- **Cantina activation:** was 150 Metal + 60 Crystal × level per 12 h, far
  too cheap in the new economy. Now it grows like production:
  3,000 Metal / 1,200 Crystal / 50 Credits × level × 1.08^(level−1) per
  activation (`GAME_BALANCE.clanTavern`, `clan-tavern.ts`). Keeping it always
  on costs a 20-member clan ~12% of its Metal income at any level, so
  activating stays a decision before the Core or a boss.
- **Dropped for now:** a HQ capping building levels, a clan doctrine, Barracks,
  splitting the Refinery into Metal and Crystal buildings.

## Daily-task streak and claim buttons (2026-10-14)

Owner decisions:
- **Streak:** finishing every daily task on 7 days gives a large energy pack
  (first planned as a small construction kit, changed the same day), claimed by hand. Up to 2 days may be skipped along the way; a third
  skip starts the series over. After the claim the series starts from 0.
  The reward may be replaced later. Values: `GAME_BALANCE.dailyTasks.streak`.
- **Why 7 + 2 skips:** the players are busy; one bad day shouldn't erase a
  week, but the reward still needs steady play.
- **Display:** a row below the all-tasks bonus with dots — full dots for
  completed days (7) and for skips still available (2) — and the reward icon
  (in full colour, normal text colour), then a Claim button once earned. A note says when a series started
  over. The Command Center's green dot also covers a waiting streak reward.
- **Light on the server:** the streak is updated only when an action just
  finished a task and the whole day became complete (a few times a day), and
  kept as 4 fields on `Player` (migration `daily_streak`). Skipped days are
  counted from the last completed day when shown, so nothing runs at
  midnight. While the reward waits, the series is frozen.
- **Claim buttons:** a task shows its progress bar until done, then a green
  Claim button in the bar's place (same height, so the list doesn't jump),
  then "✓ Claimed". No disabled button before a task is done. Same for the
  all-tasks bonus, which also got a progress bar (tasks done / all tasks) and
  its picture on the right.
- **Style:** no bright green buttons. A done-but-unclaimed row stands out
  with the accent border and background; Claim uses the normal game button;
  a claimed row fades back. The weekly reward has its own "Weekly reward"
  heading below the daily ones.
- **Order and claimed items (both the daily missions and the achievements):**
  rewards ready to claim first, then those in progress; claimed ones leave
  the list and fold into a "Claimed (N)" line at the bottom that opens on
  tap. Both say "✓ Claimed". The daily and weekly rewards keep their own
  sections and never move. When every mission is claimed, the list says
  "Congratulations, all your missions for today are done!".
- **Level reward bar:** shows the XP toward the next level as a percent
  (`LevelRewardDto.xpPercent`), instead of "level 22/23". No full numbers —
  they grow large and would squeeze the bar. Level rewards are claimed in
  order, so an unreached one is always the next level.
- **All achievements done:** "Congratulations, you finished every achievement
  this season!" in a highlighted box; claimed rows show their reward in both
  panels.

## VIP names in gold (2026-10-14)

Owner decision: a VIP player's name is shown in the energy bar's gold
(`vipGold`, #c5a873) wherever it matters, and the VIP-only buttons (Attack ×3,
build queue) use the same gold. The old pale `vip` colour stays only in
godmaster, which was deliberately not touched.
- **Where:** the player list, a player's profile, clan members (own and other
  clans), the clan list's leader, the Market seller, the Core player
  rankings, the PvP opponent, clan-war targets, boss formations (creator and
  slots), the player's own name in the top bar, plus the clan chat and
  friends, which already had it.
- **Left out on purpose:** PvP and clan-war battle reports, the general
  battle report, clan-war contributions, friend requests — history or rarely
  viewed, and VIP status changes over time.
- Each of those responses gained an `isVip`-style flag (current status),
  coloured in one place (`PlayerLink`'s `isVip`), so the mobile app gets the
  same data. No database change.

## VIP: +3 max energy (2026-10-14)

Owner decision: VIP gives +3 max Action Energy (`GAME_BALANCE.vip.maxEnergyBonus`).
I raised the Core/pay-to-win angle and recommended +3 over +5; the owner's
view: it is more room between sessions, not faster regeneration, so it gives
no edge over a more active player. It adds to the Reactor and the clan
Generator (base 10 → 13; with Reactor 30 and Generator 30, 15 → 18) and is
recomputed with them (`refreshEnergyBonuses`), so it starts and ends on the
player's next action after VIP is granted or expires.
- **VIP in Settings:** a "VIP" card first in Settings shows the time left
  (live countdown, in gold) or "You don't have VIP right now"; its popup
  repeats it with the end date and lists the perks (Attack ×N, build queue,
  +max energy, automatic daily-mission rewards, gold name). The numbers come
  from the profile (`vipMultiAttackCount`, `vipMaxEnergyBonus`), not
  hard-coded text. No purchase button — VIP is only granted from godmaster
  for now.

## Login: email or username, any letter case, failed-attempt limit (2026-10-14)

Owner decisions:
- **One login field** for email or username (usernames can't contain "@").
  Both match without regard to upper/lower case — a player who registered
  with a capital letter couldn't log in before. If two accounts ever differ
  only by case, the exact spelling is needed. Registration refuses an email
  that differs from an existing one only by case. Older clients sending
  `email` still work. Password reset stays by email.
- **Failed-login limit** (there was none — checked the code, packages and
  Caddy): 10 wrong attempts per account or per address within 15 minutes
  block further tries until the window ends (`GAME_BALANCE.loginLimits`,
  `auth/login-limiter.ts`, kept in memory). A correct login clears the
  account's counter. The API now trusts one proxy hop (`trust proxy`), so it
  sees the player's real address behind Caddy, not Caddy's.
- **Godmaster's login** had no limit either (it had its own accounts, its own
  session key, deactivation and session revocation, but nothing against
  guessing). It now has the same limit, stricter: 5 wrong attempts per
  account or address in 15 minutes (`loginLimits.adminMaxFailures`),
  counted separately from player logins.

## Public contact email (2026-10-15)

Owner decision: the public pages (About, Rules, Privacy, Support, Delete
account) show **contact@optiscalesolutions.com** instead of
support@pentilius.com, which has no mailbox yet. One setting
(`apps/web/src/lib/legal.ts`'s `LEGAL.email`) feeds every page, in both
languages. The Web Push contact (`VAPID_SUBJECT`) is technical, not shown to
players, and was left as it is.

## Payments foundation: Stripe on the web (2026-10-15, test mode)

Built after the owner approved the plan (see `instructions/OPEN_DECISIONS.md`,
Payments). Phase 1: Stripe Checkout (hosted page), one-time payments, web
only, Bulgaria only.
- **Server** (`apps/api/src/payments/`): our own product catalog
  (`PaymentProduct`, seeded: `credits_500`, `vip_month`), a purchases ledger
  (`Purchase`, unique per provider + provider reference), `StripeProvider` as
  the only Stripe-specific code. Endpoints: `GET /payments/products`,
  `POST /payments/checkout`, `GET /payments/checkout/:sessionId`,
  `GET /payments/purchases`, `POST /payments/stripe/webhook` (signature
  checked against the raw body).
- **Granting:** only on Stripe's confirmation (`checkout.session.completed`
  when paid, or `async_payment_succeeded`), exactly once — a conditional
  status change, so repeated notifications do nothing (tested by resending an
  event). Expired/failed sessions become CANCELED. A full refund
  (`charge.refunded`) takes the purchase back: VIP is shortened, Credits are
  taken back down to 0 (the rule for spent Credits is still open).
- **Country:** `geoip-lite` (offline) decides from the IP; only
  `PAYMENTS_ALLOWED_COUNTRIES` (default BG). Local development has no country
  and is allowed only with `PAYMENTS_ALLOW_UNKNOWN_COUNTRY=true`. The card's
  country is stored as a second check and logged if it's outside the list.
  `/player/me` returns `paymentsAvailable` for the UI.
- **Environment:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICES` ("productKey=price_…", since test and live IDs differ).
  A product is offered only when it's mapped. Keys never in git (local copy:
  `secrets/stripe-test-key.txt`).
- **Web:** Shop tabs Items / Credits / VIP (the last two only where payments
  are offered), "processing… / done / canceled" after returning from Stripe,
  "+" next to Credits in the top bar, "Buy VIP" in Settings' VIP card, a "My
  purchases" card in Settings.
- **Local testing:** Stripe CLI (installed with winget) forwards webhooks:
  `stripe listen --api-key <test key> --forward-to localhost:3001/api/v1/payments/stripe/webhook`.
  Not deployed to production yet: it needs the env vars there and a webhook
  endpoint registered in the Stripe dashboard.

## Payments in godmaster, offers at the top of the Shop (2026-10-17)

Owner decisions:
- **Offers at the top of the Shop, not tabs** (tabs hide them — most games
  show them first): a "Special offers" block above the items with the VIP card
  (gold) and the Credits packs in one row that scrolls sideways on phones,
  clearly marked as a card payment. The "+" next to Credits and "Buy VIP" in
  Settings lead to it (`/shop#offers`). Visible but not pushy — no fake
  urgency (players can be 13+).
- **Shown only when payments are really on:** a Stripe key is set on the
  server **and** the player's country is allowed **and** at least one product
  has a Stripe price. Otherwise the Shop looks as before and there is no "+".
- **godmaster → Payments** (ADMIN only, logged):
  - settings: the allowed countries (moved from the environment into
    `GameSettings.paymentsAllowedCountries`), and whether Stripe is connected;
  - products: Bulgarian/English names, Credits or VIP days, the Stripe price
    ID — the amount is **read from Stripe** on save (must exist, be one-time
    and active), never typed by hand; sort order, active. The kind can't
    change; a product with purchases is hidden, not deleted. Product names now
    live in the database instead of translation files. `STRIPE_PRICES` was
    removed — local and production databases hold their own test/live IDs;
    the seed only creates the first rows and never overwrites them;
  - purchases: search by player, status filter, "for review" (card from
    outside the allowed countries), totals for today and this month, and
    "Refund" — refunds through Stripe and takes the purchase back at once
    (Stripe's own notice afterwards changes nothing).
- **A purchase keeps what it granted** (`Purchase.credits` / `vipDays`), so a
  refund takes back exactly that even if the product changes later.
- Tested locally against Stripe test mode: checkout, grant, repeated notice,
  refund from godmaster.

## Payment products created from godmaster, names from templates (2026-10-18)

Owner decisions, built the same day:
- **godmaster creates and updates the Stripe side:** "New product" with kind,
  amount and price in euro creates the Stripe product + price and links them.
  A new price creates a new Stripe price, makes it the default and archives
  the old one (Stripe prices can't be edited; past purchases keep what they
  paid; a checkout already open finishes at the old price). The Stripe
  product's name and on/off state follow godmaster (hidden = archived in
  Stripe). Linking an existing Stripe price by its ID is still possible under
  "More". New column `PaymentProduct.stripeProductId`; products linked by
  hand before this find their Stripe product on the next save.
- **Names from templates:** a product's name is built from its kind and
  amount — "VIP за {days} дни" / "{count} кредита" (`payments.productNames`
  in the message files, translated once per language). `nameBg`/`nameEn` are
  now optional custom names for special offers (English is the fallback).
  The Stripe product is named "Pentilius – <English name>", shown on Stripe's
  payment page.
- Tested in Stripe test mode: price change and back (old price archived),
  creating a product, hiding it (archived in Stripe). A hidden test product
  `credits_test_godmaster` stays in the local database and archived in the
  Stripe sandbox.

## Balance from godmaster: Pentili first (2026-10-18)

The owner reversed the old rule that balance lives only in code ("a bad
decision"). Balance is now edited in godmaster → Balance, starting with the
Pentili; building/research curves and single `GAME_BALANCE` values may follow.
- **Curves, not hand-typed tables:** stats (HP, attack, defense, XP) and
  rewards (Metal, Crystal, Credits) all follow value = base × level^growth ×
  zone strength × Pentili strength. Each curve shows its values at levels
  1/20/50/100 while editing.
- **Per zone:** start level and level step (the 10 Pentili sit at start +
  place × step), strength, which equipment set drops, and the chances for an
  equipment part (per slot), a fragment, an upgrade stone, an energy pack.
- **Per Pentili, only:** an optional fixed level, a strength multiplier
  (rewards follow it — a stronger Pentili gives more), and an optional special
  drop. The first 8 Pentili lost their hand-written loot tables — every
  Pentili follows the same rules now (owner's call).
- **Rewards now grow with the Pentili's level.** They used to be tiny fixed
  ranges per zone (5–90 Metal), far below the new economy. Defaults (first
  pass): Metal 20 × L^1.3, Crystal 12 × L^1.3 (both ±25%). No Credits from
  Pentili (owner decision, 2026-10-19 — removed from the curves). Zone 1 drops equipment parts at 5% per slot (others 2%) so a
  new player gears up. The stat defaults reproduce the previous stats exactly.
- **Preview / save:** "Preview" recomputes the table without saving; "Save and
  apply" stores the config (`BalanceConfig` "pentili") and regenerates every
  Pentili's level, stats, XP and loot (rows updated in place, battle reports
  unaffected). Ranges are checked (no zero HP, chances 0–100%). ADMIN only;
  each save is logged with before/after.
- **Seed:** creates missing Pentili and the default config only if none is
  saved, then generates — it never overwrites what godmaster saved. The
  generator lives in `src/config/pentili-balance.ts` because the production
  image ships that folder for the seed.
- **godmaster tables (2026-10-19):** the Balance and Payments tables have lines
  between the columns and short headings; the explanations moved into a note
  above each table. "Strength ×" on a zone multiplies every Pentili in it
  (stats and rewards); on a Pentili it multiplies with the zone's.

## Balance from godmaster: XP per level (2026-10-19)

Owner decision, next to the Pentili because together they set the levelling
pace.
- **Curve:** XP to the next level = base × level^growth, with optional fixed
  values per level. Defaults reproduce the old thresholds exactly (levels
  1–14 fixed as they were, 30.0017 × L^2.126 from 15); the first save changed
  0 of 99 levels.
- **Pace preview:** for every level, the number of Pentili fights against the
  best-paying Pentili available at that level, the running total, and the
  energy time for them (15 min per point); plus a short summary for levels
  5…100. Only Pentili are counted — daily missions, expeditions and bosses
  come on top. With today's numbers, level 100 takes ~9 300 Pentili fights
  (~97 days of energy alone).
- **Save:** stores `BalanceConfig` "xp" and rewrites `LevelThreshold`.
  Players keep their level and XP; a lower threshold just levels them up on
  their next XP gain. Ranges checked; ADMIN only; logged with before/after
  (`UPDATE_XP_BALANCE`). The seed never overwrites a saved curve.
- **One curve, no per-level values (same day, owner):** the per-level "fixed"
  fields were removed — like the Pentili, you set the curve and read the
  table. The new default is 15 × L^2.28, keeping the start light (level 5:
  588 XP, level 10: 2 858, level 14: 6 155) with about the same top (level 99:
  532 279). It replaces the old hand-picked levels 1–14 + 30.0017 × L^2.126;
  players keep their level and XP. If a faster start is ever wanted, add one
  "first N levels × factor" setting instead of per-level values. On
  production the seed applies this default on the next deploy (no saved
  curve there yet).

## Balance from godmaster: buildings and research (2026-10-19)

Owner decision, after the Pentili and the XP curve. godmaster → Balance →
Buildings & research edits the model of the 2026-10-14 base balance instead
of the seed:
- **General:** mine production per hour at level 1 (Metal 100, Crystal 60) and
  its growth per level (1.08); "hours of production" a level costs (0.5 × L);
  build time base and growth (60 s × L^2.2).
- **Per building:** Metal/Crystal/time factors, max level, and its effects per
  level (Warehouse slots, Trading Post listings, Defense System %, Wall
  minutes, Hideout amounts, Research Center cap, Exchange limit, Reactor
  regen % and "+1 max energy every N levels"). The mines show production.
- **Research:** Metal/Crystal/Credits factors, time base and growth; per
  research its bonus per level and max level.
- **Preview** of every level of the selected building or research, current
  values in brackets. "Save and apply" rewrites the building/research types
  and their level rows. Rows above a lowered max level are kept (players may
  be there) but can't be built.
- **Production growth at runtime:** the Hideout's amounts, the Exchange's
  daily limit and the Cantina's activation cost follow the mines' growth; the
  API now loads it from the saved balance at start and on every save
  (`setProductionGrowth` in `base/building-effects.ts`).
- Defaults reproduce the previous values exactly (0 differences across 300
  building rows, 270 research rows and all effects). ADMIN only, logged
  (`UPDATE_BUILDING_BALANCE`); the seed never overwrites a saved balance.
  Clan building costs still come from the seed's own copy of the model — a
  later step.

## Credits can't be stolen; Buildings and Research split in godmaster (2026-10-19)

- **Credits are never stolen** (owner decision): PvP and clan-war duels now
  take only Metal and Crystal. Credits can be bought for real money, so losing
  them to another player would be unfair (and a likely complaint). The
  Hideout's "protected Credits" part was removed — it had nothing left to
  guard; the Base shows only Metal and Crystal as safe. Not changed yet: when
  a clan war ends, the winner still takes a share of the loser's **treasury**
  (including Credits) — to be decided separately.
- **godmaster → Balance:** "Buildings" and "Research" are separate buttons
  (owner). They share one saved balance, so switching keeps unsaved edits and
  "Save" stores both; the Research page notes that its costs follow the mine
  production set under Buildings.

## One rounding rule and one number format (2026-10-19)

Owner decision — no mixed mechanics:
- **Costs round to 3 significant digits** at every size (75, 8 230, 11 200,
  419 000, 4 190 000) for buildings, research and clan buildings. It replaces
  "tens below 10 000, hundreds above", which looked inconsistent. Round prices
  are easier for players to read and compare. Values under 100 000 barely
  change; larger ones get rounder (e.g. Metal Mine level 30: 419 300 →
  419 000). `niceRound` in `src/config/building-balance.ts` (the seed uses the
  same one).
- **Numbers are formatted the same everywhere:** a space between thousands
  from 4 digits up ("8 230"), in every language (`lib/format-number.ts`;
  godmaster keeps its own copy). The default Bulgarian format grouped only
  from 5 digits. Costs, rewards, production, Pentili/boss stats and
  treasuries that had no formatting at all now use it too.

## Balance from godmaster: clan buildings; the Cantina capped at 30 (2026-10-19)

- **godmaster → Balance → Clan buildings** (owner decision), the same way as
  the personal buildings: Preview (nothing saved) and Save and apply, ADMIN
  only, logged with before/after. Editable:
  - the clan cost factor against the personal model (×10, since the whole
    clan pays), Crystal ×, Credits ×, build time base and growth;
  - all 5 buildings in one table, the same columns for each: bonus per level,
    max level, the "step" (the Member Hall's 10 levels each cost like 3
    levels of the others) and "cost ×" against the others (1; the Cantina 0.8,
    since it's only active part of the time);
  - separate cards for what only one building has: the Cantina's activation
    (hours and cost at level 1, growing with production) and the Generator's
    "+1 max energy" levels (15, 30).

  Defaults in `src/config/clan-balance.ts` reproduce the existing values
  exactly (checked: 0 differences in all 130 rows). Costs follow the mine
  production set under "Buildings", so saving that also recalculates the clan
  costs. The running game reads the activation and the Generator levels from
  the saved balance, so a change applies at once.
- **The Cantina is capped at level 30** like the other buildings (owner
  decision). It had no cap ("rising cost is the natural ceiling"); in practice
  rows stopped at level 85, where costs no longer fit the database. An
  endless boss/Core bonus favoured the richest clan in the race for the Core.
  The most a clan gets against the Core is now Forge +30% and Cantina +30%.
  Rows above a max level stay in the database but can't be built.

## Balance from godmaster: equipment sets (2026-10-19)

- **godmaster → Balance → Sets** (owner decision), Preview / Save and apply,
  ADMIN only, logged with before/after:
  - a table slots × sets with attack / defense / HP for all 21 items, with a
    total per set; a "multiply the set by…" helper fills the fields once (it's
    not a formula — the sets don't follow one ratio, 1 → 4 → 8 on the head,
    5 → 12 → 24 on the left arm);
  - per set: max upgrade (5 / 8 / 10) and the sell value (Metal, Crystal);
  - upgrades: bonus per level (+10%), stones per level (1 × N), fragments per
    stone (10); the sell multiplier for Normal / Rare / Epic (1 / 1.5 / 2).

  Defaults in `src/config/equipment-balance.ts` reproduce the existing items
  exactly (checked: 0 differences in all 34 item definitions). Items in
  players' hands read their definition, so a change applies at once to every
  owned item, equipped or listed; a lowered max upgrade leaves items above it
  as they are but stops further upgrades.
- **The preview** fights a reference robot against the first and last Pentil
  of each zone, 400 times with the real combat code: the robot at that
  Pentil's level, with the innate floor, the attribute points (split as chosen
  in the preview, equal by default, never saved) and the zone's set — without
  gear, at +0 and at max upgrade. Research (attack, HP) and Forge bonuses can
  be set in the preview too, with a "max" button (today 30% / 30% / 30%);
  Excellent options are left out. It also shows the stones to max and about how many
  fights that takes from that zone's Pentili (dropped stones, fragments, and
  recycling the dropped set items); bosses and the Shop give more.
- **First reading (to discuss, not changed):**
  - Without research and Forge, the robot beats the first Pentil of a zone
    only with the set maxed, and never the last one, whatever the split.
  - With all three at max (+30% each) and points mostly in attack, the set
    at +0 wins most fights; the set maxed wins nearly all, except the very
    last Pentil (level 96).
  - An equal split loses far more often than an attack-heavy one.

  So today's Pentili fit an end-game robot (full research and Forge) better
  than one in the middle of the season — for the balancing pass.

## Expeditions: rewards by level, no Credits, bonus from your zone's set (2026-10-19)

Owner decisions:
- **Rewards grow with the player's level.** They used to be fixed (the short
  one: 60 Metal, 20 Crystal, 10 Credits, 15 XP at any level), which was
  worthless after the first days. Now an expedition pays as much as N fights
  against a Pentil of the player's level: Metal, Crystal and XP from the
  Pentili curves (without the ± spread), plus the Navigation research for the
  resources.
  - Defaults: 3 / 12 / 22 fights for 1 h / 5 h / 10 h.
  - So the short one pays most per hour (3 against 4 fights an hour from
    energy) and the long one most in total (GAME_SYSTEMS.md).
  - Level 1 is close to the old amounts: the short one pays 60 Metal,
    36 Crystal and 24 XP.
  - The level when collecting counts, so the shown amounts are never more
    than what's received.
- **No Credits from expeditions** (they're the paid currency).
- **The bonus item** is a random item of the set of the player's highest
  unlocked zone (Pioneer early, Ascendant from zone 2, and so on). It used to
  be one fixed Ascendant item, even for a level-3 player. A full inventory
  still means no item, as before.
- **godmaster → Balance → Expeditions:** per expedition the duration, the
  fights, the bonus chance and the Navigation level needed, plus the
  early-cancel share (70%; the game's texts now show the real value). The
  preview shows the rewards at levels 1 to 100, and the fights per hour
  against energy.
- The reward columns on `ExpeditionType` now only keep the level-1 values
  for reference; `bonusItemDefinitionId` is no longer used.

## Balance from godmaster: bosses (2026-10-19)

- **godmaster → Balance → Bosses** (owner decision), Preview / Save and
  apply, ADMIN only, logged. Per boss:
  - minimum level, HP, attack, defense, XP (split between the filled slots);
  - the guaranteed box;
  - Metal and Crystal as "N fights against a Pentil of the boss's minimum
    level" — the Pentili reward curves with their ± spread;
  - Credits (chance, from–to);
  - any number of item rows (item, chance, from–to).

  Every rewarded participant rolls the loot separately, as before. Saving
  the Pentili balance also recalculates the bosses' Metal/Crystal.
- **Credits:** bosses give none (owner decision); the setting stays, with a
  default of 0.
- **The old loot rows were examples** (owner) and were replaced:
  - 12 fights' worth of Metal/Crystal (e.g. the first boss: 6 100–10 100
    Metal instead of 20–40);
  - 50% for 1–2 upgrade stones of the boss's zone set;
  - no Credits, no off-set items.

  Placeholder values; the stats and boxes are unchanged.
- **The preview** fights formations of 1 to 5 identical reference robots
  (the same robot as under Sets, at the boss's minimum level with its zone's
  set at +0 and max; points split, research, Forge and Cantina bonuses as
  chosen, never saved) — 400 real fights each.
  - First reading: without bonuses 5 robots always win, 4 only with the set
    maxed, 3 or fewer never — matching the intended "5 win, 4 close, 3
    lose".
  - With all bonuses at max, 3 robots always win.

## Balance from godmaster: other values (2026-10-19)

- **godmaster → Balance → Other values** (owner decision): the single
  balance numbers of `GAME_BALANCE`, in groups with Bulgarian labels and
  hints: energy and inventory, combat, item quality and race lock,
  attribute points, recycling, boss formations, PvP, clan wars, the Core,
  the Exchange, VIP. 55 values in all.
  - ADMIN only, logged with before/after.
  - Out-of-range values are refused, and whole numbers are required where
    needed.
  - Gold marks a value that differs from the default; "↺" brings the default
    back.
- **How it works:** a saved value overrides the one in `game-config.ts` in
  place, at start-up and on save, so the game uses it at once without a
  restart. Only values that differ from the code are saved, so a later
  change of a default in the code still applies to the others. The list is
  `src/config/other-balance.ts`; only values read at the moment they're used
  are in it. `robot.service.ts`'s evasion cap was a start-up constant and is
  now a function.
- **Not on this page:**
  - the technical limits (logins, e-mail, chat, presence, support, reports) —
    they go to godmaster's Settings next (owner decision);
  - the lists (daily tasks, achievements, level rewards) — they go to their
    own "Rewards" page under Balance (owner decision);
  - the Excellent option percentages (+2% damage…) — their texts have the
    number written in, so they come once the texts take it from the server;
  - the starting resources of a new account — they're database defaults, not
    read from the config.

## godmaster Settings: technical limits (2026-10-19)

- **godmaster → Settings → Technical** (owner decision), ADMIN only,
  logged: 24 values in groups — login limits, e-mail links, "Contact the
  team", reports, chat and online, the Core standings sizes. Works like
  Balance → Other values (same mechanism, saved under its own key).
- **Not included:** message lengths. The request checks and the game's input
  fields have them too, so changing them in one place would make the two
  disagree.
- Changing the login limit doesn't clear the attempts already counted; the
  counters live in memory until the window ends.

## Balance from godmaster: rewards (2026-10-19)

- **godmaster → Balance → Rewards** (owner decision), with three views:
  - **Daily tasks:** target and reward per level (Metal, Crystal, XP) and
    the energy of each task; the all-done bonus item; the streak (days,
    allowed misses, reward item).
  - **Achievements:** each tier's target, Metal, Crystal and item. The
    "full set" targets stay 7 slots.
  - **Level rewards:** Metal and Crystal × level, a box every N levels, and
    which box up to which level.

  Preview / Save and apply, ADMIN only, logged. "Save" stores all three.
- **Only changing what exists** (owner: "at this stage only change, we may
  think about more later, but let's not overdo it"). Adding or removing a
  task or achievement, or a tier, stays in code: their kinds are tied to the
  code, and removing one mid-day or after players claimed it would confuse
  their progress.
- **How it works:** the saved values replace the ones in `game-config.ts` in
  place (`src/config/reward-balance.ts`), at start-up and on save; the game
  sees them at once.
- **The preview** shows all daily tasks of a day and one level reward at
  levels 1/10/30/60/100, and how many Pentili fights of that level give the
  same Metal or XP. First reading at level 10: a full day of tasks is worth
  about 14.5 fights of Metal and 4.6 of XP, a level reward about 2.5 fights
  of Metal.

## Login records for security (2026-10-19)

Owner decision: record logins so staff can spot multi-accounts and ban
evasion. Until now the IP was only held in memory for minutes (the failed-
login limit).
- **What is kept:**
  - when, the IP, the country (from the IP), the device type and the
    browser;
  - on login, registration and session refresh. A refresh is recorded only
    from a new address or after 12 hours, so staying logged in doesn't fill
    the table.
  - Table `login_events`, `auth/login-events.service.ts`.
- **Kept 90 days**, then deleted automatically, every 6 hours. Both numbers
  are in godmaster → Settings → Technical.
- **godmaster → player → "Show logins":**
  - the last 50 records;
  - the other accounts seen from any of the same addresses, with which ones,
    a link to each, and whether one is banned.

  Staff only, loaded on request, and every look is written to the action log
  (`VIEW_PLAYER_LOGINS`).
- **A shared address is a hint, not a verdict:** homes, offices and mobile
  networks share them. No IP bans, nothing automatic.
- **Legal basis:** security (legitimate interest), no consent; the Privacy
  text must mention it and the 90 days. That's for the lawyer, see
  `OPEN_DECISIONS.md`.
- **Mobile app:** recorded on the server at login, so it works the same
  there.
- Separate from the planned acquisition analytics, which keep only the
  country.

## Clan treasury Credits are never taken in a clan war (2026-10-19)

Owner decision: when a clan war ends with a winner, the winner still takes a
share of the losing clan's treasury Metal and Crystal (15% by conquest, 5% by
decision), but never its Credits — the same rule as for players' own Credits,
since Credits can be bought for real money. The war history simply shows no
Credits line for new wars.

## Sale documents and the NRA audit file (2026-10-23)

Owner decisions, built the same day (Наредба Н-18 alternative regime for an
e-shop paid by card through Stripe — no fiscal device):
- **A document per direct sale** (чл. 52о), issued in the same transaction
  that completes the purchase: 10-digit number +1 per sale, no gaps, unique;
  seller (company: name, ЕИК, registered address, contact); order number = our
  purchase ID; transaction reference = Stripe's PaymentIntent ID (`pi_...`);
  item, tax group "А", quantity, unit price, amount, total, payment method; QR
  code per Приложение № 18а (`<e-shop no.>*<empty>*<order>*<transaction>*
  <date>*<time>*<total>`). Always in Bulgarian; amounts in euro.
- **A refund document** (own series) for every full refund, from godmaster, from
  Stripe or a lost dispute; it points at the sale and has no QR code.
- **Test payments** get test documents (own series, marked "ТЕСТ"), never in
  the audit file.
- **Documents are final:** a database trigger refuses any change or deletion
  (Приложение № 29, т. 2 — integrity). Each keeps a copy of the seller data
  from the moment it was issued.
- **Given only in the account**, no email (owner: that is "electronically"
  enough): right after paying in the Shop and in Settings → My purchases, as a
  printable page (browser "Save as PDF"). godmaster shows the same page
  ("изтегли").
- **Seller and NRA data** in godmaster → Payments → "Данни на продавача и НАП"
  (company only — the seller is an ЕООД). Live payments are refused until it
  is complete.
- **Audit file** (Приложение № 38) in godmaster: pick a month, generate,
  checked against the NRA's own XSD (embedded, `nra-audit-xsd.ts`), kept and
  downloaded; payment code 4 (payment service provider — owner's choice, Stripe
  charges the card and pays out later), with POS number, transaction and
  provider (ID + name, as the annex requires) filled in too; in UTF-8 (owner
  decision). A
  "Тестов XML" button builds the same file from test documents, not kept.
- **Credits on a refund** are taken back in full, even below 0.
- Managed Payments stays out until decided — Stripe's terms make it the
  merchant of record but not the seller (`Sold through Link, LLC` acts for the
  seller), so it's unclear whether those sales need our documents.

Open items are in `OPEN_DECISIONS.md` (Payments → Sale documents).

## Boss battles: cooldown clock, replay, early start, notification (2026-10-23 – 2026-10-27)

Owner decisions:
- **Formation cooldown on a fixed clock, in UTC.** Creating or joining a
  formation (one shared action across all bosses) is allowed again at the
  next reset, which happens at the same moment for every player: every N
  hours (N in 1/2/3/4/6/8/12/24, default 24) counted from a reset hour 0–23
  UTC (default 0). It replaced the rolling 24 h from the player's own last
  action. Both are in godmaster → Balance → Other values → "Формации срещу
  босове".
- **Boss battle report and replay** on the boss page ("Последни битки"): only
  formations the player fought in, from the last 24 hours; a summary (date,
  win/loss, how much of the boss's life was taken, own XP and loot) and a
  round-by-round replay like a Pentili battle — the formation picture
  (`bosses.formation.icon`) with one shared life bar against the boss, and
  the participants above it as the formation squares. Older fights stay in
  the battle reports (no replay link there for now). Nothing is deleted.
- **A full formation fights at once:** when the fifth place is filled, the
  battle is played right away instead of waiting out the enrollment window.
  The player who filled it watches the replay on the spot.
- **New notification "the boss battle is over"** (in-game, browser, Web
  Push; own switch in Settings, on by default) to every participant except
  the one who filled the formation; the push says win or loss, a click opens
  the replay. Formations whose time is up are fought within a minute by the
  existing once-a-minute server check (plus an index on status + end time),
  so the result exists even if nobody opens a page.
- **Command Center:** the boss timer disappears when it ends, like the other
  timers — no "Result" row.
- **The land's full Pentili list page was removed:** the map's land panel is
  the only place to pick and attack Pentili (its "Enter" button is gone); the
  land page only shows a fight; the boss page's "Back to the lands" opens the
  map on that land.

## Earnable Credits, Market sale fee, one clan building at a time (2026-10-27)

Owner decisions:
- **A little Credits from play** (Credits aren't sold yet and some Shop
  prices were set to 0 meanwhile): the all-daily-tasks bonus gives +3, the
  7-day streak +15, and the higher achievement tiers 10 / 20 (40 for the
  last Pentili tier) — about 650–750 a season for a very active player. No
  level gate for now. All amounts are in godmaster → Balance → Rewards.
- **Market sale fee:** 10% of a sale's Credits, taken from the seller and
  removed from the game (rounded up, at least 1). It is mainly a Credits sink
  and makes moving Credits between one's own accounts costlier. Listing stays
  free; a refundable listing deposit or listing expiry were discussed and left
  for later, if the Market clogs. The seller sees "you'll get X" while
  listing. godmaster → Balance → Other values → Market.
- **One clan building under construction at a time** (no queue), like the
  personal base. Starting a construction and paying from the treasury are
  now conditional writes under a lock on the clan, so two officers clicking
  at once can neither pay twice nor take the treasury below zero. At the
  default build times, maxing every clan building takes about 80 days in
  sequence (18 in parallel) — to keep in mind when the season length is set.

## godmaster boss preview: example participants and real players (2026-10-27)

Owner decisions, for calibrating the bosses (godmaster → Balance → Bosses):
- **Example participants:** each boss has its own example participant (level,
  parts of the zone set — the rest from the previous set at +0 — upgrade,
  point shares, research, Forge, Cantina), picked from a dropdown and fought
  1 to 5 times over. Below the table: the boss strength (HP, attack and
  defense scaled together) at which a chosen number of them wins a target
  share, with "apply" into the form, and what each player gets. Remembered in
  the browser only.
- **Test with real players** (collapsed box): a boss and up to 5 players by
  name; their real robots, read exactly as a boss fight reads them (the
  Cantina only if active), against the boss as it is in the form. Read-only.
- First calibration: three real players (levels 15–22, Pioneer +0…+5) beat
  the first boss about 84% of the time at 83% of its old strength
  (HP 1045, attack 247, defense 136), set by the owner for testing.

## Name and race change for Credits (2026-10-27)

Owner decisions (they replace the 2026-10-14 discussion where they differ):
- **Settings → "Name and race"**, both with a confirmation step. Seen only by
  staff; nothing is shown to other players.
- **Name:** 600 Credits; the same rules as registering (format, content filter,
  unique). Log in with the new name or the email — the old name no longer
  works. The old name stays reserved for 7 days: nobody else can take it (not
  by renaming, not by registering); its owner can.
- **Race:** 500 Credits. No other limits (an open boss formation, a clan war
  — allowed); a player in an open formation keeps their place there for that
  fight. Equipped items locked to another race are taken off and stay in the
  inventory; the confirmation warns about it. The free, required pick at the
  start of a season is unchanged and is not a change.
- **Waiting time** 7 days between two paid name changes and, separately,
  two paid race changes.
- All five numbers are in godmaster → Balance → Other values → "Смяна на име
  и раса".
- **History** (`PlayerIdentityChange`): who, when, from what to what, Credits
  paid; staff renames from godmaster are recorded too (free, no waiting time,
  marked as staff). Shown in the godmaster player lookup (an old name finds
  the player too) and as a list of all changes on the Players tab.
- The phone-app download card in Settings is hidden while the app isn't
  worked on; the download and the app itself keep working.

## Full-set bonus (2026-10-27)

Owner decisions:
- All 7 slots wearing a set **or a better one** give that set's bonus, so a
  stronger part never removes it; only the best full set counts.
- Separate % per stat (attack, defense, HP), added to the same sums as
  research and the Forge (no bonus on a bonus). Defaults: attack only —
  Pioneer 3%, Ascendant 5%, Coreforged 8%; defense and HP 0. Edited per set in
  godmaster → Balance → Sets. Applies in every fight (Pentili, PvP, bosses,
  the Core) and in the godmaster previews.
- Shown only on the Robot page, at the bottom of the attributes column: the
  active bonus, the next set with its progress (7 dots), and one line on the
  rule. A 0% stat isn't shown. Not in item tooltips, profiles or PvP scouting.

## Paid attribute points reset (2026-10-30)

Owner decisions:
- The free reset on the Robot page is gone, and there are no free resets any
  more. Players' data on the server isn't touched (the old counter stays,
  unused).
- A reset is bought in Settings → "Name, race and points": every spent
  point comes back to spend again on the Robot page. 300 Credits, at most
  once a day; both in godmaster → Balance → Other values → "Смяна на име,
  раса и точки". Confirmation required; nothing is charged if no points are
  spent.
- Recorded in the same history as name and race changes (ranks before and
  the points given back).
