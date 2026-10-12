-- CreateEnum
CREATE TYPE "BannedWordMatch" AS ENUM ('WHOLE_WORD', 'SUBSTRING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminActionType" ADD VALUE 'ADD_BANNED_WORD';
ALTER TYPE "AdminActionType" ADD VALUE 'REMOVE_BANNED_WORD';

-- CreateTable
CREATE TABLE "banned_words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "match" "BannedWordMatch" NOT NULL DEFAULT 'SUBSTRING',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banned_words_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banned_words_normalized_key" ON "banned_words"("normalized");
