# PENTILIUS — Operations

Deployment, server maintenance, and pre-launch/pre-wrap-up concerns. This is
about running the game, not designing it — see the other `instructions/*.md`
files for game design and architecture rules.

## Production environment

- Single VPS (Time4VPS), IP `185.5.52.196`, root SSH key-only access.
- The VPS runs only Pentilius (owner decision, 2026-10-13: the Billing test
  app that used to share it was removed). The repo is at `/opt/pentilius`.
  Caddy is part of `docker-compose.prod.yml`; its config is `deploy/Caddyfile`
  and it reaches `api`/`web` over the compose network. Let's Encrypt
  certificates live in the `pentilius_caddy_data` volume and renew
  automatically.
- **Transactional email: Brevo** (set up 2026-10-13, free plan, account
  "OptiScale Solutions").
  - pentilius.com is authenticated there: a Brevo-code TXT and two DKIM
    CNAMEs (`brevo1/brevo2._domainkey`) in Jump.bg DNS Management. The
    existing DMARC record was kept.
  - The sender `no-reply@pentilius.com` is verified through the domain; no
    mailbox exists for it.
  - The API key is **never committed**. It lives in `/opt/pentilius/.env`
    (`BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`), the local
    `apps/api/.env`, and the owner's local `secrets/brevo-api-key.txt`
    (gitignored). If it is lost, generate a new one in Brevo → SMTP & API.
- Host-side files outside the repo:
  - `/opt/pentilius-backups`: backup and status scripts, dumps, logs;
  - `/opt/pentilius-secrets`: the rclone config;
  - `/opt/pentilius/.env`: app secrets.
- Deploy flow (order changed 2026-10-14):
  1. predeploy dump, then `git pull`;
  2. `docker compose -f docker-compose.prod.yml build <service>` (sequentially,
     not in parallel — the box has ~3.8GB RAM);
  3. **migrations before the restart**, from the new image in a throwaway
     container: `docker compose ... run --rm api npx prisma migrate deploy`.
     The old version keeps serving players meanwhile. If it fails, stop here:
     nothing was restarted, fix and retry;
  4. `up -d` — the new API starts on an already-migrated database, so there
     are no errors from missing columns. Only a migration that renames or
     drops a column can trouble the old version for those few seconds;
  5. re-run the seed
  (`docker compose ... exec -T api npx prisma db seed`) if static content
  (buildings, items, zones, etc.) changed. The seed reads
  `src/config/game-config.ts`, so the API image includes `src/config` and
  `tsconfig.json` (`apps/api/Dockerfile`, since 2026-10-14) — no manual
  copying into the container.
- During the few seconds a container restarts, Caddy serves the "we're
  updating" page (`deploy/maintenance/`) and a JSON 503 `MAINTENANCE` to API
  calls; the game shows a reconnect banner. When only one side changed,
  build and restart only that service (e.g. `build api` + `up -d api`).
- Never commit/push/deploy without separate explicit confirmation each time,
  even if a very similar action was just approved.

## Pre-launch / wrap-up checklist

Not urgent day-to-day, but worth doing as the project moves toward a real
season launch or a natural stopping point:

- **Database backups — in place (checked 2026-10-13).** A host cron job
  (`/opt/pentilius-backups/backup-db.sh`, daily at 03:30) writes a
  `pg_dump` of the Pentilius DB to `/opt/pentilius-backups/`. About two weeks
  are kept, plus `predeploy` dumps taken before deploys. The godmaster Server
  tab shows the last backup's result. Each dump is also uploaded to Google
  Drive (`gdrive:pentilius/`, via rclone with `/opt/pentilius-secrets/rclone.conf`),
  and old copies are pruned there too. The log says SUCCESS only after the
  upload succeeds, so the off-server copy is covered.
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
- **Prune Docker build cache periodically (idea, to discuss and do later —
  owner, 2026-10-13).** Checked 2026-10-13: 8.5GB of build cache, 6.3GB of
  it reclaimable; the disk is 35% used. Proposal so far:
  - a weekly host cron (like the backup), e.g. Sunday night, running
    `docker builder prune -f --filter until=168h` and removing unused images;
  - godmaster shows it read-only, via `server-status.sh`: cache size, last
    prune, result.

  A godmaster button or a schedule set from godmaster were considered and
  advised against: the API would need Docker access, which is effectively
  root on the host.
