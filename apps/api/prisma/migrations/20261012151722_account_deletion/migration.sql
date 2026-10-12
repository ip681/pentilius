-- AlterEnum
ALTER TYPE "AdminActionType" ADD VALUE 'UPDATE_GAME_SETTINGS';

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletionCode" TEXT,
ADD COLUMN     "deletionCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "deletionScheduledFor" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "game_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "accountDeletionGraceDays" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_deletion_logs" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_deletion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_deletion_logs_completedAt_idx" ON "account_deletion_logs"("completedAt");
