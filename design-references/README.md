# Design references

Visual/UX inspiration provided by the project owner — **not code to run or import**.
Some of these files embed client-side JS that fakes production ticks and combat
resolution in the browser; that logic was deliberately not ported, since game
logic must be server-authoritative (see `instructions/ARCHITECTURE.md`). Only
the layout and visual language were adopted into the real Next.js pages.

- `interface.html` — "Command Center" dashboard layout → `apps/web/src/app/[locale]/dashboard`
- `buildings.html` — base/building cards → `apps/web/src/app/[locale]/base`
- `inventory.html` — ship + inventory 3-column layout → `apps/web/src/app/[locale]/ship`
- `bttle.html` — round-by-round combat arena → `apps/web/src/app/[locale]/zones/[zoneId]`
- `clan_battle.html` — 5v5 clan battle screen, saved for Milestone 4 (Clans); not built yet
