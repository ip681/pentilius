'use client';

import type { BaseResponseDto, RobotSlotDto, ZoneDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { Link } from '@/i18n/navigation';
import { getBase, getRobot, getZones } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function DashboardPage() {
  useRequireAuth();
  const t = useTranslations();
  const [base, setBase] = useState<BaseResponseDto | null>(null);
  const [robot, setRobot] = useState<RobotSlotDto[] | null>(null);
  const [zones, setZones] = useState<ZoneDto[] | null>(null);

  useEffect(() => {
    getBase().then(setBase).catch(() => undefined);
    getRobot().then(setRobot).catch(() => undefined);
    getZones().then(setZones).catch(() => undefined);
  }, []);

  const equippedCount = robot?.filter((slot) => slot.item !== null).length ?? 0;
  const unlockedCount = zones?.filter((zone) => zone.unlocked).length ?? 0;

  return (
    <GameLayout>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
          <p className="text-xs text-textMuted">{t('dashboard.subtitle')}</p>
        </div>
        <div className="text-xs uppercase tracking-wide text-positive">● {t('dashboard.status')}</div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="rounded-lg border border-panelBorder bg-panel p-5">
          <div className="mb-4 text-[11px] uppercase tracking-wide text-textFaint">{t('dashboard.baseSubtitle')}</div>
          <h2 className="mb-4 text-sm font-semibold">{t('dashboard.baseTitle')}</h2>
          {base ? (
            <p className="mb-4 text-xs text-textMuted">
              {base.buildings.filter((b) => b.level > 0).length} / {base.buildings.length} {t('dashboard.buildingsBuilt')}
            </p>
          ) : (
            <p className="mb-4 text-xs text-textMuted">…</p>
          )}
          <Link href="/base" className="text-xs text-text underline">
            {t('dashboard.manage')}
          </Link>
        </div>

        <div className="rounded-lg border border-panelBorder bg-panel p-5">
          <div className="mb-4 text-[11px] uppercase tracking-wide text-textFaint">{t('dashboard.robotSubtitle')}</div>
          <h2 className="mb-4 text-sm font-semibold">{t('dashboard.robotTitle')}</h2>
          <p className="mb-4 text-xs text-textMuted">
            {equippedCount} / 7 {t('dashboard.slotsEquipped')}
          </p>
          <Link href="/robot" className="text-xs text-text underline">
            {t('dashboard.manage')}
          </Link>
        </div>

        <div className="rounded-lg border border-panelBorder bg-panel p-5">
          <div className="mb-4 text-[11px] uppercase tracking-wide text-textFaint">{t('dashboard.zonesSubtitle')}</div>
          <h2 className="mb-4 text-sm font-semibold">{t('dashboard.zonesTitle')}</h2>
          {zones ? (
            <p className="mb-4 text-xs text-textMuted">
              {unlockedCount} / {zones.length} {t('dashboard.zonesUnlocked')}
            </p>
          ) : (
            <p className="mb-4 text-xs text-textMuted">…</p>
          )}
          <Link href="/zones" className="text-xs text-text underline">
            {t('dashboard.explore')}
          </Link>
        </div>
      </div>
    </GameLayout>
  );
}
