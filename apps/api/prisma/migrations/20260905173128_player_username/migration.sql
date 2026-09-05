/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `players` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `username` to the `players` table without a default value. This is not possible if the table is not empty.

*/

-- Existing players predate the username field; this is local dev's
-- disposable test data, so clear it rather than invent usernames for
-- accounts that never chose one. (Production has real accounts, handled
-- separately at deploy.)
DELETE FROM "boss_encounter_participants";
DELETE FROM "player_researches";
DELETE FROM "player_expeditions";
DELETE FROM "battle_reports";
DELETE FROM "item_instances";
DELETE FROM "player_buildings";
DELETE FROM "players";

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "username" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "players_username_key" ON "players"("username");
