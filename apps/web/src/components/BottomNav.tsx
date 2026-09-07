'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { AssetIcon } from '@/components/AssetIcon';
import { Link } from '@/i18n/navigation';
import { NAV_ITEMS } from '@/lib/nav-items';

// Mobile-only, fixed to the bottom, scrolling horizontally — covers every
// destination (the Sidebar's desktop equivalent), reusing the same icon
// assets already made for the Command Center's Quick Access cards.
export function BottomNav() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-panelBorder bg-inkRaised md:hidden">
      <div className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.endsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex w-16 shrink-0 items-center justify-center rounded-lg py-2 transition-colors ${active ? 'bg-well' : ''}`}
            >
              <AssetIcon
                assetId={`dashboard.${item.iconKey}.icon`}
                alt={t(item.labelKey)}
                className="h-9 w-9 object-contain"
                fallback={<span className={`text-lg font-semibold ${active ? 'text-accent' : 'text-textMuted'}`}>{t(item.labelKey).charAt(0)}</span>}
              />
              <span className="sr-only">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
