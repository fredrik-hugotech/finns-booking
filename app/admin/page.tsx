import { AdminClient } from '@/components/AdminClient';
import { innlogget } from '@/lib/tilgang';
import { erDemo } from '@/lib/lager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Backoffice – vinteråpen arena', robots: { index: false } };

export default async function Page() {
  return <AdminClient bruker={await innlogget()} demo={erDemo()} />;
}
