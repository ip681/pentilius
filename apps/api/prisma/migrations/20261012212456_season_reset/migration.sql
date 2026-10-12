-- AlterEnum
ALTER TYPE "AdminActionType" ADD VALUE 'RESET_SEASON';

-- AlterTable
ALTER TABLE "game_settings" ADD COLUMN     "seasonResetDelayDays" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "needsRaceSelection" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "seasons" ADD COLUMN     "resetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "season_player_results" (
    "id" TEXT NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "race" "Race" NOT NULL,
    "level" INTEGER NOT NULL,
    "clanName" TEXT,
    "clanTag" TEXT,
    "clanRole" "ClanRole",
    "clanRank" INTEGER,
    "coreDamage" INTEGER NOT NULL DEFAULT 0,
    "coreDamageRank" INTEGER,

    CONSTRAINT "season_player_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "season_player_results_playerId_idx" ON "season_player_results"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "season_player_results_seasonId_playerId_key" ON "season_player_results"("seasonId", "playerId");

-- AddForeignKey
ALTER TABLE "season_player_results" ADD CONSTRAINT "season_player_results_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_player_results" ADD CONSTRAINT "season_player_results_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
