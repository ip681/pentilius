-- CreateEnum
CREATE TYPE "ResearchBonusType" AS ENUM ('METAL_PRODUCTION', 'CRYSTAL_PRODUCTION', 'COMBAT_ATTACK', 'COMBAT_HP');

-- CreateTable
CREATE TABLE "research_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "descriptionKey" TEXT NOT NULL,
    "bonusType" "ResearchBonusType" NOT NULL,
    "bonusPerLevel" DOUBLE PRECISION NOT NULL,
    "maxLevel" INTEGER NOT NULL,
    "iconAssetId" TEXT NOT NULL,

    CONSTRAINT "research_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_level_costs" (
    "id" TEXT NOT NULL,
    "researchTypeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "metalCost" INTEGER NOT NULL,
    "crystalCost" INTEGER NOT NULL,
    "creditsCost" INTEGER NOT NULL,
    "researchSeconds" INTEGER NOT NULL,

    CONSTRAINT "research_level_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_researches" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "researchTypeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "researchEndsAt" TIMESTAMP(3),

    CONSTRAINT "player_researches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "research_types_key_key" ON "research_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "research_level_costs_researchTypeId_level_key" ON "research_level_costs"("researchTypeId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "player_researches_playerId_researchTypeId_key" ON "player_researches"("playerId", "researchTypeId");

-- AddForeignKey
ALTER TABLE "research_level_costs" ADD CONSTRAINT "research_level_costs_researchTypeId_fkey" FOREIGN KEY ("researchTypeId") REFERENCES "research_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_researches" ADD CONSTRAINT "player_researches_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_researches" ADD CONSTRAINT "player_researches_researchTypeId_fkey" FOREIGN KEY ("researchTypeId") REFERENCES "research_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
