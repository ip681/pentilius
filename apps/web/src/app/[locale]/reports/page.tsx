'use client';

import type { BattleReportDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GameNav } from '@/components/GameNav';
import { getBattleReports } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function ReportsPage() {
  useRequireAuth();
  const t = useTranslations();
  const [reports, setReports] = useState<BattleReportDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBattleReports()
      .then(setReports)
      .catch(() => setError(t('pve.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <GameNav />
      <h1 className="mb-4 mt-6 text-xl font-bold">{t('pve.reportsTitle')}</h1>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      {reports && (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id} className="rounded border p-3 text-sm">
              <p className="font-medium">
                {report.outcome === 'WIN' ? t('pve.victory') : t('pve.defeat')} — {t(report.pentiliNameKey)}
              </p>
              <p className="text-gray-500">
                {new Date(report.createdAt).toLocaleString()} · {t('pve.xpGained')}: {report.xpGained}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
