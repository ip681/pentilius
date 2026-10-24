'use client';

import type { SaleDocumentDto } from '@pentilius/shared';
import bgMessages from '@pentilius/shared/messages/bg.json';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SaleDocumentView } from '@/components/SaleDocumentView';
import { Link } from '@/i18n/navigation';
import { getSaleDocument } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

// The document page's own labels follow the document: always Bulgarian.
const L = bgMessages.saleDocument;

/**
 * A player's sale or refund document (owner decision, 2026-10-23): given
 * electronically right after paying and in Settings → My purchases.
 */
export default function SaleDocumentPage() {
  useRequireAuth();
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<SaleDocumentDto | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getSaleDocument(id)
      .then(setDoc)
      .catch(() => setError(true));
  }, [id]);

  return (
    <div className="min-h-screen bg-ink px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between gap-2 print:hidden">
        <Link href="/settings" className="text-xs text-accent underline">
          ← {L.back}
        </Link>
        {doc && (
          <button type="button" onClick={() => window.print()} className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase text-text hover:bg-accentBgHover">
            {L.print}
          </button>
        )}
      </div>
      {error && <p className="mx-auto max-w-2xl text-sm text-danger">{L.loadError}</p>}
      {doc && <SaleDocumentView doc={doc} />}
    </div>
  );
}
