/**
 * Pattern for data-driven balance values (see instructions/GAME_SYSTEMS.md,
 * instructions/OPEN_DECISIONS.md). Milestone 0 has no gameplay systems yet,
 * so this file intentionally stays empty of real values — it exists only to
 * fix the shape: balance constants live here (or later in a DB-backed
 * GameConfig table), never hard-coded inside game logic.
 *
 * Do not add values for mechanics still marked UNDEFINED in the instructions
 * (e.g. Action Energy regeneration rate) — those belong in OPEN_DECISIONS.md
 * until the owner decides them.
 */
export interface GameConfig {
  // Populated starting in Milestone 1, one gameplay system at a time.
}
