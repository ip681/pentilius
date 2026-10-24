'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { GameLayout } from '@/components/GameLayout';
import { ZoneBossPanel } from '@/components/ZoneBossPanel';
import { Link } from '@/i18n/navigation';
import { useRequireAuth } from '@/lib/use-require-auth';

// A zone's boss on its own page (owner decision, 2026-10-21) — no Pentili here;
// the Command Center's boss timer links to it.
export default function ZoneBossPage() {
  useRequireAuth();
  const t = useTranslations();
  const { zoneId } = useParams<{ zoneId: string }>();
  return (
    <GameLayout>
      <div className="mb-4">
        <Link href={`/zones/${zoneId}`} className="text-xs text-accent underline">
          ← {t('bosses.backToZone')}
        </Link>
      </div>
      <ZoneBossPanel zoneId={zoneId} />
    </GameLayout>
  );
}
