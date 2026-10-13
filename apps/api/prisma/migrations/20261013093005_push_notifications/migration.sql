-- AlterTable
ALTER TABLE "players" ADD COLUMN     "notificationSettings" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_dispatches" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_playerId_idx" ON "push_subscriptions"("playerId");

-- CreateIndex
CREATE INDEX "push_dispatches_createdAt_idx" ON "push_dispatches"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_dispatches_playerId_type_refKey_key" ON "push_dispatches"("playerId", "type", "refKey");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_dispatches" ADD CONSTRAINT "push_dispatches_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
