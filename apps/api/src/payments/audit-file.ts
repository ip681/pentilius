import { SellerInfoDto } from '@pentilius/shared';
import { SaleDocument } from '@prisma/client';
import { validateXML } from 'xmllint-wasm';
import { NRA_AUDIT_XSD } from './nra-audit-xsd';
import { formatAmount, formatDocumentNumber, sofiaDateTime } from './sale-documents';

/**
 * The monthly NRA audit file (owner decision, 2026-10-23; Наредба Н-18,
 * чл. 52т, ал. 2 and приложение № 38): the month's live sales with the date of
 * each order, and the refunds made that month, in UTF-8 (owner decision,
 * 2026-10-23 — the NRA's own sample is Windows-1251, but readable everywhere
 * mattered more), checked against the NRA's XSD before it's kept. Amounts are
 * in euro (owner decision, 2026-10-23).
 */

// Stripe as a payment service provider (code 4, owner decision 2026-10-23: the
// card is charged by Stripe and paid out later, not straight to our account);
// the POS number, transaction and provider are filled in all the same. A refund
// goes back to the card (code 2 in the refund list).
const PAYMENT_CODE_PROVIDER = 4;
const REFUND_CODE_CARD = 2;
// The e-shop runs on its own domain (1), not on a platform (2).
const ESHOP_OWN_DOMAIN = 1;

export interface AuditSale {
  doc: SaleDocument;
  orderedAt: Date;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildAuditXml(params: {
  seller: SellerInfoDto;
  year: number;
  month: number;
  createdAt: Date;
  sales: AuditSale[];
  refunds: SaleDocument[];
}): string {
  const { seller, year, month, sales, refunds } = params;
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<audit>');
  out.push(`\t<eik>${esc(seller.eik.trim())}</eik>`);
  out.push(`\t<e_shop_n>${esc(seller.eshopNumber.trim())}</e_shop_n>`);
  out.push(`\t<domain_name>${esc(seller.domain.trim())}</domain_name>`);
  out.push(`\t<e_shop_type>${ESHOP_OWN_DOMAIN}</e_shop_type>`);
  out.push(`\t<creation_date>${sofiaDateTime(params.createdAt).date}</creation_date>`);
  out.push(`\t<mon>${String(month).padStart(2, '0')}</mon>`);
  out.push(`\t<god>${year}</god>`);
  out.push('\t<order>');
  for (const { doc, orderedAt } of sales) {
    const lines = doc.lines as unknown as { name: string; quantity: number; unitPriceCents: number; amountCents: number }[];
    out.push('\t\t<orderenum>');
    out.push(`\t\t\t<ord_n>${esc(doc.orderNumber)}</ord_n>`);
    out.push(`\t\t\t<ord_d>${sofiaDateTime(orderedAt).date}</ord_d>`);
    out.push(`\t\t\t<doc_n>${formatDocumentNumber(doc.number)}</doc_n>`);
    out.push(`\t\t\t<doc_date>${sofiaDateTime(doc.issuedAt).date}</doc_date>`);
    out.push('\t\t\t<art>');
    for (const line of lines) {
      out.push('\t\t\t\t<artenum>');
      out.push(`\t\t\t\t\t<art_name>${esc(line.name.slice(0, 200))}</art_name>`);
      out.push(`\t\t\t\t\t<art_quant>${line.quantity}</art_quant>`);
      out.push(`\t\t\t\t\t<art_price>${formatAmount(line.unitPriceCents)}</art_price>`);
      out.push('\t\t\t\t\t<art_vat_rate>0</art_vat_rate>');
      out.push('\t\t\t\t\t<art_vat>0.00</art_vat>');
      out.push(`\t\t\t\t\t<art_sum>${formatAmount(line.amountCents)}</art_sum>`);
      out.push('\t\t\t\t</artenum>');
    }
    out.push('\t\t\t</art>');
    out.push(`\t\t\t<ord_total1>${formatAmount(doc.totalCents)}</ord_total1>`);
    out.push('\t\t\t<ord_disc>0.00</ord_disc>');
    out.push('\t\t\t<ord_vat>0.00</ord_vat>');
    out.push(`\t\t\t<ord_total2>${formatAmount(doc.totalCents)}</ord_total2>`);
    out.push(`\t\t\t<paym>${PAYMENT_CODE_PROVIDER}</paym>`);
    out.push(`\t\t\t<pos_n>${esc(doc.posNumber)}</pos_n>`);
    out.push(`\t\t\t<trans_n>${esc(doc.transactionRef)}</trans_n>`);
    out.push(`\t\t\t<proc_id>${esc(`${seller.providerVatId.trim()} ${seller.providerName.trim()}`.slice(0, 200))}</proc_id>`);
    out.push('\t\t</orderenum>');
  }
  out.push('\t</order>');
  if (refunds.length > 0) {
    out.push(`\t<r_ord>${refunds.length}</r_ord>`);
    out.push('\t<rorder>');
    for (const refund of refunds) {
      out.push('\t\t<rorderenum>');
      out.push(`\t\t\t<r_ord_n>${esc(refund.orderNumber)}</r_ord_n>`);
      out.push(`\t\t\t<r_amount>${formatAmount(refund.totalCents)}</r_amount>`);
      out.push(`\t\t\t<r_date>${sofiaDateTime(refund.issuedAt).date}</r_date>`);
      out.push(`\t\t\t<r_paym>${REFUND_CODE_CARD}</r_paym>`);
      out.push('\t\t</rorderenum>');
    }
    out.push('\t</rorder>');
    out.push(`\t<r_total>${formatAmount(refunds.reduce((sum, r) => sum + r.totalCents, 0))}</r_total>`);
  }
  out.push('</audit>');
  return out.join('\r\n') + '\r\n';
}

/** Checks the file against the NRA's XSD; returns the problems (empty = valid). */
export async function validateAuditXml(utf8Xml: string): Promise<string[]> {
  const result = await validateXML({
    xml: [{ fileName: 'audit.xml', contents: utf8Xml }],
    schema: [{ fileName: 'dec_audit.xsd', contents: NRA_AUDIT_XSD }],
  });
  return result.valid ? [] : result.errors.map((e) => e.message);
}
