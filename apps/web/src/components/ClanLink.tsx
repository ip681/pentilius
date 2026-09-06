import { Link } from '@/i18n/navigation';

export function ClanLink({ clanId, tag, name, className }: { clanId: string; tag: string; name?: string; className?: string }) {
  return (
    <Link href={`/clans/${clanId}`} className={className ?? 'underline decoration-dotted hover:text-accent'}>
      [{tag}]{name ? ` ${name}` : ''}
    </Link>
  );
}
