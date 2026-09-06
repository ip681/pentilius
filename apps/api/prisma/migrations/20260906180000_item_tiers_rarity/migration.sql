-- Equipment tiers (Pioneer/Ascendant/Coreforged), instance-level race-locking,
-- and item rarity ("Excellent options"). Purely additive — no existing data
-- is touched or lost.

-- 1. Named equipment set per ItemDefinition (null for consumables).
CREATE TYPE "ItemTier" AS ENUM ('PIONEER', 'ASCENDANT', 'COREFORGED');
ALTER TABLE "item_definitions" ADD COLUMN "tier" "ItemTier";

-- 2. Rarity rolled onto an ItemInstance at grant time; existing rows default
--    to NORMAL (correct — they predate this feature).
CREATE TYPE "ItemQuality" AS ENUM ('NORMAL', 'RARE', 'EPIC');
ALTER TABLE "item_instances" ADD COLUMN "quality" "ItemQuality" NOT NULL DEFAULT 'NORMAL';

-- 3. Which bonus option(s) a RARE/EPIC instance rolled; empty for NORMAL.
CREATE TYPE "ItemOption" AS ENUM ('INCREASE_DAMAGE', 'CRITICAL_DAMAGE', 'INCREASE_MAX_HP', 'DAMAGE_DECREASE', 'DAMAGE_REFLECT');
ALTER TABLE "item_instances" ADD COLUMN "rolledOptions" "ItemOption"[] NOT NULL DEFAULT ARRAY[]::"ItemOption"[];

-- 4. Instance-level race stamp for Coreforged drops (distinct from the
--    existing, still-unused ItemDefinition.race). Null for every other tier.
ALTER TABLE "item_instances" ADD COLUMN "race" "Race";
