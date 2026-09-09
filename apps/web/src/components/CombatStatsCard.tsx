'use client';

import type { CombatStatsDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { AssetIcon } from './AssetIcon';
import { PlayerAvatarFrame } from './PlayerAvatarFrame';

export function CombatStatsCard({
  title,
  subtitle,
  stats,
  variant,
  icon,
  avatarFrame,
  // Owner decision: PvP's pre-attack scout hides the itemized Excellent-option
  // bonuses (Critical Damage/Damage Decrease/Damage Reflect) for both sides —
  // only the base stats are shown there. Other callers (Robot page's own
  // stats) keep the full breakdown by leaving this at its default.
  showItemBonuses = true,
}: {
  title: React.ReactNode;
  subtitle?: string;
  stats: CombatStatsDto;
  variant: 'player' | 'enemy';
  // When given, the icon renders inside this same bordered card instead of a separate box above it.
  icon?: { assetId: string; alt: string };
  // Takes precedence over `icon` — a player's chosen profile picture (owner
  // decision, 2026-09-09) instead of their bare race icon, used wherever a
  // real opponent (not a Pentili/boss) is shown in combat.
  avatarFrame?: { avatarKey: string; frameKey: string };
  showItemBonuses?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className={`min-w-0 rounded-md border p-4 ${variant === 'enemy' ? 'border-panelBorderDanger' : 'border-panelBorder'} bg-well`}>
      {avatarFrame ? (
        <div className="mb-3 flex h-14 items-center justify-center sm:h-[140px]">
          <PlayerAvatarFrame avatarKey={avatarFrame.avatarKey} frameKey={avatarFrame.frameKey} className="h-full w-full" />
        </div>
      ) : (
        icon && (
          <div className="mb-3 flex h-[140px] items-center justify-center rounded-full bg-gradient-to-b from-wellBorder/50 to-transparent">
            <AssetIcon
              assetId={icon.assetId}
              alt={icon.alt}
              className="h-full w-auto object-contain"
              fallback={<span className="text-sm font-semibold text-textMuted">{icon.alt.charAt(0)}</span>}
            />
          </div>
        )
      )}
      <div className="mb-1 truncate text-sm font-semibold">{title}</div>
      {subtitle && <div className="mb-3 truncate text-[10px] text-textFaint">{subtitle}</div>}
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-textMuted">{t('bosses.attack')}</span>
          <span>{stats.attack}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-textMuted">{t('bosses.defense')}</span>
          <span>{stats.defense}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-textMuted">{t('robot.stat.hp')}</span>
          <span>{stats.hp}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-textMuted">{t('robot.stat.evasion')}</span>
          <span>{stats.evasion}%</span>
        </div>
        {showItemBonuses && stats.criticalDamageBonus > 0 && (
          <div className="flex justify-between">
            <span className="text-textMuted">{t('robot.stat.criticalDamageBonus')}</span>
            <span>{stats.criticalDamageBonus}%</span>
          </div>
        )}
        {showItemBonuses && stats.damageDecrease > 0 && (
          <div className="flex justify-between">
            <span className="text-textMuted">{t('robot.stat.damageDecrease')}</span>
            <span>{stats.damageDecrease}%</span>
          </div>
        )}
        {showItemBonuses && stats.damageReflect > 0 && (
          <div className="flex justify-between">
            <span className="text-textMuted">{t('robot.stat.damageReflect')}</span>
            <span>{stats.damageReflect}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
