/*
  Warnings:

  - Added the required column `minLevel` to the `bosses` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Temporary default for existing rows — seed.ts immediately overwrites every
-- boss's real minLevel (30/50/70/90) right after this migration runs.
ALTER TABLE "bosses" ADD COLUMN     "minLevel" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "bosses" ALTER COLUMN "minLevel" DROP DEFAULT;
