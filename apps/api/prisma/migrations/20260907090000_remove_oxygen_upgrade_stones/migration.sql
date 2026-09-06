-- Remove Oxygen (dead placeholder, never produced or consumed) and the
-- generic Upgrade Stones resource, replaced by 3 tier-specific consumable
-- materials (Pioneer/Ascendant/Coreforged Upgrade — seeded in prisma/seed.ts).

-- 1. Loot tables are fully rebuilt by seed.ts on every run — safe to clear
--    before shrinking the enum they reference.
DELETE FROM "loot_drops";
DELETE FROM "boss_loot_drops";

-- 2. Shrink ResourceType: drop OXYGEN and UPGRADE_STONES. Postgres can't
--    alter enum values in place — rename the old type out of the way, create
--    the new 3-value type, repoint every column that uses it, drop the old type.
ALTER TYPE "ResourceType" RENAME TO "ResourceType_old";
CREATE TYPE "ResourceType" AS ENUM ('METAL', 'CRYSTAL', 'CREDITS');
ALTER TABLE "loot_drops" ALTER COLUMN "resourceType" TYPE "ResourceType" USING NULL;
ALTER TABLE "boss_loot_drops" ALTER COLUMN "resourceType" TYPE "ResourceType" USING NULL;
ALTER TABLE "building_level_costs" ALTER COLUMN "producesResourceType" TYPE "ResourceType" USING "producesResourceType"::text::"ResourceType";
DROP TYPE "ResourceType_old";

-- 3. Drop the now-unused Player columns.
ALTER TABLE "players" DROP COLUMN "oxygen";
ALTER TABLE "players" DROP COLUMN "upgradeStones";
