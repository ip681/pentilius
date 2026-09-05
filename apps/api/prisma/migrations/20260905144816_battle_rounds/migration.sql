/*
  Warnings:

  - Added the required column `pentiliMaxHp` to the `battle_reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `playerMaxHp` to the `battle_reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rounds` to the `battle_reports` table without a default value. This is not possible if the table is not empty.

*/
-- Existing battle_reports rows predate round-based combat and have no
-- meaningful rounds/maxHp data to backfill; this table is disposable
-- gameplay history, so clear it rather than invent placeholder values.
DELETE FROM "battle_reports";

-- AlterTable
ALTER TABLE "battle_reports" ADD COLUMN     "pentiliMaxHp" INTEGER NOT NULL,
ADD COLUMN     "playerMaxHp" INTEGER NOT NULL,
ADD COLUMN     "rounds" JSONB NOT NULL;
