-- Sales documents and the NRA audit file (owner decision, 2026-10-23; Наредба Н-18, чл. 52о).
ALTER TYPE "AdminActionType" ADD VALUE 'UPDATE_SELLER_SETTINGS';
ALTER TYPE "AdminActionType" ADD VALUE 'GENERATE_AUDIT_FILE';

CREATE TYPE "PaymentPath" AS ENUM ('DIRECT', 'MOR');
CREATE TYPE "SaleDocumentKind" AS ENUM ('SALE', 'REFUND');

ALTER TABLE "game_settings" ADD COLUMN "sellerInfo" JSONB;

ALTER TABLE "purchases" ADD COLUMN "paymentPath" "PaymentPath" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN "livemode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentIntentId" TEXT,
ADD COLUMN "chargeId" TEXT;

CREATE TABLE "sale_documents" (
    "id" TEXT NOT NULL,
    "kind" "SaleDocumentKind" NOT NULL,
    "number" BIGINT NOT NULL,
    "test" BOOLEAN NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "saleDocumentId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderNumber" TEXT NOT NULL,
    "transactionRef" TEXT NOT NULL,
    "chargeRef" TEXT,
    "seller" JSONB NOT NULL,
    "eshopNumber" TEXT NOT NULL,
    "posNumber" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "qrPayload" TEXT NOT NULL,

    CONSTRAINT "sale_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_counters" (
    "key" TEXT NOT NULL,
    "last" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "audit_files" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" TEXT NOT NULL,
    "adminUsername" TEXT NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "refundCount" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "xml" BYTEA NOT NULL,

    CONSTRAINT "audit_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_documents_kind_test_number_key" ON "sale_documents"("kind", "test", "number");
CREATE UNIQUE INDEX "sale_documents_purchaseId_kind_key" ON "sale_documents"("purchaseId", "kind");
CREATE INDEX "sale_documents_test_issuedAt_idx" ON "sale_documents"("test", "issuedAt");
CREATE INDEX "audit_files_year_month_idx" ON "audit_files"("year", "month");

ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_saleDocumentId_fkey" FOREIGN KEY ("saleDocumentId") REFERENCES "sale_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "document_counters" ("key", "last") VALUES ('SALE_LIVE', 0), ('SALE_TEST', 0), ('REFUND_LIVE', 0), ('REFUND_TEST', 0);

-- Issued documents are final (Наредба Н-18, приложение № 29, т. 2: integrity of
-- the data): any UPDATE or DELETE is refused, whoever tries it.
CREATE FUNCTION "sale_documents_are_final"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'sale documents cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sale_documents_no_update_or_delete"
BEFORE UPDATE OR DELETE ON "sale_documents"
FOR EACH ROW EXECUTE FUNCTION "sale_documents_are_final"();

CREATE TRIGGER "sale_documents_no_truncate"
BEFORE TRUNCATE ON "sale_documents"
FOR EACH STATEMENT EXECUTE FUNCTION "sale_documents_are_final"();
