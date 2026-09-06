-- CreateEnum
CREATE TYPE "ClanBuildingBonusType" AS ENUM ('MEMBER_CAPACITY', 'COMBAT_BONUS', 'PRODUCTION_BONUS');

-- CreateTable
CREATE TABLE "clan_building_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "descriptionKey" TEXT NOT NULL,
    "bonusType" "ClanBuildingBonusType" NOT NULL,
    "bonusPerLevel" DOUBLE PRECISION NOT NULL,
    "maxLevel" INTEGER NOT NULL,
    "iconAssetId" TEXT NOT NULL,

    CONSTRAINT "clan_building_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_building_level_costs" (
    "id" TEXT NOT NULL,
    "clanBuildingTypeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "metalCost" INTEGER NOT NULL,
    "crystalCost" INTEGER NOT NULL,
    "creditsCost" INTEGER NOT NULL,
    "constructionSeconds" INTEGER NOT NULL,

    CONSTRAINT "clan_building_level_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_buildings" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "clanBuildingTypeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "constructionEndsAt" TIMESTAMP(3),

    CONSTRAINT "clan_buildings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clan_building_types_key_key" ON "clan_building_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "clan_building_level_costs_clanBuildingTypeId_level_key" ON "clan_building_level_costs"("clanBuildingTypeId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "clan_buildings_clanId_clanBuildingTypeId_key" ON "clan_buildings"("clanId", "clanBuildingTypeId");

-- AddForeignKey
ALTER TABLE "clan_building_level_costs" ADD CONSTRAINT "clan_building_level_costs_clanBuildingTypeId_fkey" FOREIGN KEY ("clanBuildingTypeId") REFERENCES "clan_building_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_buildings" ADD CONSTRAINT "clan_buildings_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_buildings" ADD CONSTRAINT "clan_buildings_clanBuildingTypeId_fkey" FOREIGN KEY ("clanBuildingTypeId") REFERENCES "clan_building_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
