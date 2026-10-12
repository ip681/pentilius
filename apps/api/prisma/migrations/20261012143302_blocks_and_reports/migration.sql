-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('PLAYER', 'CLAN', 'CLAN_MESSAGE', 'DIRECT_MESSAGE');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('HARASSMENT', 'OFFENSIVE_CONTENT', 'SPAM', 'CHEATING', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminActionType" ADD VALUE 'RESOLVE_REPORT';
ALTER TYPE "AdminActionType" ADD VALUE 'DISMISS_REPORT';
ALTER TYPE "AdminActionType" ADD VALUE 'DELETE_CLAN_MESSAGE';

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "reportingSuspendedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "player_blocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetPlayerId" TEXT,
    "targetClanId" TEXT,
    "contentSnapshot" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "comment" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdmin" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "player_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_blocks_blockedId_idx" ON "player_blocks"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "player_blocks_blockerId_blockedId_key" ON "player_blocks"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "player_reports_status_createdAt_idx" ON "player_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "player_reports_reporterId_createdAt_idx" ON "player_reports"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "player_reports_targetPlayerId_idx" ON "player_reports"("targetPlayerId");

-- CreateIndex
CREATE INDEX "player_reports_targetClanId_idx" ON "player_reports"("targetClanId");

-- AddForeignKey
ALTER TABLE "player_blocks" ADD CONSTRAINT "player_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_blocks" ADD CONSTRAINT "player_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_reports" ADD CONSTRAINT "player_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_reports" ADD CONSTRAINT "player_reports_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_reports" ADD CONSTRAINT "player_reports_targetClanId_fkey" FOREIGN KEY ("targetClanId") REFERENCES "clans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
