import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { hentForSide } from '@/lib/pam/lager';
import { Pamelding } from '@/components/pam/Pamelding';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = (await hentForSide(params.slug))[0];
  return { title: a ? a.tittel : 'Påmelding' };
}

export default async function Page({ params }: { params: { slug: string } }) {
  const arrangementer = await hentForSide(params.slug);
  if (!arrangementer.length) notFound();
  return <Pamelding slug={params.slug} arrangementer={arrangementer.map(({ antall, ...a }) => a)} />;
}
