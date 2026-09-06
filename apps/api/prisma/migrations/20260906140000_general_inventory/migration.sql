-- General inventory: items aren't robot-equipment-only anymore. Purely
-- additive/widening — no existing data is touched or lost.

-- 1. New item category so the catalog can hold non-equipment (consumables).
CREATE TYPE "ItemCategory" AS ENUM ('EQUIPMENT', 'CONSUMABLE');

-- 2. Equipment slot becomes optional (consumables have none); existing rows
--    keep their current slot value untouched.
ALTER TABLE "item_definitions" ALTER COLUMN "slot" DROP NOT NULL;

-- 3. Every existing item defaults to EQUIPMENT (correct — they all are).
ALTER TABLE "item_definitions" ADD COLUMN "category" "ItemCategory" NOT NULL DEFAULT 'EQUIPMENT';

-- 4. Stack size for consumables; existing equipment rows default to 1 (correct).
ALTER TABLE "item_instances" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- 5. Only the Warehouse will set this (via a follow-up seed update); every
--    other building stays NULL.
ALTER TABLE "building_types" ADD COLUMN "capacityBonusPerLevel" INTEGER;
