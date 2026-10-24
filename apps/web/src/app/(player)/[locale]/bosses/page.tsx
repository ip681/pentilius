import { redirect } from '@/i18n/navigation';

// The all-bosses page was removed (owner decision, 2026-10-21): every boss and
// its open formations are on its zone's page, finished fights in the battle
// reports. Old links land on the zones list.
export default function BossesPage({ params }: { params: { locale: string } }) {
  redirect({ href: '/zones', locale: params.locale });
}
