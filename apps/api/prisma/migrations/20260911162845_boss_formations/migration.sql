-- CreateEnum
CREATE TYPE "BossFormationStatus" AS ENUM ('OPEN', 'RESOLVED');

-- DropForeignKey
ALTER TABLE "boss_encounter_participants" DROP CONSTRAINT "boss_encounter_participants_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "boss_encounter_participants" DROP CONSTRAINT "boss_encounter_participants_playerId_fkey";

-- DropForeignKey
ALTER TABLE "boss_encounters" DROP CONSTRAINT "boss_encounters_bossId_fkey";

-- AlterTable
-- guaranteedBoxItemDefinitionId is added NULLABLE first, backfilled below by
-- boss.key, then locked to NOT NULL — the bosses table already has seeded
-- rows, so a bare NOT NULL ADD COLUMN would fail (owner decision, 2026-09-11:
-- no reset, this is a real database with existing player data).
ALTER TABLE "bosses" DROP COLUMN "encounterWindowSeconds",
ADD COLUMN     "guaranteedBoxItemDefinitionId" TEXT;

-- Backfill: tier-matched guaranteed box for the 2 existing bosses (see
-- prisma/seed.ts's bossData — boss_verdant_warden/boss_crimson_harbinger are
-- new rows the seed script inserts with this column already set).
UPDATE "bosses" SET "guaranteedBoxItemDefinitionId" = (SELECT "id" FROM "item_definitions" WHERE "key" = 'ascendant_box')
WHERE "key" = 'boss_ridgeback_alpha';

UPDATE "bosses" SET "guaranteedBoxItemDefinitionId" = (SELECT "id" FROM "item_definitions" WHERE "key" = 'coreforged_box')
WHERE "key" = 'boss_frost_sovereign';

ALTER TABLE "bosses" ALTER COLUMN "guaranteedBoxItemDefinitionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "nextBossFormationActionAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "boss_encounter_participants";

-- DropTable
DROP TABLE "boss_encounters";

-- DropEnum
DROP TYPE "BossEncounterStatus";

-- CreateTable
CREATE TABLE "boss_formations" (
    "id" TEXT NOT NULL,
    "bossId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "status" "BossFormationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvesAt" TIMESTAMP(3) NOT NULL,
    "visibleToClanOnly" BOOLEAN NOT NULL DEFAULT false,
    "visibleToFriendsOnly" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "BattleOutcome",
    "rounds" JSONB,
    "partyMaxHp" INTEGER,
    "bossMaxHp" INTEGER,
    "totalDamageDealt" INTEGER,

    CONSTRAINT "boss_formations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_formation_slots" (
    "id" TEXT NOT NULL,
    "formationId" TEXT NOT NULL,
    "race" "Race" NOT NULL,
    "playerId" TEXT,
    "joinedAt" TIMESTAMP(3),
    "xpGained" INTEGER,
    "lootSummary" JSONB,

    CONSTRAINT "boss_formation_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_formation_daily_points" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "dateUtc" TIMESTAMP(3) NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "boss_formation_daily_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "boss_formation_slots_formationId_race_key" ON "boss_formation_slots"("formationId", "race");

-- CreateIndex
CREATE UNIQUE INDEX "boss_formation_daily_points_playerId_dateUtc_key" ON "boss_formation_daily_points"("playerId", "dateUtc");

-- AddForeignKey
ALTER TABLE "bosses" ADD CONSTRAINT "bosses_guaranteedBoxItemDefinitionId_fkey" FOREIGN KEY ("guaranteedBoxItemDefinitionId") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_formations" ADD CONSTRAINT "boss_formations_bossId_fkey" FOREIGN KEY ("bossId") REFERENCES "bosses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_formations" ADD CONSTRAINT "boss_formations_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_formation_slots" ADD CONSTRAINT "boss_formation_slots_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "boss_formations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_formation_slots" ADD CONSTRAINT "boss_formation_slots_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_formation_daily_points" ADD CONSTRAINT "boss_formation_daily_points_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
