-- CreateEnum
CREATE TYPE "IdentityChangeKind" AS ENUM ('NAME', 'RACE');

-- CreateTable
CREATE TABLE "player_identity_changes" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" "IdentityChangeKind" NOT NULL,
    "oldValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "creditsPaid" INTEGER NOT NULL DEFAULT 0,
    "adminUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_identity_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_identity_changes_playerId_kind_createdAt_idx" ON "player_identity_changes"("playerId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "player_identity_changes_kind_createdAt_idx" ON "player_identity_changes"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "player_identity_changes" ADD CONSTRAINT "player_identity_changes_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
