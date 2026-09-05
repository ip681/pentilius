'use client';

import type { BattleReportDto, PentiliDto } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GameNav } from '@/components/GameNav';
import { attackPentili, getPentiliInZone } from '@/lib/api-client';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function ZonePentiliPage() {
  useRequireAuth();
  const t = useTranslations();
  const params = useParams<{ zoneId: string }>();
  const zoneId = params.zoneId;
  const [pentili, setPentili] = useState<PentiliDto[] | null>(null);
  const [report, setReport] = useState<BattleReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPentiliInZone(zoneId)
      .then(setPentili)
      .catch(() => setError(t('pve.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId]);

  async function handleAttack(pentiliId: string) {
    setError(null);
    try {
      setReport(await attackPentili(pentiliId));
    } catch {
      setError(t('pve.attackError'));
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <GameNav />
      <h1 className="mb-4 mt-6 text-xl font-bold">{t('pve.title')}</h1>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      {report && (
        <div className="mb-6 rounded border p-4">
          <p className="font-medium">{report.outcome === 'WIN' ? t('pve.victory') : t('pve.defeat')}</p>
          <p className="text-sm">{t('pve.damageDealt')}: {report.damageDealt} · {t('pve.damageTaken')}: {report.damageTaken}</p>
          {report.outcome === 'WIN' && (
            <>
              <p className="text-sm">{t('pve.xpGained')}: {report.xpGained}</p>
              {report.leveledUp && <p className="text-sm font-medium">{t('pve.leveledUp', { level: report.playerLevel })}</p>}
              {report.lootSummary.length > 0 && (
                <ul className="mt-2 text-sm text-gray-600">
                  {report.lootSummary.map((loot, index) => (
                    <li key={index}>
                      {loot.type === 'resource'
                        ? `${t(`resource.${loot.resourceType}`)} x${loot.quantity}`
                        : `${t(loot.itemNameKey!)} x${loot.quantity}`}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {pentili && (
        <ul className="flex flex-col gap-3">
          {pentili.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{t(entry.nameKey)} (Lv. {entry.level})</p>
                <p className="text-xs text-gray-500">HP {entry.maxHp} · ATK {entry.attack} · DEF {entry.defense}</p>
              </div>
              <button
                type="button"
                onClick={() => handleAttack(entry.id)}
                className="rounded bg-black px-3 py-1 text-sm text-white"
              >
                {t('pve.attack')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
