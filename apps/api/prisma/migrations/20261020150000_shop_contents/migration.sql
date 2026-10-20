-- The Shop sells only items marked inShop (owner decision, 2026-10-20).
ALTER TABLE "item_definitions" ADD COLUMN "inShop" BOOLEAN NOT NULL DEFAULT false;

-- Real prices instead of the 1-unit testing ones: only the Pioneer set, 300 Metal + 100 Crystal each.
UPDATE "item_definitions" SET "shopPriceMetal" = 0, "shopPriceCrystal" = 0, "shopPriceCredits" = 0;
UPDATE "item_definitions"
SET "inShop" = true, "shopPriceMetal" = 300, "shopPriceCrystal" = 100, "shopPriceCredits" = 0
WHERE "key" IN (
  'pioneer_head_scanner',
  'pioneer_left_arm_blaster',
  'pioneer_right_arm_guard',
  'pioneer_armor_plating',
  'pioneer_core_battery',
  'pioneer_left_leg_actuator',
  'pioneer_right_leg_actuator'
);
