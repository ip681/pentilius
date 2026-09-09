'use client';

import type { PlayerProfileDto, ResourceType } from '@pentilius/shared';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { AssetIcon } from '@/components/AssetIcon';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PlayerAvatarFrame } from '@/components/PlayerAvatarFrame';
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
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <Link href="/dashboard" className="shrink-0">
            <Image src="/logo.png" alt="Pentilius" width={160} height={96} className="h-14 w-auto" priority />
          </Link>
          {loggedIn && profile && (
            // Identity cluster right after the logo (owner decision, 2026-09-09) —
            // was previously in the right-side account cluster. min-w-0 + truncate
            // on the username is what keeps a long name from ever squeezing the
            // logo, same protection the mobile row already relies on elsewhere.
            <Link href={`/players/${profile.id}`} className="flex min-w-0 items-center gap-2 hover:opacity-80">
              <PlayerAvatarFrame avatarKey={profile.selectedAvatarKey} frameKey={profile.selectedFrameKey} className="h-10 w-10 shrink-0 md:h-11 md:w-11" />
              <span className="min-w-0 truncate text-xs font-semibold sm:text-sm">{profile.username}</span>
            </Link>
          )}
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
              colorClass="bg-gold"
              countdownTarget={profile.energy.nextRegenAt}
            />
            <StatBar
              label={`${t('dashboard.level')} ${profile.level}`}
              icon="interface.experience.icon"
              current={profile.xp}
              max={profile.xpForNextLevel}
              colorClass="bg-energy"
            />
          </div>
        )}

        {loggedIn && profile ? (
          <div className="flex shrink-0 items-center gap-1.5 text-xs md:gap-3">
            <Link
              href="/settings"
              title={t('topbar.settings')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:opacity-70 sm:h-8 sm:w-8"
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
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:opacity-70 sm:h-8 sm:w-8"
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
              colorClass="bg-gold"
              countdownTarget={profile.energy.nextRegenAt}
            />
            <StatBar
              label={`${t('dashboard.level')} ${profile.level}`}
              icon="interface.experience.icon"
              current={profile.xp}
              max={profile.xpForNextLevel}
              colorClass="bg-energy"
            />
          </div>
          <ResourcesRow profile={profile} className="flex items-center justify-center gap-4 text-[11px]" iconClassName="h-3 w-3" />
        </div>
      )}
    </header>
  );
}
