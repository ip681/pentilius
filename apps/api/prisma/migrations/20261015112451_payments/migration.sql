-- CreateEnum
CREATE TYPE "PaymentProductKind" AS ENUM ('CREDITS', 'VIP');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'APP_STORE', 'GOOGLE_PLAY');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED', 'REFUNDED');

-- CreateTable
CREATE TABLE "payment_products" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "kind" "PaymentProductKind" NOT NULL,
    "credits" INTEGER,
    "vipDays" INTEGER,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "payment_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerRef" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "ipCountry" TEXT,
    "cardCountry" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_products_key_key" ON "payment_products"("key");

-- CreateIndex
CREATE INDEX "purchases_playerId_createdAt_idx" ON "purchases"("playerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_provider_providerRef_key" ON "purchases"("provider", "providerRef");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_productId_fkey" FOREIGN KEY ("productId") REFERENCES "payment_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
