import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function HomePage() {
  const t = useTranslations();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ink px-4 text-center text-text">
      <Image src="/logo.png" alt={t('common.appName')} width={280} height={168} className="h-auto w-[280px]" priority />
      <Link
        href="/login"
        className="rounded-md border border-accent bg-accentBg px-6 py-2.5 text-xs uppercase tracking-wide hover:bg-accentBgHover"
      >
        {t('auth.login')}
      </Link>
    </main>
  );
}
