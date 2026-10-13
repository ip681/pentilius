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

- **Database backups — in place (checked 2026-10-13).** A host cron job
  (`/opt/pentilius-backups/backup-db.sh`, daily at 03:30) writes a
  `pg_dump` of the Pentilius DB to `/opt/pentilius-backups/`. About two weeks
  are kept, plus `predeploy` dumps taken before deploys. The godmaster Server
  tab shows the last backup's result. Still open: an off-server copy (Google
  Drive via rclone was tested, not wired up), since a lost VPS loses the
  dumps too.
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
- **Swap — done (2026-10-13).** A 2GB `/swapfile` (in `/etc/fstab`, so it
  survives reboots) with `vm.swappiness=10` (`/etc/sysctl.d/99-swappiness.conf`),
  so it is only used under real memory pressure. `server-status.sh` now
  records swap, and the godmaster Server tab shows it with stricter colours
  (gold from 10%, red from 40%) and a line on the chart. Steady swap use means
  RAM is short and it is time for a bigger server.
- **Prune Docker build cache periodically.** Every `docker compose build`
  adds layers; `docker builder prune -f` reclaims the unused ones. Checked
  2026-09-08: 10.78GB total build cache, 8.44GB reclaimable. Disk headroom
  was healthy (31GB free) so this wasn't urgent, but it grows with every
  deploy and is worth checking again periodically.

## Decisions log

`instructions/DECISIONS_LOG.md` holds the historical record of confirmed
decisions and their rationale (split out of `OPEN_DECISIONS.md` on
2026-10-11, which had grown into a mix of resolved history and genuinely open
questions — expensive to load in full on every conversation for mostly-dead
weight). It is deliberately **not** referenced via `@` from `CLAUDE.md`, so
it's read on demand instead of auto-loaded every turn. `OPEN_DECISIONS.md`
keeps tracking the opposite — things *not yet* decided.
