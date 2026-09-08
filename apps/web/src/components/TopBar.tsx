'use client';

import type { PlayerProfileDto, ResourceType } from '@pentilius/shared';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { AssetIcon } from '@/components/AssetIcon';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ResourceIcon } from '@/components/ResourceIcon';
import { StatBar } from '@/components/StatBar';
import { Link, useRouter } from '@/i18n/navigation';
import { clearTokens } from '@/lib/auth';

function ResourcesRow({ profile, className, iconClassName }: { profile: PlayerProfileDto; className?: string; iconClassName?: string }) {
  const amounts: [ResourceType, number][] = [
    ['METAL', profile.resources.metal],
    ['CRYSTAL', profile.resources.crystal],
    ['CREDITS', profile.resources.credits],
  ];
  return (
    <div className={className}>
      {amounts.map(([type, amount]) => (
        <span key={type} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <ResourceIcon type={type} className={iconClassName ?? 'h-4 w-4'} />
          <strong className="font-semibold text-text">{amount.toLocaleString()}</strong>
        </span>
      ))}
    </div>
  );
}

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
    <header className="sticky top-0 z-50 border-b border-panelBorder bg-inkRaised">
      <div className="flex h-16 items-center justify-between gap-3 px-3 md:px-7">
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/dashboard">
            <Image src="/logo.png" alt="Pentilius" width={160} height={96} className="h-10 w-auto md:h-14" priority />
          </Link>
        </div>

        {loggedIn && profile && (
          // Desktop only — left-aligned, right after the logo, not tucked next to the account cluster.
          <ResourcesRow profile={profile} className="hidden items-center gap-3 text-xs md:flex" />
        )}

        {loggedIn && profile && (
          <div className="hidden max-w-md flex-1 items-center gap-4 px-4 md:flex">
            <StatBar
              label={t('dashboard.energy')}
              icon="interface.energy.icon"
              hideLabelText
              current={profile.energy.current}
              max={profile.energy.max}
              colorClass="bg-energy"
              countdownTarget={profile.energy.nextRegenAt}
            />
            <StatBar
              label={`${t('dashboard.level')} ${profile.level}`}
              icon="interface.experience.icon"
              current={profile.xp}
              max={profile.xpForNextLevel}
              colorClass="bg-gold"
            />
          </div>
        )}

        {loggedIn && profile ? (
          <div className="flex min-w-0 shrink items-center gap-1.5 text-xs md:shrink-0 md:gap-4">
            <div className="min-w-0 text-right">
              <div className="flex items-center justify-end gap-1.5 font-semibold">
                <AssetIcon
                  assetId={`races.${profile.race.toLowerCase()}.icon`}
                  alt={t(`race.${profile.race}.name`)}
                  className="h-4 w-4 shrink-0 object-contain"
                  fallback={<span className="text-[9px] font-normal text-textFaint">{t(`race.${profile.race}.name`).charAt(0)}</span>}
                />
                <Link href={`/players/${profile.id}`} className="max-w-[72px] truncate hover:text-accent sm:max-w-none">
                  {profile.username}
                </Link>
              </div>
            </div>
            <Link
              href="/settings"
              title={t('topbar.settings')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-accent bg-accentBg hover:bg-accentBgHover sm:h-8 sm:w-8"
            >
              <AssetIcon
                assetId="interface.settings.icon"
                alt={t('topbar.settings')}
                className="h-4 w-4 object-contain sm:h-5 sm:w-5"
                fallback={<span className="text-xs font-semibold">{t('topbar.settings').charAt(0)}</span>}
              />
              <span className="sr-only">{t('topbar.settings')}</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              title={t('topbar.logout')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-accent bg-accentBg hover:bg-accentBgHover sm:h-8 sm:w-8"
            >
              <AssetIcon
                assetId="interface.exit.icon"
                alt={t('topbar.logout')}
                className="h-4 w-4 object-contain sm:h-5 sm:w-5"
                fallback={<span className="text-xs font-semibold">{t('topbar.logout').charAt(0)}</span>}
              />
              <span className="sr-only">{t('topbar.logout')}</span>
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
      </div>

      {/* Mobile-only second row — same header block, no separate bar/border — merges what used to be StatusBar's two rows into one, plus resources (kept out of the top row so a long username/large numbers can never squeeze the logo). Bars fill the full width; resources sit centered underneath in a smaller font so the numbers don't visually overpower the bars. */}
      {loggedIn && profile && (
        <div className="flex flex-col gap-1.5 border-t border-panelBorder px-3 py-2 md:hidden">
          <div className="flex items-center gap-3">
            <StatBar
              label={t('dashboard.energy')}
              icon="interface.energy.icon"
              hideLabelText
              current={profile.energy.current}
              max={profile.energy.max}
              colorClass="bg-energy"
              countdownTarget={profile.energy.nextRegenAt}
            />
            <StatBar
              label={`${t('dashboard.level')} ${profile.level}`}
              icon="interface.experience.icon"
              current={profile.xp}
              max={profile.xpForNextLevel}
              colorClass="bg-gold"
            />
          </div>
          <ResourcesRow profile={profile} className="flex items-center justify-center gap-4 text-[11px]" iconClassName="h-3 w-3" />
        </div>
      )}
    </header>
  );
}
