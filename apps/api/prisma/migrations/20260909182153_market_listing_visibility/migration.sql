-- AlterTable
ALTER TABLE "market_listings" ADD COLUMN     "visibleToClanOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibleToFriendsOnly" BOOLEAN NOT NULL DEFAULT false;
