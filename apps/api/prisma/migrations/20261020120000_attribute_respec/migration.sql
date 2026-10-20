-- Free resets of the Core Attribute points (owner decision, 2026-10-20).
ALTER TABLE "players" ADD COLUMN "attributeRespecs" INTEGER NOT NULL DEFAULT 0;

-- One free reset for every existing player: this ships together with the new
-- combat formula, so points spent under the old rules can be moved.
UPDATE "players" SET "attributeRespecs" = 1;
