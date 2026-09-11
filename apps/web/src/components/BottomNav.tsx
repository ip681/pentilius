'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { AssetIcon } from '@/components/AssetIcon';
import { Link } from '@/i18n/navigation';
import { NAV_ITEMS } from '@/lib/nav-items';

// Mobile-only, fixed to the bottom, scrolling horizontally — covers every
// destination (the Sidebar's desktop equivalent), reusing the same icon
// assets already made for the Command Center's Quick Access cards.
export function BottomNav({ hasUnreadFriends }: { hasUnreadFriends: boolean }) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-panelBorder bg-inkRaised md:hidden">
      <div className="flex h-16 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.endsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex h-full w-16 shrink-0 items-center justify-center transition-colors ${active ? 'bg-accentBgHover' : ''}`}
            >
              <AssetIcon
                assetId={`dashboard.${item.iconKey}.icon`}
                alt={t(item.labelKey)}
                className={`h-9 w-9 object-contain transition-all ${active ? 'opacity-100' : 'opacity-80'}`}
                fallback={<span className={`text-lg font-semibold ${active ? 'text-accent' : 'text-textMuted'}`}>{t(item.labelKey).charAt(0)}</span>}
              />
              {item.href === '/friends' && hasUnreadFriends && <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-danger" />}
              <span className="sr-only">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
