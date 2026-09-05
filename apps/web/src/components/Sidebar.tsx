'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Link } from '@/i18n/navigation';

const GROUPS = [
  {
    titleKey: 'sidebar.command',
    items: [
      { href: '/dashboard', labelKey: 'nav.overview' },
      { href: '/clans', labelKey: 'nav.clans' },
      { href: '/base', labelKey: 'nav.base' },
      { href: '/research', labelKey: 'nav.research' },
      { href: '/ship', labelKey: 'nav.ship' },
    ],
  },
  {
    titleKey: 'sidebar.operations',
    items: [
      { href: '/zones', labelKey: 'nav.zones' },
      { href: '/bosses', labelKey: 'nav.bosses' },
      { href: '/pvp', labelKey: 'nav.pvp' },
      { href: '/expeditions', labelKey: 'nav.expeditions' },
      { href: '/reports', labelKey: 'nav.reports' },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <>
      {open && <div className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/60 md:hidden" onClick={onClose} />}

      <aside
        className={`fixed bottom-0 left-0 top-16 z-40 w-[240px] transform overflow-y-auto border-r border-panelBorder bg-inkRaised p-5 transition-transform duration-200 ease-out md:static md:z-auto md:w-[220px] md:translate-x-0 md:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
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
                    onClick={onClose}
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
    </>
  );
}
