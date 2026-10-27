# PENTILIUS — Open Decisions

Do not silently decide these as permanent product rules. For the history and
rationale behind decisions already made, see `instructions/DECISIONS_LOG.md`
(not auto-loaded — read on demand) — this file only tracks what is still
open or still a placeholder value.

## Milestone 1 placeholders (implemented but NOT final)

Still-isolated, data-driven stand-in values — not final balance, but the
system around each one is built end-to-end and can be retuned without
touching application code. Full rationale: `instructions/DECISIONS_LOG.md`.

- **XP curve** → edited in godmaster → Balance → XP since 2026-10-19 (`src/config/xp-balance.ts` holds the default curve 15 × L^2.28). Still a first pass, not balanced against real XP income.
- **Pentili stats and rewards** → edited in godmaster → Balance since 2026-10-18 (curves, zones, per-Pentili strength; `src/config/pentili-balance.ts` holds the defaults). The numbers are still a first pass, not final balance.
- **Action Energy regeneration rate** → `game-config.ts` (`actionEnergy.regenIntervalMinutes`).
- **Item upgrade cost/success rules** → edited in godmaster → Balance → Sets since 2026-10-19 (bonus per level, stones per level, fragments per stone; `src/config/equipment-balance.ts` holds the defaults); no failure chance or protection stones yet.
- **Expeditions** → edited in godmaster → Balance → Expeditions since 2026-10-19 (fights per expedition 3 / 12 / 22, duration, bonus chance, Navigation level, early-cancel share; `src/config/expedition-balance.ts` holds the defaults). Placeholder numbers.
- **Equipment set stats, max upgrades, sell values** → edited in godmaster → Balance → Sets since 2026-10-19. Its preview showed (2026-10-19) that without research and Forge a robot can't beat the last Pentil of any zone even with its set maxed; with everything at +30% it mostly can — the Pentili fit an end-game robot better than a mid-season one. To look at in the balancing pass.
- **Final damage formula** → `apps/api/src/pve/combat.service.ts` (a simple power-ratio win-probability model), isolated so it can be replaced without touching callers.
- **Core Attributes point-buy curves** → flat, not compounding (`game-config.ts`'s `robotAttributes`). Defense Success Rate and a "Combat Power" summary score remain undecided (see Combat below).
- **Construction costs/times, building production rates and effects** → edited in godmaster → Balance → Buildings & research since 2026-10-19 (`src/config/building-balance.ts` holds the defaults of the 2026-10-14 base balance). Not yet checked against real player income.
- **Research tree size/rate** → 9 technologies, cap level 30, production +2%/level, combat +1%/level — bonuses, max levels and costs edited in godmaster since 2026-10-19; placeholder numbers, not a final tree.
- **PvP placeholders** → targeting pool (random among level-5+ players), attack cooldown minutes, revenge-protection window minutes — see `game-config.ts`'s `pvp` block.
- **Clan placeholders** → exact role set beyond LEADER/OFFICER/MEMBER, flat base member cap (10). Clan building bonuses, max levels, costs, the Cantina's activation and the Generator's energy levels are edited in godmaster → Balance → Clan buildings since 2026-10-19 (`src/config/clan-balance.ts` holds the defaults); still placeholder numbers.
- **Boss stats and loot** → edited in godmaster → Balance → Bosses since 2026-10-19 (`src/config/boss-balance.ts` holds the defaults: the stats of 2026-10-11, 12 fights' worth of Metal/Crystal, 50% for 1–2 stones of the zone's set, no Credits). Placeholder loot.
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
- defender losses beyond the flat 10% steal of Metal and Crystal (Credits are never stolen since 2026-10-19)
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
- clan building numbers and the Cantina's activation cost (base balance 2026-10-14, still placeholders; edited in godmaster since 2026-10-19)
- whether Credits in the clan **treasury** stay protected when a clan war ends (the winner takes a share of the loser's treasury) — asked 2026-10-19, not decided
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
- Tavern level-cost curve and activation cost (placeholders, edited in godmaster → Balance → Clan buildings since 2026-10-19)
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
  back in full — the balance may go below 0, decided 2026-10-23).
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

Built 2026-10-18 (see `instructions/DECISIONS_LOG.md`): creating products in
Stripe from godmaster and names from templates. Still open from this list:
the product icons (owner may prepare art).

Planned next (owner, 2026-10-18):
- **Create in Stripe from godmaster:** fill in kind, amount and price, and
  godmaster creates the Stripe product + price and links it. Stripe prices
  can't be edited, so "change price" = create a new price, archive the old
  one, link the new one (past purchases keep what they paid).
- **Product names from templates, not typed:** "VIP for {days} days" /
  "{count} Credits", translated once per language, so a new product has a
  name in every language with nothing to type in godmaster. An optional icon
  per product (VIP badge, coin piles growing with the pack — the owner may
  prepare the art; no text baked into images). An optional custom name only
  for special offers ("Starter pack"): English required, other languages
  optional, falling back to English.

Mobile stores (later — **Android first, Apple last**; keep the project
compatible with this now):
- **Per-platform mapping:** one product of ours with its own ID on each
  platform (Stripe price, Google Play product, App Store product). Today only
  `stripePriceId` exists — generalize to a per-provider mapping when the
  first store is added.
- **Prices in the apps come from the store** (local currency and price
  steps), never from our database.
- **Google Play:** individual products are believed **not** to need separate
  review (created/activated in Play Console or via its API) — **verify in the
  Play Console help when we get there**, then godmaster can create and link
  them like Stripe. New developer accounts must run a **closed test with at
  least 12 testers for 14 days in a row** before publishing (third-party
  source — plan the testers early). From **31 Aug 2026** new apps/updates
  must use **Play Billing Library 8+** (Google docs).
- **Apple (last):** in-app purchases go through **review**, sometimes with an
  app version, and use fixed price tiers — create them in App Store Connect
  and only link the IDs in godmaster.
- Store rules on other payment methods inside the apps change (US/EU); Stripe
  stays web-only unless the rules and a lawyer say otherwise.

Still open:
- how "only Bulgaria" is decided (proposed: country from the IP at checkout,
  plus Stripe's card/billing country as a second check);
- product list and prices; what Credits buy once they're sold;
- energy packs vs the Core (see Seasons/Core above) — decide before packs can
  be bought with purchased Credits;
- VAT/invoicing, terms of sale and right of withdrawal — owner's lawyer/
  accountant.

### Sale documents and the NRA audit file (built 2026-10-23)
Built: a document per direct sale and per refund (Наредба Н-18, чл. 52о), the
monthly audit file (Приложение № 38) in godmaster; see
`instructions/DECISIONS_LOG.md`. Still open:

For the accountant:
- payment code in the audit file: 4 "payment service provider" (owner's
  choice, 2026-10-23 — Stripe charges the card and pays out later) or 2
  "virtual POS" — confirm; one line to change;
- the basis for not charging VAT on the documents: "чл. 113, ал. 9 от ЗДДС"
  for a company registered only under Art. 97a — confirm the article;
- the QR code's second field, written in the ordinance as "< >": empty (as
  now) or a space;
- a month with refunds but no sales: the NRA schema needs at least one order,
  so no file can be built — is anything filed then, and how?

Will show at the first real filing:
- the file is UTF-8 (owner decision, 2026-10-23); the NRA's own sample is
  Windows-1251. If the portal refuses it, switching back is a small change;
- the embedded XSD is the NRA's of 06.06.2022 (still says "лв."; we file
  euro). Replace it if the NRA publishes a new one.

For the owner:
- partial refunds: only full refunds are handled. A partial refund made by
  hand in Stripe's dashboard creates no document and takes nothing back in
  the game. Proposed rule: full refunds only, always through godmaster;
- Managed Payments (abroad): whether those sales get our documents / go in
  the audit file (excluded until decided; the data is kept so either works),
  VAT included in the price or added on top, and whether round prices in
  other currencies are needed.

Before the first real sale (steps, not questions):
- register the e-shop with the NRA (Приложение № 33, with a qualified
  e-signature) and enter its real unique number in godmaster;
- set up the server's Stripe webhook, including `charge.dispute.closed`
  (a lost dispute takes the purchase back);
- the live Stripe key: with the test key every document is a test one; the
  live series starts at 0000000001 with the first real payment.

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
  - the Privacy text must mention the login records (IP, country, device; kept
    90 days, for security only), built 2026-10-19;
  - checking the current Apple/Google terms before submission;
  - filling in the store age-rating and data-safety forms;
  - a real support@pentilius.com mailbox (until then the public pages show
    contact@optiscalesolutions.com, since 2026-10-15);
    (an in-game "Contact the team" form exists since 2026-10-13, but
    logged-out players and store reviewers still need the email);
  - a password-reset flow (the game can't send email yet, so password resets
    currently go through support).