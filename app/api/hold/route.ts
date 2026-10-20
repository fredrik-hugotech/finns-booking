import { NextResponse } from 'next/server';
import { hentKlubbtider, hentSperringer, hold, HOLD_MINUTTER, OpptattFeil } from '@/lib/lager';
import { byggBelegg, slot, type Bane } from '@/lib/tilgjengelighet';
import { erGyldigDato, naIOslo } from '@/lib/dato';
import { gyldigOkt } from '@/lib/okt';

export const dynamic = 'force-dynamic';

// Hold av de valgte timene for denne nettleseren i HOLD_MINUTTER minutter.
// Sendes på nytt hver gang valget endres; en tom liste slipper alt.
// Den som holder først, får timen. Svarer med timene som ikke fikk plass.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || !gyldigOkt(b.okt) || !Array.isArray(b.linjer) || b.linjer.length > 150) {
    return NextResponse.json({ feil: 'Ugyldig forespørsel.' }, { status: 400 });
  }
  const linjer: { dato: string; time: number; bane: Bane }[] = b.linjer.filter((l: any) =>
    l && erGyldigDato(l.dato) && Number.isInteger(l.time) && (l.bane === 'hel' || l.bane === 'halv'));

  try {
    // Plass etter klubbtider, sperringer og stengte eller passerte timer.
    // Bookinger og andres holdte timer sjekkes i databasen, under lås.
    const [sperringer, klubbtider] = await Promise.all([hentSperringer(), hentKlubbtider()]);
    const tom = byggBelegg([], sperringer, klubbtider);
    const na = naIOslo();
    const unike = [...new Map(linjer.map(l => [`${l.dato}|${l.time}`, l])).values()];
    const avvist = await hold(b.okt, unike.map(l => ({ ...l, plass: slot(l.dato, l.time, tom, na).ledigeHalvdeler })));
    return NextResponse.json({ avvist, minutter: HOLD_MINUTTER });
  } catch (e) {
    if (e instanceof OpptattFeil) return NextResponse.json({ feil: 'Prøv igjen.' }, { status: 409 });
    console.error(e);
    return NextResponse.json({ feil: 'Kunne ikke holde av timene.' }, { status: 500 });
  }
}
