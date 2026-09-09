-- AlterTable
ALTER TABLE "players" ADD COLUMN     "selectedAvatarKey" TEXT,
ADD COLUMN     "selectedFrameKey" TEXT;

-- CreateTable
CREATE TABLE "avatar_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "iconAssetId" TEXT NOT NULL,

    CONSTRAINT "avatar_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frame_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "iconAssetId" TEXT NOT NULL,

    CONSTRAINT "frame_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "avatar_definitions_key_key" ON "avatar_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "frame_definitions_key_key" ON "frame_definitions"("key");
