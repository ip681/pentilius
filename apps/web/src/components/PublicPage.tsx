'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { InfoLinks } from '@/components/InfoLinks';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Link } from '@/i18n/navigation';
import { isAuthenticated } from '@/lib/auth';
import { fillLegal, LEGAL } from '@/lib/legal';

interface PageSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

interface PageContent {
  title: string;
  intro?: string;
  sections: PageSection[];
}

/**
 * A public information page (owner decision, 2026-10-12): readable without
 * logging in (app stores link to them directly). The whole text lives in
 * messages/<locale>.json under pages.<pageKey>; operator details are filled in
 * from lib/legal.ts.
 */
export function PublicPage({ pageKey, showUpdated = false }: { pageKey: string; showUpdated?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => setLoggedIn(isAuthenticated()), []);

  const content = t.raw(`pages.${pageKey}`) as PageContent;
  const fill = (text: string) => fillLegal(text, locale);

  return (
    <main className="min-h-screen bg-ink px-4 py-8 text-text">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href={loggedIn ? '/dashboard' : '/login'}
            className="rounded-md border border-accent bg-accentBg px-4 py-2 text-sm text-text hover:bg-accentBgHover"
          >
            ← {loggedIn ? t('pages.backToGame') : t('pages.backToLogin')}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="mb-6 flex justify-center">
          {/* The logo is a link back too — to the game, or to login when logged out. */}
          <Link href={loggedIn ? '/dashboard' : '/login'} className="transition-opacity hover:opacity-80">
            <Image src="/logo.png" alt="Pentilius" width={160} height={96} className="h-auto w-[160px]" />
          </Link>
        </div>

        <article className="rounded-lg border border-panelBorder bg-panel p-6 text-sm leading-relaxed">
          {/* Headings in the same grey as the text (owner decision, 2026-10-15) — set apart by size and weight only. */}
          <h1 className="mb-2 text-xl font-semibold text-textMuted">{content.title}</h1>
          {showUpdated && (
            <p className="mb-4 text-[11px] text-textFaint">
              {t('pages.updated', { updated: new Date(LEGAL.updated).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB') })}
            </p>
          )}
          {content.intro && <p className="mb-5 text-textMuted">{fill(content.intro)}</p>}

          {content.sections.map((section, index) => (
            <section key={index} className="mb-5 last:mb-0">
              {section.heading && <h2 className="mb-2 text-base font-semibold text-textMuted">{fill(section.heading)}</h2>}
              {section.paragraphs?.map((paragraph, i) => (
                <p key={i} className="mb-2 text-textMuted">
                  {fill(paragraph)}
                </p>
              ))}
              {section.bullets && (
                <ul className="mb-2 list-disc space-y-1 pl-5 text-textMuted">
                  {section.bullets.map((bullet, i) => (
                    <li key={i}>{fill(bullet)}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>

        <InfoLinks className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-textFaint" />
      </div>
    </main>
  );
}
