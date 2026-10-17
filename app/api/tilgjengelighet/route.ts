import { NextResponse } from 'next/server';
import { erDemo, hentBestillinger, hentPriser, hentSperringer } from '@/lib/lager';
import { byggBelegg } from '@/lib/tilgjengelighet';
import { SESONG } from '@/lib/config';
import { naIOslo } from '@/lib/dato';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [bestillinger, sperringer, priser] = await Promise.all([hentBestillinger(SESONG.fra), hentSperringer(), hentPriser()]);
    return NextResponse.json({ belegg: byggBelegg(bestillinger, sperringer), priser, na: naIOslo(), demo: erDemo() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ feil: 'Kunne ikke hente ledige tider.' }, { status: 500 });
  }
}
