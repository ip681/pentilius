-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResearchBonusType" ADD VALUE 'CONSTRUCTION_SPEED';
ALTER TYPE "ResearchBonusType" ADD VALUE 'RESEARCH_SPEED';
ALTER TYPE "ResearchBonusType" ADD VALUE 'EXPEDITION_REWARDS';
ALTER TYPE "ResearchBonusType" ADD VALUE 'UPGRADE_MATERIALS';
ALTER TYPE "ResearchBonusType" ADD VALUE 'RECYCLING';

-- AlterTable
ALTER TABLE "building_types" ADD COLUMN     "energyRegenBonusPerLevel" DOUBLE PRECISION,
ADD COLUMN     "exchangeLimitPerLevel" INTEGER,
ADD COLUMN     "maxEnergyBonusEvery" INTEGER,
ADD COLUMN     "researchCapPerLevel" INTEGER;

-- AlterTable
ALTER TABLE "expedition_types" ADD COLUMN     "requiredResearchCenterLevel" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "energyRegenBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "exchangeDay" TEXT,
ADD COLUMN     "exchangeUsedToday" INTEGER NOT NULL DEFAULT 0;
