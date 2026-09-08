import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        {/* Preload the handful of icons that appear on every logged-in page
            (TopBar/StatusBar) so they're already cached before first paint —
            avoids the pop-in flicker on navigation. */}
        <link rel="preload" as="image" href="/assets/interface/energy.png" />
        <link rel="preload" as="image" href="/assets/interface/experience.png" />
        <link rel="preload" as="image" href="/assets/interface/settings.png" />
        <link rel="preload" as="image" href="/assets/interface/exit.png" />
        <link rel="preload" as="image" href="/assets/races/luxari.png" />
        <link rel="preload" as="image" href="/assets/races/vorlun.png" />
        <link rel="preload" as="image" href="/assets/races/zaryth.png" />
        <link rel="preload" as="image" href="/assets/races/thalion.png" />
        <link rel="preload" as="image" href="/assets/races/nexar.png" />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
