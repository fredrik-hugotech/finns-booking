import { NextResponse } from 'next/server';
import { hentBestillinger, hentSperringer, lagreBestillinger, nyRef, OpptattFeil } from '@/lib/lager';
import { byggBelegg, halvdeler, nokkel, prisFor, slot, utenforVindu, type Bane } from '@/lib/tilgjengelighet';
import { ENKELT_DAGER_FREM, SESONG } from '@/lib/config';
import { erGyldigDato, langDato, naIOslo, tidsrom } from '@/lib/dato';

export const dynamic = 'force-dynamic';

const MAKS_LINJER = 150;

type Linje = { dato: string; time: number; bane: Bane };

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

  const linjer: Linje[] = body.linjer.filter((l: any) =>
    l && erGyldigDato(l.dato) && Number.isInteger(l.time) && (l.bane === 'hel' || l.bane === 'halv'));
  if (linjer.length === 0 || linjer.length !== body.linjer.length || linjer.length > MAKS_LINJER) {
    return NextResponse.json({ feil: 'Velg mellom 1 og 150 timer.' }, { status: 400 });
  }

  try {
    const [bestillinger, sperringer] = await Promise.all([hentBestillinger(SESONG.fra), hentSperringer()]);
    const belegg = byggBelegg(bestillinger, sperringer);
    const na = naIOslo();

    const forTidlig = utenforVindu(linjer, na);
    if (forTidlig.length) {
      return NextResponse.json({
        feil: `Enkelttimer kan bookes ${ENKELT_DAGER_FREM / 7} uker frem. Velg «Fast hver uke» for tider lenger frem.`,
        opptatt: forTidlig.map(l => `${langDato(l.dato)} ${tidsrom(l.time)}`),
      }, { status: 400 });
    }

    // Sjekk hver time mot det som allerede er tatt, inkludert tidligere linjer
    // i samme bestilling.
    const opptatt: string[] = [];
    for (const l of linjer) {
      const s = slot(l.dato, l.time, belegg, na);
      if (s.ledigeHalvdeler < halvdeler(l.bane)) {
        opptatt.push(`${langDato(l.dato)} ${tidsrom(l.time)}`);
        continue;
      }
      const k = nokkel(l.dato, l.time);
      belegg.brukt[k] = (belegg.brukt[k] ?? 0) + halvdeler(l.bane);
    }
    if (opptatt.length) {
      return NextResponse.json({ feil: 'Noen av timene er ikke lenger ledige.', opptatt }, { status: 409 });
    }

    const ref = nyRef();
    const serie = linjer.length > 1 && body.serie === true ? ref : null;
    const lagret = await lagreBestillinger(linjer.map(l => ({
      ref, dato: l.dato, time: l.time, bane: l.bane, pris: prisFor(l.bane, l.dato),
      navn, telefon, epost, klubb, kommentar, serie,
    })));
    const sum = lagret.reduce((s, b) => s + b.pris, 0);
    return NextResponse.json({ ref, antall: lagret.length, sum });
  } catch (e) {
    if (e instanceof OpptattFeil) {
      return NextResponse.json({ feil: 'Noen rakk å booke en av timene før deg. Last inn på nytt og prøv igjen.' }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ feil: 'Noe gikk galt. Prøv igjen om litt.' }, { status: 500 });
  }
}
