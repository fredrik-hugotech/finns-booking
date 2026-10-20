import { NextResponse } from 'next/server';
import { innlogget } from '@/lib/tilgang';
import { hentBestillinger, hentKlubbtider, hentSperringer } from '@/lib/lager';
import { utenKontakt } from '@/lib/tilgjengelighet';
import { SESONG } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Hvem som har banen, for brukere med innsyn: navn og klubb, aldri
// kontaktinfo eller priser.
export async function GET() {
  if (!(await innlogget())) return NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
  const [bestillinger, klubbtider, sperringer] = await Promise.all([hentBestillinger(SESONG.fra), hentKlubbtider(), hentSperringer()]);
  return NextResponse.json({
    bestillinger: bestillinger
      .filter(b => b.status !== 'avlyst')
      .map(({ id, dato, time, bane, status, navn, klubb }) => ({ id, dato, time, bane, status, navn, klubb })),
    klubbtider: klubbtider.map(utenKontakt),
    sperringer,
  });
}
