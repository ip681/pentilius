import { redirect } from 'next/navigation';

// Robot and Inventory were merged into one screen — see apps/web/src/app/[locale]/robot/page.tsx.
export default function InventoryRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/robot`);
}
