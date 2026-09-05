'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Link } from '@/i18n/navigation';

const GROUPS = [
  {
    titleKey: 'sidebar.command',
    items: [
      { href: '/dashboard', labelKey: 'nav.overview' },
      { href: '/base', labelKey: 'nav.base' },
      { href: '/ship', labelKey: 'nav.ship' },
    ],
  },
  {
    titleKey: 'sidebar.operations',
    items: [
      { href: '/zones', labelKey: 'nav.zones' },
      { href: '/reports', labelKey: 'nav.reports' },
    ],
  },
];

export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <aside className="w-[220px] shrink-0 border-r border-panelBorder bg-inkRaised p-5">
      {GROUPS.map((group) => (
        <div key={group.titleKey} className="mb-7">
          <div className="mb-2 px-3 text-[10px] uppercase tracking-widest text-textFaint">{t(group.titleKey)}</div>
          <nav className="flex flex-col gap-1">
            {group.items.map((item) => {
              const active = pathname?.endsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded px-3 py-2 text-sm ${active ? 'bg-panel text-text' : 'text-textMuted hover:bg-panel hover:text-text'}`}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </aside>
  );
}
