'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export function GameNav() {
  const t = useTranslations('nav');

  return (
    <nav className="flex gap-4 border-b p-4 text-sm">
      <Link href="/base">{t('base')}</Link>
      <Link href="/ship">{t('ship')}</Link>
      <Link href="/inventory">{t('inventory')}</Link>
      <Link href="/zones">{t('zones')}</Link>
      <Link href="/reports">{t('reports')}</Link>
    </nav>
  );
}
