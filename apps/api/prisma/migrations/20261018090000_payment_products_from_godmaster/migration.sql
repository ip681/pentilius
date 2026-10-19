-- Products created in Stripe from godmaster; names from templates unless set
-- (owner decision, 2026-10-18).
ALTER TABLE "payment_products" ADD COLUMN "stripeProductId" TEXT;
ALTER TABLE "payment_products" ALTER COLUMN "nameBg" DROP NOT NULL, ALTER COLUMN "nameEn" DROP NOT NULL;
-- The current names all match the templates, so they become template names.
UPDATE "payment_products" SET "nameBg" = NULL, "nameEn" = NULL;
