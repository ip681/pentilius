-- The longer expeditions now unlock with the Navigation research instead of the
-- Research Center (owner decision, 2026-10-14). Renamed, so the values stay.
ALTER TABLE "expedition_types" RENAME COLUMN "requiredResearchCenterLevel" TO "requiredNavigationLevel";
