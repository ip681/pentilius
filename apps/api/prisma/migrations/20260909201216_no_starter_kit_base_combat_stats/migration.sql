-- Owner decision (2026-09-09): no starter kit / no starting attribute points
-- on registration — combat viability for a brand-new robot instead comes from
-- GAME_BALANCE.combat's baseAttack/baseDefense floor (game-config.ts, not a
-- schema change). `isStarterItem` is now unused (nothing reads it after
-- auth.service.ts's register() stopped granting a starter kit).
ALTER TABLE "item_definitions" DROP COLUMN "isStarterItem";

ALTER TABLE "players" ALTER COLUMN "attributePointsAvailable" SET DEFAULT 0;
