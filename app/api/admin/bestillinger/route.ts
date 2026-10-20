import { NextResponse } from 'next/server';
import { adminBruker, erAdmin } from '@/lib/tilgang';
import {
  hentBestillinger, hentHoldt, hentKlubbtider, hentPriser, hentSperringer, lagreBestillinger, nyRef, oppdaterBestillinger, OpptattFeil, settStatus, skrivLogg, type Endringer,
} from '@/lib/lager';
import { byggBelegg, halvdeler, prisFor, slot, type Bane, type Bestilling, type Status } from '@/lib/tilgjengelighet';
import { erGyldigDato, langDato, naIOslo, tidsrom } from '@/lib/dato';

// «SNAK-AB12C Ola Nordmann: tirsdag 1. desember 16:00–17:00 hel, …» for loggen.
function beskriv(linjer: Pick<Bestilling, 'ref' | 'navn' | 'dato' | 'time' | 'bane'>[]) {
  const forste = linjer[0];
  const timer = linjer.slice(0, 6).map(l => `${langDato(l.dato)} ${tidsrom(l.time)} ${l.bane}`).join(', ');
  return `${forste.ref} ${forste.navn}: ${timer}${linjer.length > 6 ? ` og ${linjer.length - 6} timer til` : ''}`;
}
const STATUSLOGG: Record<Status, string> = { bekreftet: 'Bekreftet booking', avlyst: 'Fjernet booking', forespurt: 'Satte booking til venter' };

export const dynamic = 'force-dynamic';

const nekt = () => NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
const tekst = (v: unknown, maks: number) => (typeof v === 'string' ? v.trim().slice(0, maks) : undefined);

// Er timen ledig for denne banestørrelsen, når vi ser bort fra bestillingene i `unntatt`?
async function ledig(dato: string, time: number, bane: Bane, unntatt: string[] = []) {
  const [bestillinger, sperringer, klubbtider, holdt] = await Promise.all([hentBestillinger(), hentSperringer(), hentKlubbtider(), hentHoldt()]);
  const belegg = byggBelegg(bestillinger.filter(b => !unntatt.includes(b.id)), sperringer, klubbtider, holdt);
  return slot(dato, time, belegg, naIOslo()).ledigeHalvdeler >= halvdeler(bane);
}

export async function GET() {
  if (!(await erAdmin())) return nekt();
  return NextResponse.json({ bestillinger: await hentBestillinger() });
}

// Endre status ({ ider, status }) eller innhold ({ ider, endringer }).
export async function PATCH(req: Request) {
  const meg = await adminBruker();
  if (!meg) return nekt();
  const { ider, status, endringer } = await req.json().catch(() => ({}));
  if (!Array.isArray(ider) || ider.length === 0 || !ider.every((i: unknown) => typeof i === 'string')) {
    return NextResponse.json({ feil: 'Ugyldig forespørsel.' }, { status: 400 });
  }
  try {
    if (status !== undefined) {
      const gyldig: Status[] = ['forespurt', 'bekreftet', 'avlyst'];
      if (!gyldig.includes(status)) return NextResponse.json({ feil: 'Ugyldig status.' }, { status: 400 });
      const for_ = (await hentBestillinger()).filter(b => ider.includes(b.id));
      await settStatus(ider, status);
      if (for_.length) await skrivLogg(meg, STATUSLOGG[status as Status], beskriv(for_));
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
        return NextResponse.json({ feil: 'Den tiden er ikke ledig, eller noen holder på å booke den akkurat nå.' }, { status: 409 });
      }
      Object.assign(ut, { dato, time, bane, pris: prisFor(bane, dato, await hentPriser()) });
    }

    const for_ = (await hentBestillinger()).filter(b => ider.includes(b.id));
    await oppdaterBestillinger(ider, ut);
    if (for_.length) {
      const f = for_[0];
      const hva: string[] = [];
      if (ut.dato !== undefined && (ut.dato !== f.dato || ut.time !== f.time)) hva.push(`flyttet til ${langDato(ut.dato)} ${tidsrom(ut.time!)}`);
      if (ut.bane !== undefined && ut.bane !== f.bane) hva.push(`${ut.bane} bane`);
      const kontakt = (['navn', 'telefon', 'epost', 'klubb', 'kommentar'] as const).filter(k => ut[k] !== undefined && (ut[k] ?? '') !== (f[k] ?? ''));
      if (kontakt.length) hva.push(`endret ${kontakt.join(', ')}`);
      if (hva.length) await skrivLogg(meg, 'Endret booking', `${beskriv(for_)} · ${hva.join(', ')}`);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OpptattFeil) return NextResponse.json({ feil: 'Timen ble tatt i mellomtiden, eller noen holder på å booke den. Prøv igjen om litt.' }, { status: 409 });
    throw err;
  }
}

// Admin legger inn en booking selv (f.eks. etter en telefon). Blir bekreftet med en gang.
export async function POST(req: Request) {
  const meg = await adminBruker();
  if (!meg) return nekt();
  const b = await req.json().catch(() => ({}));
  const navn = tekst(b.navn, 120);
  const bane: Bane = b.bane === 'halv' ? 'halv' : 'hel';
  if (!navn || !erGyldigDato(b.dato) || !Number.isInteger(b.time)) {
    return NextResponse.json({ feil: 'Fyll inn navn.' }, { status: 400 });
  }
  if (!(await ledig(b.dato, b.time, bane))) {
    return NextResponse.json({ feil: 'Den tiden er ikke ledig, eller noen holder på å booke den akkurat nå.' }, { status: 409 });
  }
  try {
    const lagret = await lagreBestillinger([{
      ref: nyRef(), dato: b.dato, time: b.time, bane, pris: prisFor(bane, b.dato, await hentPriser()), serie: null,
      navn, telefon: tekst(b.telefon, 30) ?? '', epost: tekst(b.epost, 160) ?? '',
      klubb: tekst(b.klubb, 120) || null, kommentar: tekst(b.kommentar, 1000) || null,
    }]);
    await settStatus(lagret.map(l => l.id), 'bekreftet');
    await skrivLogg(meg, 'La inn booking', beskriv(lagret));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OpptattFeil) return NextResponse.json({ feil: 'Timen ble tatt i mellomtiden, eller noen holder på å booke den. Prøv igjen om litt.' }, { status: 409 });
    throw err;
  }
}
