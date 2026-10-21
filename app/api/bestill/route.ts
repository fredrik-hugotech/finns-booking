import { NextResponse } from 'next/server';
import { hentBestillinger, hentHoldt, hentKlubbtider, hentPriser, hentSperringer, skrivLogg, lagreBestillinger, nyRef, OpptattFeil } from '@/lib/lager';
import { byggBelegg, halvdeler, halvtimerI, ledigIntervall, nokkel, prisFor, tidFor, type Bane } from '@/lib/tilgjengelighet';
import { SESONG } from '@/lib/config';
import { erGyldigDato, langDato, naIOslo } from '@/lib/dato';

export const dynamic = 'force-dynamic';

import { gyldigOkt } from '@/lib/okt';

const MAKS_LINJER = 150;

type Linje = { dato: string; time: number; minutt: number; lengde: number; bane: Bane };

function tekst(v: unknown, maks: number): string {
  return typeof v === 'string' ? v.trim().slice(0, maks) : '';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.linjer)) {
    return NextResponse.json({ feil: 'Ugyldig forespørsel.' }, { status: 400 });
  }

  const navn = tekst(body.navn, 120);
  const telefon = tekst(body.telefon, 30);
  const epost = tekst(body.epost, 160);
  const klubb = tekst(body.klubb, 120) || null;
  const kommentar = tekst(body.kommentar, 1000) || null;
  if (!navn || !telefon || !/^\S+@\S+\.\S+$/.test(epost)) {
    return NextResponse.json({ feil: 'Fyll inn navn, telefon og en gyldig e-post.' }, { status: 400 });
  }

  // Hver linje starter på hel eller halv time og varer 30 eller 60 minutter.
  const linjer: Linje[] = body.linjer
    .filter((l: any) => l && erGyldigDato(l.dato) && Number.isInteger(l.time) && (l.bane === 'hel' || l.bane === 'halv')
      && [undefined, 0, 30].includes(l.minutt) && [undefined, 30, 60].includes(l.lengde))
    .map((l: any) => ({ dato: l.dato, time: l.time, minutt: l.minutt ?? 0, lengde: l.lengde ?? 60, bane: l.bane }));
  if (linjer.length === 0 || linjer.length !== body.linjer.length || linjer.length > MAKS_LINJER) {
    return NextResponse.json({ feil: 'Velg mellom 1 og 150 timer.' }, { status: 400 });
  }

  try {
    // Egne holdte timer er ledige for denne økta; andres teller som opptatt.
    const okt = gyldigOkt(body.okt) ? body.okt : undefined;
    const [bestillinger, sperringer, priser, klubbtider, holdt] = await Promise.all([
      hentBestillinger(SESONG.fra), hentSperringer(), hentPriser(), hentKlubbtider(), hentHoldt(okt),
    ]);
    const belegg = byggBelegg(bestillinger, sperringer, klubbtider, holdt);
    const na = naIOslo();

    // Sjekk hver time mot det som allerede er tatt, inkludert tidligere linjer
    // i samme bestilling.
    const opptatt: string[] = [];
    for (const l of linjer) {
      const start = l.time * 60 + l.minutt;
      if (ledigIntervall(l.dato, start, l.lengde, belegg, na) < halvdeler(l.bane)) {
        opptatt.push(`${langDato(l.dato)} ${tidFor(l)}`);
        continue;
      }
      for (const s of halvtimerI(start, l.lengde)) {
        const k = nokkel(l.dato, s);
        belegg.brukt[k] = (belegg.brukt[k] ?? 0) + halvdeler(l.bane);
      }
    }
    if (opptatt.length) {
      return NextResponse.json({ feil: 'Noen av timene er ikke lenger ledige.', opptatt }, { status: 409 });
    }

    const ref = nyRef();
    const serie = linjer.length > 1 && body.serie === true ? ref : null;
    const lagret = await lagreBestillinger(linjer.map(l => ({
      ref, dato: l.dato, time: l.time, minutt: l.minutt, lengde: l.lengde, bane: l.bane, pris: prisFor(l.bane, l.dato, priser, l.lengde),
      navn, telefon, epost, klubb, kommentar, serie,
    })), okt);
    const sum = lagret.reduce((s, b) => s + b.pris, 0);
    await skrivLogg({ navn: `${navn}${klubb ? ` (${klubb})` : ''}` }, 'Ny forespørsel fra nettsiden', `${ref}: ${lagret.length} ${lagret.length === 1 ? 'time' : 'timer'}, ${sum} kr`);
    return NextResponse.json({ ref, antall: lagret.length, sum });
  } catch (e) {
    if (e instanceof OpptattFeil) {
      return NextResponse.json({ feil: 'Noen rakk å booke en av timene før deg. Last inn på nytt og prøv igjen.' }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ feil: 'Noe gikk galt. Prøv igjen om litt.' }, { status: 500 });
  }
}
