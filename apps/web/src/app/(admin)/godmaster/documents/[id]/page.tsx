'use client';

import type { SaleDocumentDto } from '@pentilius/shared';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { SaleDocumentView } from '@/components/SaleDocumentView';

// Same API address and stored token as the godmaster page (app/(admin)/godmaster/page.tsx).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const TOKEN_KEY = 'godmaster.accessToken';

/**
 * A sale or refund document opened from godmaster (owner decision, 2026-10-23):
 * the very same layout the player sees. With ?print=1 ("Изтегли") the browser's
 * print dialog opens by itself once the QR code is drawn — "Save as PDF" there.
 */
function GodmasterDocument() {
  const { id } = useParams<{ id: string }>();
  const autoPrint = useSearchParams().get('print') === '1';
  const [doc, setDoc] = useState<SaleDocumentDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Effects can run twice (React's development checks), so the dialog is opened once only.
  const printed = useRef(false);

  function printOnce() {
    if (printed.current) return;
    printed.current = true;
    setTimeout(() => window.print(), 300);
  }

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    fetch(`${API_BASE_URL}/admin/payments/documents/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? 'Влез отново в годмастер.' : `Документът не можа да се зареди (${res.status}).`);
        setDoc((await res.json()) as SaleDocumentDto);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }, [id]);

  return (
    <div className="min-h-screen bg-ink px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-2xl justify-end print:hidden">
        {doc && (
          <button type="button" onClick={() => window.print()} className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs uppercase text-text hover:bg-accentBgHover">
            Принтирай / запази като PDF
          </button>
        )}
      </div>
      {error && <p className="mx-auto max-w-2xl text-sm text-danger">{error}</p>}
      {doc && <SaleDocumentView doc={doc} onReady={autoPrint ? printOnce : undefined} />}
    </div>
  );
}

export default function GodmasterDocumentPage() {
  return (
    <Suspense>
      <GodmasterDocument />
    </Suspense>
  );
}
