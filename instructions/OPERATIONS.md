# PENTILIUS — Operations

Deployment, server maintenance, and pre-launch/pre-wrap-up concerns. This is
about running the game, not designing it — see the other `instructions/*.md`
files for game design and architecture rules.

## Production environment

- Single VPS (Time4VPS), IP `185.5.52.196`, root SSH key-only access.
- Both apps live under `/opt/pentilius` (this repo) and `/opt/billing` (a
  separate, unrelated app) on the same box, sharing one Caddy reverse proxy
  (`/opt/billing/Caddyfile`) and a shared Docker network `caddy_net`.
- Deploy flow: `git pull` → `docker compose -f docker-compose.prod.yml build <service>`
  (sequentially, not in parallel — the box has ~3.8GB RAM) → `up -d` →
  `docker compose ... exec api npx prisma migrate deploy` → re-run the seed
  script if static content (buildings, items, zones, etc.) changed.
- Never commit/push/deploy without separate explicit confirmation each time,
  even if a very similar action was just approved.

## Pre-launch / wrap-up checklist

Not urgent day-to-day, but worth doing as the project moves toward a real
season launch or a natural stopping point:

- **Database backups.** As of 2026-09, there is no automated Postgres backup
  on the VPS. Once real player progress matters, this should exist before
  anything else on this list — a lost volume currently means losing every
  player's season progress with no recovery path.
- **Squash the Prisma migration history.** Migrations accumulate fast during
  active development (24 by 2026-09-08). Squashing to one clean baseline is
  low-risk only when the production DB is being reset/reinitialized anyway —
  which a seasonal reset (`instructions/PRODUCT_SPEC.md`: "Seasonal reset is
  fundamental") naturally provides. Don't squash against a production DB that
  holds data you need to keep.
- **Run the full e2e suite once.** Type-checking and linting happen on every
  change, but the full `apps/api/test/*.e2e-spec.ts` suite should be run in
  full at least once before a real launch, since it hasn't been run
  end-to-end continuously during fast iteration.
- **Revisit `OPEN_DECISIONS.md` placeholders.** Several balance values there
  are explicitly stand-ins to make Milestone 1 playable (XP curve, PvP costs,
  drop rates, etc.), not real design decisions. Worth a deliberate pass
  before treating the economy as final.
- **Add swap on the VPS.** No swap is currently configured (`free -h` shows
  `0B`) — under real memory pressure a process gets OOM-killed abruptly
  instead of degrading. A small swap file (e.g. 2GB) costs nothing (uses
  already-available disk) and is a cheap insurance policy. Not urgent while
  memory headroom is healthy.
- **Prune Docker build cache periodically.** Every `docker compose build`
  adds layers; `docker builder prune -f` reclaims the unused ones. Checked
  2026-09-08: 10.78GB total build cache, 8.44GB reclaimable. Disk headroom
  was healthy (31GB free) so this wasn't urgent, but it grows with every
  deploy and is worth checking again periodically.

## Decisions log

There is no dedicated running log of confirmed decisions in this repo.
`OPEN_DECISIONS.md` tracks the opposite — things *not yet* decided. Git
commit history is the closest thing to a chronological record today. If a
real decision log becomes worth having, it should be a separate file, not a
repurposing of `OPEN_DECISIONS.md`.
