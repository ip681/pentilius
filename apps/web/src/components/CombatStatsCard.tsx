'use client';

import type { CombatStatsDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';

export function CombatStatsCard({
  title,
  subtitle,
  stats,
  variant,
}: {
  title: React.ReactNode;
  subtitle?: string;
  stats: CombatStatsDto;
  variant: 'player' | 'enemy';
}) {
  const t = useTranslations();
  return (
    <div className={`rounded-md border p-4 ${variant === 'enemy' ? 'border-panelBorderDanger' : 'border-panelBorder'} bg-well`}>
      <div className="mb-1 text-sm font-semibold">{title}</div>
      {subtitle && <div className="mb-3 text-[10px] text-textFaint">{subtitle}</div>}
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
        {stats.criticalDamageBonus > 0 && (
          <div className="flex justify-between">
            <span className="text-textMuted">{t('robot.stat.criticalDamageBonus')}</span>
            <span>{stats.criticalDamageBonus}%</span>
          </div>
        )}
        {stats.damageDecrease > 0 && (
          <div className="flex justify-between">
            <span className="text-textMuted">{t('robot.stat.damageDecrease')}</span>
            <span>{stats.damageDecrease}%</span>
          </div>
        )}
        {stats.damageReflect > 0 && (
          <div className="flex justify-between">
            <span className="text-textMuted">{t('robot.stat.damageReflect')}</span>
            <span>{stats.damageReflect}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
