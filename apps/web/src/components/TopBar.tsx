'use client';

import type { PlayerProfileDto } from '@pentilius/shared';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { getProfile } from '@/lib/api-client';
import { clearTokens, isAuthenticated } from '@/lib/auth';

export function TopBar() {
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
    <header className="flex h-16 items-center justify-between border-b border-panelBorder bg-inkRaised px-7">
      <Image src="/logo.png" alt="Pentilius" width={160} height={96} className="h-10 w-auto" priority />

      {profile && (
        <div className="flex flex-wrap gap-6 text-xs text-textMuted">
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
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-positive">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" />
            {t('topbar.online')}
          </div>
          <div className="text-right">
            <div className="font-semibold">{profile.email}</div>
            <div className="text-textFaint">
              {t('dashboard.level')} {profile.level} · {t('dashboard.energy')} {profile.energy.current}/{profile.energy.max}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-[10px] uppercase hover:bg-accentBgHover"
          >
            {t('topbar.logout')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-textFaint">
            <span className="h-1.5 w-1.5 rounded-full bg-textFaint" />
            {t('topbar.loggedOut')}
          </span>
          <Link href="/login" className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-[10px] uppercase hover:bg-accentBgHover">
            {t('auth.login')}
          </Link>
        </div>
      )}
    </header>
  );
}
