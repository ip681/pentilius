'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// The public information pages (owner decision, 2026-10-12) — linked from the
// login screen, Settings and every info page's footer.
export const INFO_PAGES = [
  { key: 'about', href: '/about' },
  { key: 'lore', href: '/lore' },
  { key: 'rules', href: '/rules' },
  { key: 'privacy', href: '/privacy' },
  { key: 'support', href: '/support' },
  { key: 'deleteAccount', href: '/delete-account' },
] as const;

export function InfoLinks({ className }: { className?: string }) {
  const t = useTranslations();
  return (
    <nav className={className ?? 'flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-textFaint'}>
      {INFO_PAGES.map((page) => (
        <Link key={page.key} href={page.href} className="hover:text-text hover:underline">
          {t(`pages.${page.key}.title`)}
        </Link>
      ))}
    </nav>
  );
}
