-- Persisted per-account language preference, set from the new Settings page.
-- Null until a player saves a choice there.
ALTER TABLE "players" ADD COLUMN "preferredLocale" TEXT;
