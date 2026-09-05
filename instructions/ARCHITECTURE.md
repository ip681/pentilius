# PENTILIUS — Technical Architecture

## LOCKED: API-first
Pentilius must be built as separate client and server applications.

```text
Web Client ─┐
            ├── Backend API ── Database
Mobile App ─┘
```

The future mobile app must use the same backend and game rules as the browser client.

## Server-authoritative state
The backend is authoritative for:

- resources;
- production;
- construction;
- energy regeneration;
- combat;
- XP and levels;
- drops and rewards;
- inventory;
- equipment;
- item upgrades;
- research;
- expeditions;
- clans;
- trades/auction;
- season state.

The frontend may display countdowns and previews, but never decides outcomes.

## API versioning
Use versioned API routes from the beginning:

```text
/api/v1/auth
/api/v1/player
/api/v1/base
/api/v1/buildings
/api/v1/ship
/api/v1/inventory
/api/v1/pve
```

Exact route structure can evolve, but versioning is mandatory.

## Time handling
Store canonical timestamps in UTC.

Timed operations should use server timestamps such as:

- `started_at`
- `ends_at`
- `last_energy_calculated_at`

Closing the browser must never pause timers.

Prefer elapsed-time calculation over one background job per player whenever possible.

## Database
Use PostgreSQL unless there is a strong reason not to.

Separate static game definitions from mutable player state.

### Static definitions
Examples:
- items;
- buildings;
- Pentili;
- zones;
- loot tables;
- balance configuration.

### Player state
Examples:
- profile;
- resources;
- building levels;
- construction;
- inventory item instances;
- equipped items;
- energy;
- XP and level.

Use transactions for economic mutations.

## Authentication
Authentication must work for both browser and future mobile clients.

Do not design authentication around browser-only assumptions.

## Security / anti-cheat
Never trust client-provided:
- final damage;
- combat victory;
- rewards;
- arbitrary resource amounts;
- XP awards;
- upgrade success;
- timer completion;
- item ownership.

Validate authorization and ownership on every state-changing endpoint.

## Recommended first-pass stack
This is **PROVISIONAL**, not locked:

- Backend: TypeScript + NestJS
- Database: PostgreSQL
- ORM: Prisma
- Cache/queues later: Redis
- Web frontend: Next.js + React
- Styling: Tailwind CSS or equivalent component system
- API: REST initially
- Local development: Docker Compose

If Claude proposes a different stack, it must first explain why it is better for:
1. API-first architecture,
2. mobile reuse,
3. transactional game state,
4. maintainability,
5. timed asynchronous systems.
