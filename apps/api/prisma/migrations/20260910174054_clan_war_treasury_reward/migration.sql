-- AlterTable
ALTER TABLE "clan_wars" ADD COLUMN     "treasuryCreditsTransferred" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "treasuryCrystalTransferred" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "treasuryMetalTransferred" INTEGER NOT NULL DEFAULT 0;
