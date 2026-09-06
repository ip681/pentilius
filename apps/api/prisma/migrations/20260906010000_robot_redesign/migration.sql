-- Ship -> Robot redesign: new 7-slot anatomy, Core Attribute points, and a
-- full item-catalog reset (old ship parts have no design value and no clean
-- mapping onto the new anatomical slots). Player accounts, levels, resources,
-- clan membership, PvP/battle history and bios are all untouched — only gear
-- (ItemDefinition/ItemInstance) is reset.

-- 1. Clear loot tables that reference the old item catalog (they are fully
--    rebuilt by prisma/seed.ts on every run, scoped to every known
--    pentili/boss, so deleting here is safe).
DELETE FROM "loot_drops";
DELETE FROM "boss_loot_drops";

-- 2. Expedition types are real, reusable rows (PlayerExpedition rows can
--    reference them) — never delete them, just clear the old item reference.
--    prisma/seed.ts now upserts with update:data, so re-seeding restores it
--    against the new catalog.
UPDATE "expedition_types" SET "bonusItemDefinitionId" = NULL;

-- 3. Every equipped/owned item instance is gear tied to the old catalog —
--    clear it. This does not touch the "players" row itself.
DELETE FROM "item_instances";

-- 4. Now safe to drop the old item catalog entirely.
DELETE FROM "item_definitions";

-- 5. Swap the EquipmentSlot enum's values for the new 7-slot robot anatomy.
--    Postgres can't alter enum values in place, so: rename old type out of
--    the way, create the new type, repoint the two columns that use it, drop
--    the old type. Both columns are empty at this point (steps 3-4), so no
--    value-mapping is needed.
ALTER TYPE "EquipmentSlot" RENAME TO "EquipmentSlot_old";
CREATE TYPE "EquipmentSlot" AS ENUM ('HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'ARMOR', 'CORE', 'LEFT_LEG', 'RIGHT_LEG');
ALTER TABLE "item_definitions" ALTER COLUMN "slot" TYPE "EquipmentSlot" USING NULL;
ALTER TABLE "item_instances" ALTER COLUMN "equippedSlot" TYPE "EquipmentSlot" USING NULL;
DROP TYPE "EquipmentSlot_old";

-- 6. Future race-restricted advanced parts (schema-ready, not populated yet).
ALTER TABLE "item_definitions" ADD COLUMN "race" "Race";

-- 7. "Core Attributes" — personal stat points earned from leveling.
ALTER TABLE "players" ADD COLUMN "attributePointsAvailable" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "players" ADD COLUMN "baseDamage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "players" ADD COLUMN "baseDefense" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "players" ADD COLUMN "baseHp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "players" ADD COLUMN "baseEvasion" INTEGER NOT NULL DEFAULT 0;
