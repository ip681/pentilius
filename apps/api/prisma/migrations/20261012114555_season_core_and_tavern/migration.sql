-- AlterEnum
ALTER TYPE "AdminActionType" ADD VALUE 'UPDATE_SEASON_SETTINGS';

-- AlterEnum
ALTER TYPE "ClanBuildingBonusType" ADD VALUE 'BOSS_CORE_DAMAGE';

-- AlterTable
ALTER TABLE "clan_buildings" ADD COLUMN     "activeUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "lastCoreAttackAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "seasons" (
    "id" SERIAL NOT NULL,
    "coreOpensAt" TIMESTAMP(3),
    "coreDurationDays" INTEGER NOT NULL DEFAULT 14,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_core_scores" (
    "id" TEXT NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "clanId" TEXT NOT NULL,
    "damage" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_core_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_attacks" (
    "id" TEXT NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "damageDealt" INTEGER NOT NULL,
    "damageTaken" INTEGER NOT NULL,
    "rounds" JSONB NOT NULL,
    "playerMaxHp" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_attacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_clan_results" (
    "id" TEXT NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "clanId" TEXT,
    "clanName" TEXT NOT NULL,
    "clanTag" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "damage" BIGINT NOT NULL,

    CONSTRAINT "season_clan_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clan_core_scores_seasonId_damage_idx" ON "clan_core_scores"("seasonId", "damage");

-- CreateIndex
CREATE UNIQUE INDEX "clan_core_scores_seasonId_clanId_key" ON "clan_core_scores"("seasonId", "clanId");

-- CreateIndex
CREATE INDEX "core_attacks_seasonId_clanId_idx" ON "core_attacks"("seasonId", "clanId");

-- CreateIndex
CREATE INDEX "core_attacks_playerId_createdAt_idx" ON "core_attacks"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "season_clan_results_clanId_idx" ON "season_clan_results"("clanId");

-- CreateIndex
CREATE UNIQUE INDEX "season_clan_results_seasonId_rank_key" ON "season_clan_results"("seasonId", "rank");

-- AddForeignKey
ALTER TABLE "clan_core_scores" ADD CONSTRAINT "clan_core_scores_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_core_scores" ADD CONSTRAINT "clan_core_scores_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_attacks" ADD CONSTRAINT "core_attacks_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_attacks" ADD CONSTRAINT "core_attacks_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_clan_results" ADD CONSTRAINT "season_clan_results_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_clan_results" ADD CONSTRAINT "season_clan_results_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
