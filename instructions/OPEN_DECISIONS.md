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
- **Construction costs/times, building production rates** → one production-tied model in `seed.ts` (base balance, 2026-10-14; see `instructions/DECISIONS_LOG.md`). Not yet checked against real player income.
- **Research tree size/rate** → 9 technologies, cap level 30, production +2%/level, combat +1%/level (base balance, 2026-10-14) — placeholder numbers, not a final tree.
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
- Hideout protected amounts and Defense System / Defensive Wall / Hideout costs (base balance 2026-10-14 in `seed.ts`, still placeholders; the mechanics were decided 2026-10-12)

## Research
- Built 2026-10-14 (see `instructions/DECISIONS_LOG.md`):
  - the Research Center, Exchange and Reactor buildings;
  - five new researches;
  - level cap 30 for buildings and researches.
- Still open: all numbers (costs, times, effects) in one balancing pass once
  everything exists.

## Clans
- final role set, contribution rules, clan-war rules (see Milestone 1 placeholders above)
- clan building numbers and the Cantina's activation cost (base balance 2026-10-14, still placeholders)
- discussed and parked (2026-10-14): a clan doctrine (economy vs war focus), Barracks, splitting the Refinery per resource

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
Daily tasks are built (see `instructions/DECISIONS_LOG.md`, 2026-10-13).
Still open:
- reward values (`game-config.ts`'s `dailyTasks`) are placeholders, not balanced;
- managing the task list from godmaster (deferred — config-only for now);
- timed events with participation windows — not designed.

## Seasons/Core
The attacked-Core model was decided on 2026-10-12 (see `instructions/GAME_SYSTEMS.md`'s Core / Endgame section). Still open:
- the Core's lore now that it isn't human-built
- Core combat stats and round cap (placeholders: `game-config.ts`'s `core` block)
- Tavern level-cost curve and activation cost (placeholders: `seed.ts`'s Tavern block, `game-config.ts`'s `clanTavern` block)
- the season reset is built (2026-10-13, see `instructions/DECISIONS_LOG.md`). Still open: the Core's lore
- **Energy-pack hoarding vs the Core (raised 2026-10-14, to discuss further
  before building).** Packs can be stockpiled all season and dumped while the
  Core is open, which would decide the season by hoarding, not steady play,
  and become pay-to-win if packs are ever sold for money. Energy is fungible,
  so a "not for the Core" rule must limit *when/how many*, not where.
  Preferred direction (owner, 2026-10-14):
  - a daily cap on packs used while the Core is open, e.g. 3 per day;
  - a cap on packs held, e.g. 20 in the inventory.

  Both caps belong in `GAME_BALANCE`. Rejected for now:
  - a full ban during the Core window (too blunt);
  - separate Core energy (too big a rule change).

  Decide before packs are sold for real money.

## Name and race change (discussed 2026-10-14, not built — finish discussing first)
Agreed so far (owner):
- **Name change** for Credits. Same rules as registration (unique, content
  filter). The old name is **never shown** to other players; only a log
  visible in godmaster.
- **Race change** for Credits, once per season, pricier than a name change.
  Not allowed in an open boss formation, during a clan war, or with
  race-locked items equipped. A clear warning that race-locked items in the
  inventory become unusable (they can still be sold). A clan's race
  requirement doesn't remove members already in it.
  Note: `instructions/PRODUCT_SPEC.md` says the race is chosen once at
  registration (LOCKED) — this changes that, so update the spec when built.

Still open:
- where to keep the old-name log (recommended: its own small "name history"
  table, shown in godmaster's player lookup — not the admin action log, which
  is for staff actions);
- cooldown between name changes (proposed: 30 days);
- how long an old name stays reserved so nobody else can take it right away
  (proposed: 7 days);
- prices for both (owner's own, or a proposal based on Credits income).

## Player acquisition and analytics (discussed 2026-10-15, plan — not built)
Owner's goal: know where players come from, later see which of them pay, and
then decide where advertising is worth it. Planned in three steps:
1. **Where a player came from, saved at registration** (small, ~half a day):
   - campaign tags from the link (`utm_source`, `utm_campaign`, …);
   - the referring site when there is no campaign (Google, a forum, …);
   - the **country** from the IP at registration — only the country is kept,
     not the IP;
   - device type and browser.

   All of it stays in our own database, so it can later be joined with
   payments ("this campaign brought 200 players, 12 paid").
2. **Analytics in godmaster** (later, once there is real data): registrations
   by source / country / device, how many still play after 1 / 7 / 30 days,
   how many pay and how much each source brings.
3. **Ad-platform pixels** (Facebook, Google) — only when paid ads start. They
   need a consent banner and a lawyer's review.

Open questions (need a lawyer, not decided):
- whether keeping the campaign tags in the browser until the player
  registers counts as cookie-like storage needing consent; an alternative is
  to carry them in the address up to the registration form;
- the privacy policy text for steps 1–3;
- the mobile apps: install attribution works through the Apple/Google stores,
  a separate topic.

Related: the security-only record of the last login IP/device for
multi-account detection (see the admin-tools notes) is a different purpose
(legitimate interest, no consent) — keep the two apart.

## Email and registration counts (plan, discussed 2026-10-15 — not built)
Brevo's free plan allows **300 emails a day** (owner checked it). If the
limit is hit, verification and password-reset emails silently stop going
out. Plan (~half a day):
- registrations per day — the data already exists (account creation time),
  only needs showing;
- a small email log: type (verification / password reset), time, and
  whether Brevo accepted or refused it — no address or content kept;
- in godmaster's Server tab: today, yesterday and a 7-day chart; emails as
  "120 of 300", gold from 70%, red from 90% (like swap); failed sends counted
  separately, since they are the sign the limit was hit;
- the daily limit as a setting, so a paid plan only changes one number;
- optional: Brevo's API may report the remaining quota directly — check what
  it returns before relying on it.

## Announcements and surveys (plan, discussed 2026-10-15 — not built)
Owner wants both; recommended order: announcements first, surveys once
there are a few dozen players.

**Announcements from godmaster** (~1 day):
- a banner at the very top of **every** page (where the account-deletion
  notice is), not only the Command Center;
- two kinds: "info" (closable with ×) and "important" (more prominent, e.g.
  before maintenance);
- closing is saved on the server, so it stays closed on every device and in
  the future app;
- start and end time (e.g. a national-holiday greeting only on that day);
- text in Bulgarian and English, falling back to English;
- target: everyone or by language. **By country isn't possible yet** — the
  player's country isn't stored (see "Player acquisition and analytics");
- delivered with the existing light `/player/me/notifications` request, so no
  extra polling.

**Surveys** (~2–3 days):
- question types: single choice, multiple choice, 1–5 rating; free text
  later (it needs moderation);
- one answer per player (who answered is kept to prevent repeats); godmaster
  shows aggregated results;
- reward small or none — a big one makes people click through blindly;
- announced through the announcement banner.

## Payments (plan, discussed 2026-10-15 — not built)
Owner decisions so far:
- **Phase 1: Stripe only, web only, Bulgaria only.** Plain Stripe (not its
  merchant-of-record service yet), so purchases are shown only to players in
  Bulgaria. Later the owner moves to a merchant of record (Stripe Managed
  Payments or Paddle) and opens other countries.
- **No VIP subscription at first:** VIP is bought one month at a time
  (extends `vipUntil`, no auto-renewal) — Stripe Billing needs VAT
  registration first. Subscriptions come later.
- **Credits** can be bought, and will **not give direct game advantages**
  (owner will adjust what Credits buy); a little will also be earnable.
- **Mobile apps** sell through the App Store and Google Play billing; Stripe
  stays on the web (store rules forbid other payment methods in the apps in
  most countries).

Architecture (agreed direction):
- Our own **product catalog** (`credits_500`, `vip_month`, …) with a mapping
  per provider (Stripe / App Store / Google Play product IDs). The game only
  knows our products; a new provider = a new adapter + mappings.
- A **purchases ledger**: player, provider, the provider's transaction ID
  (**unique** — duplicate webhooks can never grant twice), product, amount,
  currency, status. Rewards only after the provider confirms (webhook /
  receipt check), never because the client says it paid; granted in the
  same DB transaction.
- **VIP as a result:** `vipUntil` = the latest end across all sources
  (one-month purchases, later subscriptions on any platform, godmaster
  grants), recomputed by one function on every event — no conflicts between
  platforms. Show "VIP already active via …" instead of a second purchase.
- **Refunds / chargebacks** reverse the grant (VIP recomputed, Credits taken
  back); the rule for already-spent Credits is still open.
- Order: tables + VIP recompute → Stripe on the web → godmaster purchases
  view → stores when the apps exist.

Later — direct for Bulgaria, merchant of record for everyone else (owner,
2026-10-17): the owner isn't VAT-registered (only Art. 97a), so Bulgarian
players should **not** go through Stripe Managed Payments (no MoR fee, no tax
withheld for them). Stripe enables Managed Payments **per Checkout Session**,
so one Stripe account can do both:
- route by country when the checkout starts: "direct countries" (BG) → plain
  Stripe; everyone else → Stripe with Managed Payments once it's switched on;
- two settings: the direct countries, and MoR on/off (off now — so only
  Bulgaria can pay, as today);
- the purchases ledger records which path each payment took (direct or MoR),
  so the accountant can separate them;
- a direct payment from a Bulgarian IP with a foreign card is flagged for
  review;
- questions for the accountant: documenting direct sales to Bulgarian
  consumers without VAT (incl. any card-payment receipt rules, Наредба Н-18),
  the supply to Stripe under MoR and Art. 97a, and what proof of the
  customer's country is needed.

Still open:
- how "only Bulgaria" is decided (proposed: country from the IP at checkout,
  plus Stripe's card/billing country as a second check);
- product list and prices; what Credits buy once they're sold;
- energy packs vs the Core (see Seasons/Core above) — decide before packs can
  be bought with purchased Credits;
- VAT/invoicing, terms of sale and right of withdrawal — owner's lawyer/
  accountant.

## Monetization
- VIP tiers
- exact benefits — a first set was built 2026-10-13 (see `instructions/DECISIONS_LOG.md`).
  VIP +3 max energy was added 2026-10-14. Still open: VIP frames, a VIP badge, pricing and payment.
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
  - a real support@pentilius.com mailbox (until then the public pages show
    contact@optiscalesolutions.com, since 2026-10-15);
    (an in-game "Contact the team" form exists since 2026-10-13, but
    logged-out players and store reviewers still need the email);
  - a password-reset flow (the game can't send email yet, so password resets
    currently go through support).