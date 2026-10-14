'use client';

import { isDeletedPlayerName } from '@pentilius/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export function PlayerLink({ playerId, username, className, isVip = false }: { playerId: string; username: string; className?: string; isVip?: boolean }) {
  const t = useTranslations();
  // A deleted account has no profile to visit — plain, muted text instead of a link.
  if (isDeletedPlayerName(username)) {
    return <span className="italic text-textFaint">{t('common.deletedPlayer')}</span>;
  }
  return (
    // VIP names in the energy-bar gold everywhere (owner decision, 2026-10-14).
    <Link href={`/players/${playerId}`} className={`${className ?? 'underline decoration-dotted hover:text-accent'} ${isVip ? 'text-vipGold' : ''}`}>
      {username}
    </Link>
  );
}
