'use client';

import type { CombatReportDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { PlayerLink } from '@/components/PlayerLink';
import { getCombatReports } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function ReportsPage() {
  useRequireAuth();
  const t = useTranslations();
  const [reports, setReports] = useState<CombatReportDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCombatReports()
      .then(setReports)
      .catch(() => setError(t('reports.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t('reports.title')}</h1>
        <p className="text-xs text-textMuted">{t('reports.subtitle')}</p>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-panelBorder bg-panel">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-panelBorder bg-panelHeader text-[10px] uppercase text-textFaint">
              <th className="px-4 py-3">{t('reports.type')}</th>
              <th className="px-4 py-3">{t('reports.zone')}</th>
              <th className="px-4 py-3">{t('reports.opponent')}</th>
              <th className="px-4 py-3">{t('reports.outcome')}</th>
              <th className="px-4 py-3">{t('reports.reward')}</th>
              <th className="px-4 py-3">{t('reports.date')}</th>
            </tr>
          </thead>
          <tbody>
            {reports?.map((report) => (
              <tr key={`${report.source}-${report.id}`} className="border-t border-wellBorder align-top">
                <td className="px-4 py-2.5 text-textMuted">{t(`reports.source${report.source}`)}</td>
                <td className="px-4 py-2.5 text-textMuted">{report.zoneNameKey ? t(report.zoneNameKey) : <span className="text-textFaint">—</span>}</td>
                <td className="px-4 py-2.5">
                  {report.source === 'PVP' && report.opponentPlayerId && report.opponentUsername ? (
                    <PlayerLink playerId={report.opponentPlayerId} username={report.opponentUsername} />
                  ) : report.opponentNameKey ? (
                    t(report.opponentNameKey)
                  ) : (
                    <span className="text-textFaint">—</span>
                  )}
                </td>
                <td className={`px-4 py-2.5 font-semibold ${report.outcome === 'WIN' ? 'text-positive' : 'text-danger'}`}>
                  {report.outcome === 'WIN' ? t('reports.win') : t('reports.loss')}
                </td>
                <td className="px-4 py-2.5 text-textMuted">
                  {report.outcome === 'WIN' ? (
                    <ul>
                      {report.xpGained > 0 && (
                        <li>
                          +{report.xpGained} {t('pve.xpGained')}
                        </li>
                      )}
                      {report.lootSummary.map((loot, index) => (
                        <li key={index}>
                          {loot.type === 'resource' ? t(`resource.${loot.resourceType}`) : t(loot.itemNameKey!)} x{loot.quantity}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-textFaint">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-textFaint">{new Date(report.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {reports && reports.length === 0 && <p className="p-4 text-xs text-textFaint">{t('reports.noReports')}</p>}
      </div>
    </GameLayout>
  );
}
