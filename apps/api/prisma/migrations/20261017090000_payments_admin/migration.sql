-- Payments managed in godmaster (owner decision, 2026-10-17).
ALTER TYPE "AdminActionType" ADD VALUE 'CREATE_PAYMENT_PRODUCT';
ALTER TYPE "AdminActionType" ADD VALUE 'UPDATE_PAYMENT_PRODUCT';
ALTER TYPE "AdminActionType" ADD VALUE 'REFUND_PURCHASE';
ALTER TYPE "AdminActionType" ADD VALUE 'UPDATE_PAYMENT_SETTINGS';

-- Product names in both languages instead of translation keys, and the Stripe price.
ALTER TABLE "payment_products" ADD COLUMN "nameBg" TEXT NOT NULL DEFAULT '',
ADD COLUMN "nameEn" TEXT NOT NULL DEFAULT '',
ADD COLUMN "stripePriceId" TEXT;
UPDATE "payment_products" SET "nameBg" = '500 кредита', "nameEn" = '500 Credits' WHERE "key" = 'credits_500';
UPDATE "payment_products" SET "nameBg" = 'VIP за 30 дни', "nameEn" = 'VIP for 30 days' WHERE "key" = 'vip_month';
ALTER TABLE "payment_products" ALTER COLUMN "nameBg" DROP DEFAULT, ALTER COLUMN "nameEn" DROP DEFAULT;
ALTER TABLE "payment_products" DROP COLUMN "nameKey";
CREATE UNIQUE INDEX "payment_products_stripePriceId_key" ON "payment_products"("stripePriceId");

-- What each purchase granted, kept for refunds.
ALTER TABLE "purchases" ADD COLUMN "credits" INTEGER, ADD COLUMN "vipDays" INTEGER;
UPDATE "purchases" p SET "credits" = pp."credits", "vipDays" = pp."vipDays" FROM "payment_products" pp WHERE pp."id" = p."productId";

-- Countries where payments are offered, set in godmaster.
ALTER TABLE "game_settings" ADD COLUMN "paymentsAllowedCountries" TEXT NOT NULL DEFAULT 'BG';
