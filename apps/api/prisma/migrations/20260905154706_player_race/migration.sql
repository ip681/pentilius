/*
  Warnings:

  - Added the required column `race` to the `players` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Race" AS ENUM ('LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR');

-- Existing players predate race selection; this is local dev's disposable
-- test data, so clear it rather than guess a race for accounts that never
-- chose one. (Production has one real account, handled separately at deploy.)
DELETE FROM "battle_reports";
DELETE FROM "item_instances";
DELETE FROM "player_buildings";
DELETE FROM "players";

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "race" "Race" NOT NULL;
