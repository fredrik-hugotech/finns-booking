import { NextResponse } from 'next/server';
import { hentKlubbtider, hentSperringer, hold, HOLD_MINUTTER, OpptattFeil } from '@/lib/lager';
import { byggBelegg, halvslot, halvtimerI, type Bane } from '@/lib/tilgjengelighet';
import { erGyldigDato, naIOslo } from '@/lib/dato';
import { gyldigOkt } from '@/lib/okt';

export const dynamic = 'force-dynamic';

// Hold av de valgte timene for denne nettleseren i HOLD_MINUTTER minutter.
// Sendes på nytt hver gang valget endres; en tom liste slipper alt.
// Den som holder først, får timen. Holdes per halvtime; svarer med
// halvtimene som ikke fikk plass.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || !gyldigOkt(b.okt) || !Array.isArray(b.linjer) || b.linjer.length > 150) {
    return NextResponse.json({ feil: 'Ugyldig forespørsel.' }, { status: 400 });
  }
  const linjer: { dato: string; start: number; lengde: number; bane: Bane }[] = b.linjer
    .filter((l: any) => l && erGyldigDato(l.dato) && Number.isInteger(l.time) && (l.bane === 'hel' || l.bane === 'halv'))
    .map((l: any) => ({ dato: l.dato, start: l.time * 60 + (l.minutt === 30 ? 30 : 0), lengde: l.lengde === 30 ? 30 : 60, bane: l.bane }));

  try {
    // Plass etter klubbtider, sperringer og stengte eller passerte halvtimer.
    // Bookinger og andres holdte timer sjekkes i databasen, under lås.
    const [sperringer, klubbtider] = await Promise.all([hentSperringer(), hentKlubbtider()]);
    const tom = byggBelegg([], sperringer, klubbtider);
    const na = naIOslo();
    const halve = new Map<string, { dato: string; start: number; bane: Bane; plass: number }>();
    for (const l of linjer) {
      for (const s of halvtimerI(l.start, l.lengde)) {
        halve.set(`${l.dato}|${s}`, { dato: l.dato, start: s, bane: l.bane, plass: halvslot(l.dato, s, tom, na).ledigeHalvdeler });
      }
    }
    const avvist = await hold(b.okt, [...halve.values()]);
    return NextResponse.json({ avvist, minutter: HOLD_MINUTTER });
  } catch (e) {
    if (e instanceof OpptattFeil) return NextResponse.json({ feil: 'Prøv igjen.' }, { status: 409 });
    console.error(e);
    return NextResponse.json({ feil: 'Kunne ikke holde av timene.' }, { status: 500 });
  }
}
