-- Daily-task streak (owner decision, 2026-10-14).
ALTER TABLE "players" ADD COLUMN "dailyStreakDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dailyStreakMisses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dailyStreakLastDay" TEXT,
ADD COLUMN "dailyStreakReady" BOOLEAN NOT NULL DEFAULT false;
