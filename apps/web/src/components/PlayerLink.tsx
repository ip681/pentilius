import { Link } from '@/i18n/navigation';

export function PlayerLink({ playerId, username, className }: { playerId: string; username: string; className?: string }) {
  return (
    <Link href={`/players/${playerId}`} className={className ?? 'underline decoration-dotted hover:text-accent'}>
      {username}
    </Link>
  );
}
