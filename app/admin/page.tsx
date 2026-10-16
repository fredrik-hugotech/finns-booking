import { AdminClient } from '@/components/AdminClient';
import { erAdmin } from '@/lib/admin';
import { erDemo } from '@/lib/lager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin – vinteråpen arena', robots: { index: false } };

export default function Page() {
  return <AdminClient innlogget={erAdmin()} demo={erDemo()} />;
}
