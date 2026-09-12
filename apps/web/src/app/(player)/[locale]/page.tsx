import { redirect } from 'next/navigation';

// No public marketing content yet — go straight to the login/register form.
export default function HomePage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/login`);
}
