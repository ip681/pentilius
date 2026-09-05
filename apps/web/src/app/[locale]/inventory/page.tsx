import { redirect } from 'next/navigation';

// Ship and Inventory were merged into one screen — see apps/web/src/app/[locale]/ship/page.tsx.
export default function InventoryRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/ship`);
}
