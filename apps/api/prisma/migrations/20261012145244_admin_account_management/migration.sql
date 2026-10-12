-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminActionType" ADD VALUE 'UPDATE_ADMIN_ROLE';
ALTER TYPE "AdminActionType" ADD VALUE 'RESET_ADMIN_PASSWORD';
ALTER TYPE "AdminActionType" ADD VALUE 'DEACTIVATE_ADMIN';
ALTER TYPE "AdminActionType" ADD VALUE 'ACTIVATE_ADMIN';
ALTER TYPE "AdminActionType" ADD VALUE 'CHANGE_OWN_PASSWORD';

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
