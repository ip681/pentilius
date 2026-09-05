-- CreateEnum
CREATE TYPE "BossEncounterStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "bosses" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "maxHp" INTEGER NOT NULL,
    "attack" INTEGER NOT NULL,
    "defense" INTEGER NOT NULL,
    "xpReward" INTEGER NOT NULL,
    "encounterWindowSeconds" INTEGER NOT NULL,
    "iconAssetId" TEXT NOT NULL,

    CONSTRAINT "bosses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_loot_drops" (
    "id" TEXT NOT NULL,
    "bossId" TEXT NOT NULL,
    "resourceType" "ResourceType",
    "itemDefinitionId" TEXT,
    "dropChance" DOUBLE PRECISION NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "maxQuantity" INTEGER NOT NULL,

    CONSTRAINT "boss_loot_drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_encounters" (
    "id" TEXT NOT NULL,
    "bossId" TEXT NOT NULL,
    "status" "BossEncounterStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvesAt" TIMESTAMP(3) NOT NULL,
    "outcome" "BattleOutcome",
    "rounds" JSONB,
    "partyMaxHp" INTEGER,
    "bossMaxHp" INTEGER,

    CONSTRAINT "boss_encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_encounter_participants" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contributionShare" DOUBLE PRECISION,
    "xpGained" INTEGER,
    "lootSummary" JSONB,

    CONSTRAINT "boss_encounter_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bosses_key_key" ON "bosses"("key");

-- CreateIndex
CREATE UNIQUE INDEX "boss_encounter_participants_encounterId_playerId_key" ON "boss_encounter_participants"("encounterId", "playerId");

-- AddForeignKey
ALTER TABLE "bosses" ADD CONSTRAINT "bosses_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_loot_drops" ADD CONSTRAINT "boss_loot_drops_bossId_fkey" FOREIGN KEY ("bossId") REFERENCES "bosses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_loot_drops" ADD CONSTRAINT "boss_loot_drops_itemDefinitionId_fkey" FOREIGN KEY ("itemDefinitionId") REFERENCES "item_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_encounters" ADD CONSTRAINT "boss_encounters_bossId_fkey" FOREIGN KEY ("bossId") REFERENCES "bosses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_encounter_participants" ADD CONSTRAINT "boss_encounter_participants_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "boss_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_encounter_participants" ADD CONSTRAINT "boss_encounter_participants_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
