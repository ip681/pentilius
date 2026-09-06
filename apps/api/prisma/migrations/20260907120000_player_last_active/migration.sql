-- Presence tracking for the clan roster's "Online" / "last seen" column.
-- No real-time system — just a timestamp touched (throttled) on every
-- authenticated request by JwtStrategy. Existing rows default to now().
ALTER TABLE "players" ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
