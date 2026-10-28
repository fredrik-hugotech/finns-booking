import { NextResponse } from 'next/server';
import { erDemo, hentBestillinger, hentHoldt, hentKlubbtider, hentPriser, hentSperringer } from '@/lib/lager';
import { gyldigOkt } from '@/lib/okt';
import { byggBelegg } from '@/lib/tilgjengelighet';
import { SESONG } from '@/lib/config';
import { naIOslo } from '@/lib/dato';

export const dynamic = 'force-dynamic';

// `okt` gjør at egne holdte timer vises som ledige; andres vises som opptatt.
export async function GET(req: Request) {
  const okt = new URL(req.url).searchParams.get('okt');
  try {
    const [bestillinger, sperringer, priser, klubbtider, holdt] = await Promise.all([
      hentBestillinger(SESONG.fra), hentSperringer(), hentPriser(), hentKlubbtider(), hentHoldt(gyldigOkt(okt) ? okt : undefined),
    ]);
    return NextResponse.json({ belegg: byggBelegg(bestillinger, sperringer, klubbtider, holdt), priser, na: naIOslo(), demo: erDemo() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ feil: 'Kunne ikke hente ledige tider.' }, { status: 500 });
  }
}
