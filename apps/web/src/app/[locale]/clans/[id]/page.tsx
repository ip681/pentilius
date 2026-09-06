'use client';

import type { ClanDetailDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { PlayerLink } from '@/components/PlayerLink';
import { Link } from '@/i18n/navigation';
import { getClan } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function ClanDetailPage() {
  useRequireAuth();
  const t = useTranslations();
  const params = useParams<{ id: string }>();
  const clanId = params.id;

  const [clan, setClan] = useState<ClanDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getClan(clanId)
      .then(setClan)
      .catch(() => setError(t('clans.loadError')));
  }, [clanId, t]);

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('clans.title')}</h1>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {clan && (
        <section className="max-w-xl rounded-lg border border-panelBorder bg-panel p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              [{clan.tag}] {clan.name}
            </h2>
            <span className="text-xs text-textFaint">
              {clan.memberCount}/{clan.memberCap}
            </span>
          </div>
          {clan.description && <p className="mb-4 text-sm text-textMuted">{clan.description}</p>}

          <div className="mb-4 rounded-md border border-wellBorder bg-well p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textFaint">{t('clans.treasury')}</h3>
            <div className="flex gap-5 text-sm">
              <span>{t('resource.METAL')}: <strong>{clan.treasury.metal.toLocaleString()}</strong></span>
              <span>{t('resource.CRYSTAL')}: <strong>{clan.treasury.crystal.toLocaleString()}</strong></span>
              <span>{t('resource.CREDITS')}: <strong>{clan.treasury.credits.toLocaleString()}</strong></span>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {clan.buildings.map((building) => (
              <div key={building.key} className="rounded-md border border-wellBorder bg-well p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold">{t(building.nameKey)}</span>
                  <span className="text-[9px] uppercase text-textFaint">
                    {t('clans.buildingLevel')} {building.level}/{building.maxLevel}
                  </span>
                </div>
                <p className="text-[10px] text-textMuted">{t(building.descriptionKey)}</p>
              </div>
            ))}
          </div>

          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-textFaint">
                <th className="pb-2">{t('clans.member')}</th>
                <th className="pb-2">{t('clans.role')}</th>
              </tr>
            </thead>
            <tbody>
              {clan.members.map((member) => (
                <tr key={member.playerId} className="border-t border-wellBorder">
                  <td className="py-2">
                    <PlayerLink playerId={member.playerId} username={member.username} />
                  </td>
                  <td className="py-2">{t(`clans.roleLabel.${member.role}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {clan.myRole && (
            <Link href="/clans" className="mt-4 inline-block text-xs text-accent underline">
              {t('clans.manage')}
            </Link>
          )}
        </section>
      )}
    </GameLayout>
  );
}
