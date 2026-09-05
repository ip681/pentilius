'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex overflow-hidden rounded-md border border-accent text-[10px] uppercase">
      {routing.locales.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => router.replace(pathname, { locale: option })}
          className={`px-2.5 py-1.5 ${option === locale ? 'bg-accentBgHover text-text' : 'bg-accentBg text-textMuted hover:text-text'}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
