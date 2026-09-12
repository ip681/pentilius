-- CreateEnum
CREATE TYPE "AdminActionType" AS ENUM ('GRANT_RESOURCE', 'GRANT_ITEM', 'BAN_PLAYER', 'UNBAN_PLAYER', 'RENAME_PLAYER');

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "bannedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "admin_action_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminUsername" TEXT NOT NULL,
    "actionType" "AdminActionType" NOT NULL,
    "targetPlayerId" TEXT,
    "targetUsername" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_action_logs_targetPlayerId_idx" ON "admin_action_logs"("targetPlayerId");

-- AddForeignKey
ALTER TABLE "admin_action_logs" ADD CONSTRAINT "admin_action_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_action_logs" ADD CONSTRAINT "admin_action_logs_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
