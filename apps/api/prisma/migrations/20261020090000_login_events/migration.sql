-- Security record of logins (owner decision, 2026-10-19): kept 90 days, staff-only view.
-- AlterEnum
ALTER TYPE "AdminActionType" ADD VALUE 'VIEW_PLAYER_LOGINS';

-- CreateTable
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "device" TEXT,
    "browser" TEXT,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_events_playerId_createdAt_idx" ON "login_events"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "login_events_ip_idx" ON "login_events"("ip");

-- CreateIndex
CREATE INDEX "login_events_createdAt_idx" ON "login_events"("createdAt");

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

