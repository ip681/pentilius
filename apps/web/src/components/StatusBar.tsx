'use client';

import type { PlayerProfileDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { StatBar } from './StatBar';

export function StatusBar({ profile }: { profile: PlayerProfileDto }) {
  const t = useTranslations();

  return (
    <div className="border-b border-panelBorder bg-inkRaised px-3 py-2.5 md:px-7">
      {/* Energy/XP move into the TopBar itself at md+ (between the logo and account cluster) — shown here only below that breakpoint. */}
      <div className="mb-2.5 flex flex-row items-center gap-2 sm:gap-3 md:hidden">
        <StatBar
          label={t('dashboard.energy')}
          current={profile.energy.current}
          max={profile.energy.max}
          colorClass="bg-energy"
          countdownTarget={profile.energy.nextRegenAt}
        />
        <StatBar label={`${t('dashboard.xp')} · ${t('dashboard.level')} ${profile.level}`} current={profile.xp} max={profile.xpForNextLevel} colorClass="bg-gold" />
      </div>
      <div className="flex gap-5 overflow-x-auto text-xs text-textMuted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="whitespace-nowrap">
          {t('resource.METAL')} <strong className="ml-1 font-semibold text-text">{profile.resources.metal.toLocaleString()}</strong>
        </span>
        <span className="whitespace-nowrap">
          {t('resource.CRYSTAL')} <strong className="ml-1 font-semibold text-text">{profile.resources.crystal.toLocaleString()}</strong>
        </span>
        <span className="whitespace-nowrap">
          {t('resource.CREDITS')} <strong className="ml-1 font-semibold text-text">{profile.resources.credits.toLocaleString()}</strong>
        </span>
      </div>
    </div>
  );
}
