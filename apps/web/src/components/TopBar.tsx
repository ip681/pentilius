'use client';

import type { PlayerProfileDto } from '@pentilius/shared';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Link, useRouter } from '@/i18n/navigation';
import { getProfile } from '@/lib/api-client';
import { clearTokens, isAuthenticated } from '@/lib/auth';

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      setLoggedIn(false);
      return;
    }
    getProfile()
      .then((data) => {
        setProfile(data);
        setLoggedIn(true);
      })
      .catch(() => {
        // Stored token is missing/expired — treat as logged out rather than showing a dead top bar.
        clearTokens();
        setLoggedIn(false);
      });
  }, []);

  function handleLogout() {
    clearTokens();
    router.push('/login');
  }

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between gap-3 border-b border-panelBorder bg-inkRaised px-3 md:px-7">
      <div className="flex items-center gap-3">
        {loggedIn && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={t('topbar.menu')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-panelBorder text-text md:hidden"
          >
            <span className="sr-only">{t('topbar.menu')}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <Image src="/logo.png" alt="Pentilius" width={160} height={96} className="h-8 w-auto md:h-10" priority />
      </div>

      {profile && (
        <div className="hidden flex-wrap gap-6 text-xs text-textMuted lg:flex">
          <span>
            {t('resource.METAL')} <strong className="ml-1 font-semibold text-text">{profile.resources.metal.toLocaleString()}</strong>
          </span>
          <span>
            {t('resource.CRYSTAL')} <strong className="ml-1 font-semibold text-text">{profile.resources.crystal.toLocaleString()}</strong>
          </span>
          <span>
            {t('resource.OXYGEN')} <strong className="ml-1 font-semibold text-text">{profile.resources.oxygen.toLocaleString()}</strong>
          </span>
          <span>
            {t('resource.CREDITS')} <strong className="ml-1 font-semibold text-text">{profile.resources.credits.toLocaleString()}</strong>
          </span>
          <span>
            {t('resource.UPGRADE_STONES')} <strong className="ml-1 font-semibold text-text">{profile.resources.upgradeStones.toLocaleString()}</strong>
          </span>
        </div>
      )}

      {loggedIn && profile ? (
        <div className="flex items-center gap-2 text-xs md:gap-4">
          <div className="hidden items-center gap-1.5 text-positive sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" />
            {t('topbar.online')}
          </div>
          <div className="text-right">
            <div className="font-semibold">
              {profile.username} <span className="hidden font-normal text-textFaint sm:inline">· {t(`race.${profile.race}.name`)}</span>
            </div>
            <div className="hidden text-textFaint sm:block">
              {t('dashboard.level')} {profile.level} · {t('dashboard.energy')} {profile.energy.current}/{profile.energy.max}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-accent bg-accentBg px-2.5 py-1.5 text-[10px] uppercase hover:bg-accentBgHover md:px-3"
          >
            {t('topbar.logout')}
          </button>
          <LanguageSwitcher />
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <span className="hidden items-center gap-1.5 text-textFaint sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-textFaint" />
            {t('topbar.loggedOut')}
          </span>
          <Link href="/login" className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-[10px] uppercase hover:bg-accentBgHover">
            {t('auth.login')}
          </Link>
          <LanguageSwitcher />
        </div>
      )}
    </header>
  );
}
