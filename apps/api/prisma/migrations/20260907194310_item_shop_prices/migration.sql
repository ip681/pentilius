-- AlterTable
ALTER TABLE "item_definitions" ADD COLUMN     "shopPriceCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shopPriceCrystal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shopPriceMetal" INTEGER NOT NULL DEFAULT 0;
