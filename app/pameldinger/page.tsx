import { PamAdmin } from '@/components/pam/PamAdmin';
import { innlogget } from '@/lib/pam/tilgang';
import { erDemo } from '@/lib/lager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Påmeldinger – backoffice', robots: { index: false } };

export default async function Page() {
  return <PamAdmin bruker={await innlogget()} demo={erDemo()} />;
}
