'use client';

import type { SaleDocumentDto } from '@pentilius/shared';
import bgMessages from '@pentilius/shared/messages/bg.json';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/format-price';

// The document is a legal record for a Bulgarian sale (Наредба Н-18, чл. 52о),
// so it is always in Bulgarian, whatever language the game is shown in. Plain
// JSON import (no next-intl), so godmaster can show the very same document.
const L = bgMessages.saleDocument;

function sofia(iso: string): string {
  return new Intl.DateTimeFormat('bg-BG', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/**
 * A sale or refund document laid out like paper (owner decision, 2026-10-23),
 * the same for the player and in godmaster, so it prints or saves as PDF from
 * the browser. `onReady` fires once the QR code (if any) is drawn.
 */
export function SaleDocumentView({ doc, onReady }: { doc: SaleDocumentDto; onReady?: () => void }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!doc.qrPayload) {
      onReady?.();
      return;
    }
    QRCode.toDataURL(doc.qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 200 })
      .then((url) => setQr(url))
      .catch(() => setQr(null))
      .finally(() => onReady?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.qrPayload]);

  const money = (cents: number) => formatPrice(cents, doc.currency, 'bg');
  const refund = doc.kind === 'REFUND';

  return (
    <article className="mx-auto max-w-2xl rounded-md bg-white p-6 text-sm text-black shadow print:max-w-none print:rounded-none print:shadow-none">
      {doc.test && <p className="mb-4 rounded border-2 border-red-600 px-3 py-2 text-center font-bold text-red-600">{L.testBanner}</p>}

      <h1 className="text-lg font-bold">{refund ? L.titleRefund : L.titleSale}</h1>
      <p className="mb-4">
        № <span className="font-mono font-semibold">{doc.number}</span> · {L.date}: {sofia(doc.issuedAt)}
      </p>
      {refund && doc.saleNumber && doc.saleIssuedAt && (
        <p className="mb-4">
          {L.refundOf} № <span className="font-mono">{doc.saleNumber}</span> / {sofia(doc.saleIssuedAt)}
        </p>
      )}

      <section className="mb-4">
        <h2 className="mb-1 font-semibold">{L.seller}</h2>
        <p>{doc.seller.name}</p>
        <p>
          {L.eik}: {doc.seller.eik}
        </p>
        <p>
          {L.registeredAddress}: {doc.seller.address}
        </p>
        <p>
          {L.contact}: {doc.seller.contact}
        </p>
      </section>

      <section className="mb-4">
        <p>
          {L.eshop}: {doc.seller.domain} · {L.eshopNumber}: {doc.eshopNumber}
        </p>
        <p>
          {L.order}: <span className="break-all font-mono text-xs">{doc.orderNumber}</span>
        </p>
        <p>
          {L.transaction}: <span className="break-all font-mono text-xs">{doc.transactionRef}</span>
        </p>
      </section>

      <div className="mb-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 pr-2">{L.item}</th>
              <th className="py-1 pr-2">{L.taxGroup}</th>
              <th className="py-1 pr-2 text-right">{L.quantity}</th>
              <th className="py-1 pr-2 text-right">{L.unitPrice}</th>
              <th className="py-1 text-right">{L.amount}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line, index) => (
              <tr key={index} className="border-b border-gray-300">
                <td className="py-1 pr-2">{line.name}</td>
                <td className="py-1 pr-2">{line.taxGroup}</td>
                <td className="py-1 pr-2 text-right">{line.quantity}</td>
                <td className="py-1 pr-2 text-right">{money(line.unitPriceCents)}</td>
                <td className="py-1 text-right">{money(line.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mb-1 text-base font-bold">
        {refund ? L.totalRefund : L.total}: {money(doc.totalCents)}
      </p>
      <p className="mb-1">{L.noVat}</p>
      <p className="mb-4">
        {L.paymentMethod}: {doc.paymentMethod}
      </p>

      {qr && (
        // At least 18 × 18 mm when printed; a generated data URL, so next/image has nothing to optimize.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={L.qrAlt} className="h-40 w-40 print:h-[30mm] print:w-[30mm]" />
      )}
    </article>
  );
}
