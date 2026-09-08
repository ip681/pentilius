ALTER TABLE "zones" ADD COLUMN "iconAssetId" TEXT;
UPDATE "zones" SET "iconAssetId" = 'zones.' || REPLACE("key", 'zone_', '') || '.icon';
ALTER TABLE "zones" ALTER COLUMN "iconAssetId" SET NOT NULL;
