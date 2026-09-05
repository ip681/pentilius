import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function HomePage() {
  const t = useTranslations();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">{t('common.appName')}</h1>
      <Link href="/login" className="underline">
        {t('auth.login')}
      </Link>
    </main>
  );
}
