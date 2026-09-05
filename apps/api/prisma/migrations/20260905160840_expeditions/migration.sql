-- CreateTable
CREATE TABLE "expedition_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "metalReward" INTEGER NOT NULL,
    "crystalReward" INTEGER NOT NULL,
    "creditsReward" INTEGER NOT NULL,
    "xpReward" INTEGER NOT NULL,
    "bonusItemDefinitionId" TEXT,
    "bonusItemChance" DOUBLE PRECISION,

    CONSTRAINT "expedition_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_expeditions" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "expeditionTypeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "player_expeditions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expedition_types_key_key" ON "expedition_types"("key");

-- AddForeignKey
ALTER TABLE "expedition_types" ADD CONSTRAINT "expedition_types_bonusItemDefinitionId_fkey" FOREIGN KEY ("bonusItemDefinitionId") REFERENCES "item_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_expeditions" ADD CONSTRAINT "player_expeditions_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_expeditions" ADD CONSTRAINT "player_expeditions_expeditionTypeId_fkey" FOREIGN KEY ("expeditionTypeId") REFERENCES "expedition_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
