import type { ClanEmblemDto } from '@pentilius/shared';
import { Link } from '@/i18n/navigation';
import { ClanEmblem } from './ClanEmblem';

// The emblem (owner decision, 2026-10-21) sits before the tag when given.
export function ClanLink({
  clanId,
  tag,
  name,
  className,
  emblem,
  emblemSize = 18,
}: {
  clanId: string;
  tag: string;
  name?: string;
  className?: string;
  emblem?: ClanEmblemDto | null;
  emblemSize?: number;
}) {
  return (
    <Link href={`/clans/${clanId}`} className={className ?? 'underline decoration-dotted hover:text-accent'}>
      {emblem && <ClanEmblem emblem={emblem} size={emblemSize} className="mr-1.5 -mt-0.5" />}
      [{tag}]{name ? ` ${name}` : ''}
    </Link>
  );
}
