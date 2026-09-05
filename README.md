# Pentilius

Seasonal browser strategy/RPG. See [CLAUDE.md](CLAUDE.md) and [instructions/](instructions/) for the full product spec, architecture rules and roadmap.

This is a Milestone 0 (project foundation) scaffold: auth + versioned API + i18n + local dev environment. No gameplay systems yet — see [instructions/MILESTONES.md](instructions/MILESTONES.md).

## Layout

- `apps/api` — NestJS backend (server-authoritative, `/api/v1/...`)
- `apps/web` — Next.js frontend (presentation only, calls `apps/api`)
- `packages/shared` — TypeScript types shared between `api` and `web`

## Local development

Prerequisites: Node 20+, npm, Docker Desktop.

1. Start Postgres:
   ```
   copy .env.example .env
   docker compose up -d
   ```
2. Install dependencies (run once from the repo root):
   ```
   npm install
   ```
3. Configure the API:
   ```
   copy apps\api\.env.example apps\api\.env
   npm run db:migrate
   npm run db:seed
   ```
4. Configure the web app:
   ```
   copy apps\web\.env.example apps\web\.env.local
   ```
5. Run both apps (separate terminals):
   ```
   npm run dev:api
   npm run dev:web
   ```
6. Open http://localhost:3000/login. The API listens on http://localhost:3001/api/v1.

## Tests

```
npm run test:api
npm run test:api:e2e
```

The e2e suite hits a real database — Postgres must be running and migrated first.
