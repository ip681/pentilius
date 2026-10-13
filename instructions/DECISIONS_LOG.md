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
