'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { AssetIcon } from '@/components/AssetIcon';
import { Link } from '@/i18n/navigation';
import { NAV_ITEMS } from '@/lib/nav-items';

// Desktop-only now — the Command Center's Quick Access grid covers every one
// of these destinations, so mobile relies on that (plus the BottomNav)
// instead of a slide-in menu. Same order/icons as BottomNav for consistency.
export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <aside className="hidden w-[220px] shrink-0 overflow-y-auto border-r border-panelBorder bg-inkRaised p-4 md:block">
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.endsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded px-3 py-2.5 text-base ${active ? 'bg-accentBgHover text-text' : 'text-textMuted hover:bg-panel hover:text-text'}`}
            >
              <AssetIcon
                assetId={`dashboard.${item.iconKey}.icon`}
                alt=""
                className="h-6 w-6 shrink-0 object-contain"
                fallback={<span className="flex h-6 w-6 shrink-0 items-center justify-center text-sm font-semibold">{t(item.labelKey).charAt(0)}</span>}
              />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
