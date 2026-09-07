'use client';

import type { PlayerProfileDto } from '@pentilius/shared';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { AssetIcon } from '@/components/AssetIcon';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { StatBar } from '@/components/StatBar';
import { Link, useRouter } from '@/i18n/navigation';
import { clearTokens } from '@/lib/auth';

export function TopBar({
  profile,
  loggedIn,
}: {
  profile: PlayerProfileDto | null;
  loggedIn: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();

  function handleLogout() {
    clearTokens();
    router.push('/login');
  }

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between gap-3 border-b border-panelBorder bg-inkRaised px-3 md:px-7">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Image src="/logo.png" alt="Pentilius" width={160} height={96} className="h-8 w-auto md:h-10" priority />
        </Link>
      </div>

      {loggedIn && profile && (
        <div className="hidden max-w-md flex-1 items-center gap-4 px-4 md:flex">
          <StatBar
            label={t('dashboard.energy')}
            current={profile.energy.current}
            max={profile.energy.max}
            colorClass="bg-energy"
            countdownTarget={profile.energy.nextRegenAt}
          />
          <StatBar
            label={`${t('dashboard.xp')} · ${t('dashboard.level')} ${profile.level}`}
            current={profile.xp}
            max={profile.xpForNextLevel}
            colorClass="bg-gold"
          />
        </div>
      )}

      {loggedIn && profile ? (
        <div className="flex items-center gap-2 text-xs md:gap-4">
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 font-semibold">
              <AssetIcon
                assetId={`races.${profile.race.toLowerCase()}.icon`}
                alt={t(`race.${profile.race}.name`)}
                className="h-4 w-4 shrink-0 object-contain"
                fallback={<span className="text-[9px] font-normal text-textFaint">{t(`race.${profile.race}.name`).charAt(0)}</span>}
              />
              <Link href={`/players/${profile.id}`} className="hover:text-accent">
                {profile.username}
              </Link>
            </div>
          </div>
          {/* Text label for now — swap for a gear icon once one is prepared. */}
          <Link
            href="/settings"
            className="rounded-md border border-accent bg-accentBg px-2.5 py-1.5 text-[10px] uppercase hover:bg-accentBgHover md:px-3"
          >
            {t('topbar.settings')}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-accent bg-accentBg px-2.5 py-1.5 text-[10px] uppercase hover:bg-accentBgHover md:px-3"
          >
            {t('topbar.logout')}
          </button>
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
