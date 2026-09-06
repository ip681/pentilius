-- AlterTable
ALTER TABLE "clans" ADD COLUMN     "treasuryMetal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "treasuryCrystal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "treasuryCredits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "clan_memberships" ADD COLUMN     "contributedMetal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contributedCrystal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contributedCredits" INTEGER NOT NULL DEFAULT 0;
