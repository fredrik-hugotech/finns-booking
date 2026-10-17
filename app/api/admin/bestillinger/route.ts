import { NextResponse } from 'next/server';
import { erAdmin } from '@/lib/admin';
import {
  hentBestillinger, hentKlubbtider, hentPriser, hentSperringer, lagreBestillinger, nyRef, oppdaterBestillinger, OpptattFeil, settStatus, type Endringer,
} from '@/lib/lager';
import { byggBelegg, halvdeler, prisFor, slot, type Bane, type Status } from '@/lib/tilgjengelighet';
import { erGyldigDato, naIOslo } from '@/lib/dato';

export const dynamic = 'force-dynamic';

const nekt = () => NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
const tekst = (v: unknown, maks: number) => (typeof v === 'string' ? v.trim().slice(0, maks) : undefined);

// Er timen ledig for denne banestørrelsen, når vi ser bort fra bestillingene i `unntatt`?
async function ledig(dato: string, time: number, bane: Bane, unntatt: string[] = []) {
  const [bestillinger, sperringer, klubbtider] = await Promise.all([hentBestillinger(), hentSperringer(), hentKlubbtider()]);
  const belegg = byggBelegg(bestillinger.filter(b => !unntatt.includes(b.id)), sperringer, klubbtider);
  return slot(dato, time, belegg, naIOslo()).ledigeHalvdeler >= halvdeler(bane);
}

export async function GET() {
  if (!erAdmin()) return nekt();
  return NextResponse.json({ bestillinger: await hentBestillinger() });
}

// Endre status ({ ider, status }) eller innhold ({ ider, endringer }).
export async function PATCH(req: Request) {
  if (!erAdmin()) return nekt();
  const { ider, status, endringer } = await req.json().catch(() => ({}));
  if (!Array.isArray(ider) || ider.length === 0 || !ider.every((i: unknown) => typeof i === 'string')) {
    return NextResponse.json({ feil: 'Ugyldig forespørsel.' }, { status: 400 });
  }
  try {
    if (status !== undefined) {
      const gyldig: Status[] = ['forespurt', 'bekreftet', 'avlyst'];
      if (!gyldig.includes(status)) return NextResponse.json({ feil: 'Ugyldig status.' }, { status: 400 });
      await settStatus(ider, status);
      return NextResponse.json({ ok: true });
    }

    const e = endringer ?? {};
    const ut: Endringer = {};
    for (const k of ['navn', 'telefon', 'epost'] as const) {
      const v = tekst(e[k], 160);
      if (v) ut[k] = v;
    }
    for (const k of ['klubb', 'kommentar'] as const) {
      const v = tekst(e[k], 1000);
      if (v !== undefined) ut[k] = v;
    }

    // Flytting eller bytte av bane gjelder én time om gangen og må være ledig.
    if (e.dato !== undefined || e.time !== undefined || e.bane !== undefined) {
      if (ider.length !== 1) return NextResponse.json({ feil: 'Flytt én time om gangen.' }, { status: 400 });
      const naa = (await hentBestillinger()).find(b => b.id === ider[0]);
      if (!naa) return NextResponse.json({ feil: 'Fant ikke bestillingen.' }, { status: 404 });
      const dato = e.dato ?? naa.dato;
      const time = e.time ?? naa.time;
      const bane: Bane = e.bane ?? naa.bane;
      if (!erGyldigDato(dato) || !Number.isInteger(time) || (bane !== 'hel' && bane !== 'halv')) {
        return NextResponse.json({ feil: 'Ugyldig dato, tid eller bane.' }, { status: 400 });
      }
      if (!(await ledig(dato, time, bane, [naa.id]))) {
        return NextResponse.json({ feil: 'Den tiden er ikke ledig.' }, { status: 409 });
      }
      Object.assign(ut, { dato, time, bane, pris: prisFor(bane, dato, await hentPriser()) });
    }

    await oppdaterBestillinger(ider, ut);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OpptattFeil) return NextResponse.json({ feil: 'Timen er booket av noen andre i mellomtiden.' }, { status: 409 });
    throw err;
  }
}

// Admin legger inn en booking selv (f.eks. etter en telefon). Blir bekreftet med en gang.
export async function POST(req: Request) {
  if (!erAdmin()) return nekt();
  const b = await req.json().catch(() => ({}));
  const navn = tekst(b.navn, 120);
  const bane: Bane = b.bane === 'halv' ? 'halv' : 'hel';
  if (!navn || !erGyldigDato(b.dato) || !Number.isInteger(b.time)) {
    return NextResponse.json({ feil: 'Fyll inn navn.' }, { status: 400 });
  }
  if (!(await ledig(b.dato, b.time, bane))) {
    return NextResponse.json({ feil: 'Den tiden er ikke ledig.' }, { status: 409 });
  }
  try {
    const lagret = await lagreBestillinger([{
      ref: nyRef(), dato: b.dato, time: b.time, bane, pris: prisFor(bane, b.dato, await hentPriser()), serie: null,
      navn, telefon: tekst(b.telefon, 30) ?? '', epost: tekst(b.epost, 160) ?? '',
      klubb: tekst(b.klubb, 120) || null, kommentar: tekst(b.kommentar, 1000) || null,
    }]);
    await settStatus(lagret.map(l => l.id), 'bekreftet');
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OpptattFeil) return NextResponse.json({ feil: 'Timen er booket av noen andre i mellomtiden.' }, { status: 409 });
    throw err;
  }
}
