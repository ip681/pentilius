-- Staff announcements (owner decision, 2026-10-21).
ALTER TYPE "AdminActionType" ADD VALUE 'SAVE_ANNOUNCEMENT';
ALTER TYPE "AdminActionType" ADD VALUE 'END_ANNOUNCEMENT';
ALTER TYPE "AdminActionType" ADD VALUE 'DELETE_ANNOUNCEMENT';

CREATE TYPE "AnnouncementKind" AS ENUM ('INFO', 'IMPORTANT');

CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "kind" "AnnouncementKind" NOT NULL,
    "texts" JSONB NOT NULL,
    "locales" TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "announcement_dismissals" (
    "announcementId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_dismissals_pkey" PRIMARY KEY ("announcementId","playerId")
);

CREATE INDEX "announcements_startsAt_endsAt_idx" ON "announcements"("startsAt", "endsAt");
CREATE INDEX "announcement_dismissals_playerId_idx" ON "announcement_dismissals"("playerId");

ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
