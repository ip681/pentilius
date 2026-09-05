-- CreateEnum
CREATE TYPE "EquipmentSlot" AS ENUM ('WEAPON', 'ENGINE', 'HULL', 'SHIELD', 'REACTOR', 'UTILITY');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('METAL', 'CRYSTAL', 'OXYGEN', 'CREDITS', 'UPGRADE_STONES');

-- CreateEnum
CREATE TYPE "BattleOutcome" AS ENUM ('WIN', 'LOSS');

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "actionEnergy" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "actionEnergyMax" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "crystal" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "energyUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "metal" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "oxygen" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "resourcesUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "upgradeStones" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "unlockLevel" INTEGER NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pentili" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "maxHp" INTEGER NOT NULL,
    "attack" INTEGER NOT NULL,
    "defense" INTEGER NOT NULL,
    "xpReward" INTEGER NOT NULL,
    "iconAssetId" TEXT NOT NULL,

    CONSTRAINT "pentili_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loot_drops" (
    "id" TEXT NOT NULL,
    "pentiliId" TEXT NOT NULL,
    "resourceType" "ResourceType",
    "itemDefinitionId" TEXT,
    "dropChance" DOUBLE PRECISION NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "maxQuantity" INTEGER NOT NULL,

    CONSTRAINT "loot_drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "maxLevel" INTEGER NOT NULL,
    "iconAssetId" TEXT NOT NULL,

    CONSTRAINT "building_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_level_costs" (
    "id" TEXT NOT NULL,
    "buildingTypeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "metalCost" INTEGER NOT NULL,
    "crystalCost" INTEGER NOT NULL,
    "constructionSeconds" INTEGER NOT NULL,
    "producesResourceType" "ResourceType",
    "producesPerHour" INTEGER,

    CONSTRAINT "building_level_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "descriptionKey" TEXT NOT NULL,
    "slot" "EquipmentSlot" NOT NULL,
    "baseStats" JSONB NOT NULL,
    "maxUpgradeLevel" INTEGER NOT NULL,
    "iconAssetId" TEXT NOT NULL,
    "isStarterItem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "item_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_thresholds" (
    "level" INTEGER NOT NULL,
    "xpRequired" INTEGER NOT NULL,

    CONSTRAINT "level_thresholds_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "player_buildings" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "buildingTypeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "constructionEndsAt" TIMESTAMP(3),

    CONSTRAINT "player_buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_instances" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "itemDefinitionId" TEXT NOT NULL,
    "upgradeLevel" INTEGER NOT NULL DEFAULT 0,
    "equippedSlot" "EquipmentSlot",
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battle_reports" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "pentiliId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "outcome" "BattleOutcome" NOT NULL,
    "xpGained" INTEGER NOT NULL,
    "lootSummary" JSONB NOT NULL,
    "damageDealt" INTEGER NOT NULL,
    "damageTaken" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zones_key_key" ON "zones"("key");

-- CreateIndex
CREATE UNIQUE INDEX "pentili_key_key" ON "pentili"("key");

-- CreateIndex
CREATE UNIQUE INDEX "building_types_key_key" ON "building_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "building_level_costs_buildingTypeId_level_key" ON "building_level_costs"("buildingTypeId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "item_definitions_key_key" ON "item_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "player_buildings_playerId_buildingTypeId_key" ON "player_buildings"("playerId", "buildingTypeId");

-- AddForeignKey
ALTER TABLE "pentili" ADD CONSTRAINT "pentili_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loot_drops" ADD CONSTRAINT "loot_drops_pentiliId_fkey" FOREIGN KEY ("pentiliId") REFERENCES "pentili"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loot_drops" ADD CONSTRAINT "loot_drops_itemDefinitionId_fkey" FOREIGN KEY ("itemDefinitionId") REFERENCES "item_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_level_costs" ADD CONSTRAINT "building_level_costs_buildingTypeId_fkey" FOREIGN KEY ("buildingTypeId") REFERENCES "building_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_buildings" ADD CONSTRAINT "player_buildings_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_buildings" ADD CONSTRAINT "player_buildings_buildingTypeId_fkey" FOREIGN KEY ("buildingTypeId") REFERENCES "building_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_itemDefinitionId_fkey" FOREIGN KEY ("itemDefinitionId") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_reports" ADD CONSTRAINT "battle_reports_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_reports" ADD CONSTRAINT "battle_reports_pentiliId_fkey" FOREIGN KEY ("pentiliId") REFERENCES "pentili"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_reports" ADD CONSTRAINT "battle_reports_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
