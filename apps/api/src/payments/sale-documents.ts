import { SaleDocumentDto, SaleDocumentLineDto, SellerInfoDto } from '@pentilius/shared';
import { PaymentProduct, Prisma, PrismaClient, Purchase, SaleDocument } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Sales documents (owner decision, 2026-10-23; Наредба Н-18, чл. 52о): the
 * e-shop's alternative to a fiscal receipt for card-not-present payments.
 * One per direct sale and one per refund, issued inside the transaction that
 * completes or refunds the purchase, numbered from gap-free 10-digit series
 * (live and test apart). Issued documents are final — a database trigger
 * refuses any change or deletion.
 */

// Not VAT-registered: every sale is in tax group "А" (Наредба Н-18, чл. 27), at 0% VAT.
export const TAX_GROUP = 'А';
const PAYMENT_METHOD = 'Карта – неприсъствено плащане (виртуален ПОС, Stripe)';
const MAX_NUMBER = BigInt('9999999999');

export const DEFAULT_SELLER: SellerInfoDto = {
  name: '',
  eik: '',
  address: '',
  contact: '',
  eshopNumber: '',
  domain: 'pentilius.com',
  posNumber: '01-STR-EUR',
  merchantId: '',
  providerName: 'Stripe Payments Europe, Limited',
  providerVatId: 'IE3206488LH',
};

const REQUIRED: (keyof SellerInfoDto)[] = ['name', 'eik', 'address', 'contact', 'eshopNumber', 'domain', 'posNumber', 'merchantId', 'providerName', 'providerVatId'];

export async function loadSellerInfo(db: Db): Promise<SellerInfoDto> {
  const settings = await db.gameSettings.findUnique({ where: { id: 1 }, select: { sellerInfo: true } });
  return { ...DEFAULT_SELLER, ...((settings?.sellerInfo ?? {}) as Partial<SellerInfoDto>) };
}

/** Fields still empty — live sales need all of them (test sales don't). */
export function missingSellerFields(seller: SellerInfoDto): string[] {
  return REQUIRED.filter((key) => !String(seller[key] ?? '').trim());
}

/** The date and time in Bulgaria — what the documents, the QR code and the audit file show. */
export function sofiaDateTime(at: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}:${get('second')}` };
}

export function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatDocumentNumber(n: bigint): string {
  return n.toString().padStart(10, '0');
}

/** The product's name on the document: godmaster's Bulgarian name, or the template. */
function productName(product: PaymentProduct, purchase: Purchase): string {
  const custom = product.nameBg?.trim();
  if (custom) return custom;
  return purchase.vipDays ? `VIP за ${purchase.vipDays} дни` : `${purchase.credits ?? 0} кредита`;
}

/** The next number of a series; the row lock serializes concurrent sales and a rollback gives the number back. */
async function nextNumber(tx: Prisma.TransactionClient, key: string): Promise<bigint> {
  const rows = await tx.$queryRaw<{ last: bigint }[]>`UPDATE "document_counters" SET "last" = "last" + 1 WHERE "key" = ${key} RETURNING "last"`;
  if (rows.length !== 1) throw new Error(`Document counter ${key} is missing`);
  if (rows[0].last > MAX_NUMBER) throw new Error(`Document counter ${key} ran out of 10-digit numbers`);
  return rows[0].last;
}

/**
 * QR code content (Наредба Н-18, приложение № 18а, software under чл. 52т):
 * <e-shop number>*< >*<order number>*<transaction reference>*<date>*<time>*<total>
 * — the second field is empty, as in the ordinance.
 */
function qrPayload(eshopNumber: string, orderNumber: string, transactionRef: string, at: Date, totalCents: number): string {
  const { date, time } = sofiaDateTime(at);
  return [eshopNumber, '', orderNumber, transactionRef, date, time, formatAmount(totalCents)].join('*');
}

/** Issues the sale document of a just-completed direct purchase (no-op if it exists or the path isn't direct). */
export async function issueSaleDocument(tx: Prisma.TransactionClient, purchase: Purchase, product: PaymentProduct): Promise<SaleDocument | null> {
  if (purchase.paymentPath !== 'DIRECT') return null;
  const existing = await tx.saleDocument.findUnique({ where: { purchaseId_kind: { purchaseId: purchase.id, kind: 'SALE' } } });
  if (existing) return existing;
  const seller = await loadSellerInfo(tx);
  const test = !purchase.livemode;
  const number = await nextNumber(tx, test ? 'SALE_TEST' : 'SALE_LIVE');
  const issuedAt = new Date();
  const transactionRef = purchase.paymentIntentId ?? purchase.providerRef;
  const lines: SaleDocumentLineDto[] = [
    { name: productName(product, purchase), taxGroup: TAX_GROUP, quantity: 1, unitPriceCents: purchase.amountCents, amountCents: purchase.amountCents },
  ];
  return tx.saleDocument.create({
    data: {
      kind: 'SALE',
      number,
      test,
      purchaseId: purchase.id,
      issuedAt,
      orderNumber: purchase.id,
      transactionRef,
      chargeRef: purchase.chargeId,
      seller: seller as unknown as Prisma.InputJsonValue,
      eshopNumber: seller.eshopNumber,
      posNumber: seller.posNumber,
      lines: lines as unknown as Prisma.InputJsonValue,
      totalCents: purchase.amountCents,
      currency: purchase.currency.toUpperCase(),
      paymentMethod: PAYMENT_METHOD,
      qrPayload: qrPayload(seller.eshopNumber, purchase.id, transactionRef, issuedAt, purchase.amountCents),
    },
  });
}

/**
 * Issues the refund document of a purchase's sale (no-op if there's no sale
 * document or the refund already has one). It repeats the sale's lines and
 * points at the sale; it has no QR code — that belongs to the sale.
 */
export async function issueRefundDocument(tx: Prisma.TransactionClient, purchase: Purchase): Promise<SaleDocument | null> {
  const sale = await tx.saleDocument.findUnique({ where: { purchaseId_kind: { purchaseId: purchase.id, kind: 'SALE' } } });
  if (!sale) return null;
  const existing = await tx.saleDocument.findUnique({ where: { purchaseId_kind: { purchaseId: purchase.id, kind: 'REFUND' } } });
  if (existing) return existing;
  const number = await nextNumber(tx, sale.test ? 'REFUND_TEST' : 'REFUND_LIVE');
  return tx.saleDocument.create({
    data: {
      kind: 'REFUND',
      number,
      test: sale.test,
      purchaseId: purchase.id,
      saleDocumentId: sale.id,
      orderNumber: sale.orderNumber,
      transactionRef: sale.transactionRef,
      chargeRef: sale.chargeRef,
      seller: sale.seller as Prisma.InputJsonValue,
      eshopNumber: sale.eshopNumber,
      posNumber: sale.posNumber,
      lines: sale.lines as Prisma.InputJsonValue,
      totalCents: sale.totalCents,
      currency: sale.currency,
      paymentMethod: 'Връщане по картата, с която е платено',
      qrPayload: '',
    },
  });
}

export function toSaleDocumentDto(doc: SaleDocument & { sale?: SaleDocument | null }): SaleDocumentDto {
  return {
    id: doc.id,
    kind: doc.kind,
    number: formatDocumentNumber(doc.number),
    test: doc.test,
    issuedAt: doc.issuedAt.toISOString(),
    orderNumber: doc.orderNumber,
    transactionRef: doc.transactionRef,
    seller: { ...DEFAULT_SELLER, ...(doc.seller as Partial<SellerInfoDto>) },
    eshopNumber: doc.eshopNumber,
    posNumber: doc.posNumber,
    lines: doc.lines as unknown as SaleDocumentLineDto[],
    totalCents: doc.totalCents,
    currency: doc.currency,
    paymentMethod: doc.paymentMethod,
    qrPayload: doc.qrPayload,
    saleNumber: doc.sale ? formatDocumentNumber(doc.sale.number) : null,
    saleIssuedAt: doc.sale ? doc.sale.issuedAt.toISOString() : null,
  };
}
