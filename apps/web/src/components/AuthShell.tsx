'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { InfoLinks } from '@/components/InfoLinks';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

/** The logged-out page frame (logo + panel) shared by the email-link pages; matches the login page. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-4 py-10 text-text">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-6 flex justify-center">
          <Image src="/logo.png" alt="Pentilius" width={220} height={132} className="h-auto w-[220px]" priority />
        </div>
        <div className="rounded-lg border border-panelBorder bg-panel p-6">
          <h1 className="mb-4 text-sm font-semibold uppercase tracking-wide">{title}</h1>
          {children}
        </div>
        <InfoLinks className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-textFaint" />
      </div>
    </main>
  );
}
