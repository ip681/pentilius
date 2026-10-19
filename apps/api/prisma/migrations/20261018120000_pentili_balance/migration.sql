-- Pentili balance from godmaster (owner decision, 2026-10-18).
ALTER TYPE "AdminActionType" ADD VALUE 'UPDATE_PENTILI_BALANCE';

ALTER TABLE "pentili" ADD COLUMN "orderInZone" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "levelOverride" INTEGER,
ADD COLUMN "strength" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "specialItemKey" TEXT,
ADD COLUMN "specialItemChance" DOUBLE PRECISION;

-- Each Pentili's place in its zone, from its current level (0 = weakest).
UPDATE "pentili" p SET "orderInZone" = r.rn - 1
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "zoneId" ORDER BY "level", "key") AS rn FROM "pentili") r
WHERE r."id" = p."id";

CREATE TABLE "balance_configs" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balance_configs_pkey" PRIMARY KEY ("key")
);
