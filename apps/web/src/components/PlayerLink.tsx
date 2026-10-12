'use client';

import { isDeletedPlayerName } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export function PlayerLink({ playerId, username, className }: { playerId: string; username: string; className?: string }) {
  const t = useTranslations();
  // A deleted account has no profile to visit — plain, muted text instead of a link.
  if (isDeletedPlayerName(username)) {
    return <span className="italic text-textFaint">{t('common.deletedPlayer')}</span>;
  }
  return (
    <Link href={`/players/${playerId}`} className={className ?? 'underline decoration-dotted hover:text-accent'}>
      {username}
    </Link>
  );
}
