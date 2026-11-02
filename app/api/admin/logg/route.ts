import { NextResponse } from 'next/server';
import { adminBruker } from '@/lib/tilgang';
import { hentLogg } from '@/lib/lager';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await adminBruker())) return NextResponse.json({ feil: 'Bare for admin.' }, { status: 403 });
  return NextResponse.json({ logg: await hentLogg(2000) });
}
