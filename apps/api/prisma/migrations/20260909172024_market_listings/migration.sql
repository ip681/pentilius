-- CreateEnum
CREATE TYPE "MarketListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED');

-- AlterTable
ALTER TABLE "item_instances" ADD COLUMN     "listedForSale" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "market_listings" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "itemInstanceId" TEXT NOT NULL,
    "priceMetal" INTEGER NOT NULL DEFAULT 0,
    "priceCrystal" INTEGER NOT NULL DEFAULT 0,
    "priceCredits" INTEGER NOT NULL DEFAULT 0,
    "status" "MarketListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "buyerId" TEXT,

    CONSTRAINT "market_listings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_itemInstanceId_fkey" FOREIGN KEY ("itemInstanceId") REFERENCES "item_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
