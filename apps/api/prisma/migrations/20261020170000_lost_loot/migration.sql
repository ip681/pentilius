-- Items won but not given because the inventory was full (owner decision, 2026-10-20).
ALTER TABLE "battle_reports" ADD COLUMN "lostLoot" JSONB;
ALTER TABLE "boss_formation_slots" ADD COLUMN "lostLoot" JSONB;
