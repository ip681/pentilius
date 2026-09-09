-- Backfill existing NULLs before enforcing NOT NULL (owner decision,
-- 2026-09-09: default to avatar1/frame1 instead of "nothing selected").
UPDATE "players" SET "selectedAvatarKey" = 'avatar1' WHERE "selectedAvatarKey" IS NULL;
UPDATE "players" SET "selectedFrameKey" = 'frame1' WHERE "selectedFrameKey" IS NULL;

-- AlterTable
ALTER TABLE "players" ALTER COLUMN "selectedAvatarKey" SET NOT NULL,
ALTER COLUMN "selectedAvatarKey" SET DEFAULT 'avatar1',
ALTER COLUMN "selectedFrameKey" SET NOT NULL,
ALTER COLUMN "selectedFrameKey" SET DEFAULT 'frame1';
