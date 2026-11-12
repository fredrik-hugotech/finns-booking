import { NextResponse } from 'next/server';
import { bareAdmin, ikkeInne, innlogget } from '@/lib/pam/tilgang';
import { hentLogg } from '@/lib/pam/lager';

export const dynamic = 'force-dynamic';

export async function GET() {
  const meg = await innlogget();
  if (!meg) return ikkeInne();
  if (meg.rolle !== 'admin') return bareAdmin();
  return NextResponse.json({ logg: await hentLogg() });
}
