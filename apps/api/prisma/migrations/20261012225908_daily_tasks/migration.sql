-- CreateTable
CREATE TABLE "daily_task_progress" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_task_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_task_claims" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_task_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_task_progress_playerId_day_type_key" ON "daily_task_progress"("playerId", "day", "type");

-- CreateIndex
CREATE INDEX "daily_task_claims_playerId_day_idx" ON "daily_task_claims"("playerId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "daily_task_claims_playerId_day_taskKey_key" ON "daily_task_claims"("playerId", "day", "taskKey");

-- AddForeignKey
ALTER TABLE "daily_task_progress" ADD CONSTRAINT "daily_task_progress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_task_claims" ADD CONSTRAINT "daily_task_claims_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
