'use client';

import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { GameLayout } from '@/components/GameLayout';
import { ZoneBossPanel } from '@/components/ZoneBossPanel';
import { Link } from '@/i18n/navigation';
import { useRequireAuth } from '@/lib/use-require-auth';

// A zone's boss on its own page (owner decision, 2026-10-21) — no Pentili here;
// the Command Center's boss timer links to it.
function ZoneBoss() {
  useRequireAuth();
  const t = useTranslations();
  const { zoneId } = useParams<{ zoneId: string }>();
  // ?battle=<formation id>: opens and replays that fight (from the Command Center or the battle reports).
  const battleId = useSearchParams().get('battle');
  return (
    <GameLayout>
      <div className="mb-4">
        <Link href={`/zones?zone=${zoneId}`} className="text-xs text-accent underline">
          ← {t('bosses.backToZones')}
        </Link>
      </div>
      <ZoneBossPanel zoneId={zoneId} battleId={battleId} />
    </GameLayout>
  );
}

export default function ZoneBossPage() {
  return (
    <Suspense>
      <ZoneBoss />
    </Suspense>
  );
}
