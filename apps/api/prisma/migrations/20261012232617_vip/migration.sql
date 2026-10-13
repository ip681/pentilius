-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminActionType" ADD VALUE 'GRANT_VIP';
ALTER TYPE "AdminActionType" ADD VALUE 'REVOKE_VIP';

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "buildQueueBuildingTypeId" TEXT,
ADD COLUMN     "buildQueueCrystal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "buildQueueMetal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vipUntil" TIMESTAMP(3);
