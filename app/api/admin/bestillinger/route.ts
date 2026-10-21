import { NextResponse } from 'next/server';
import { adminBruker, erAdmin } from '@/lib/tilgang';
import {
  hentBestillinger, hentHoldt, hentKlubbtider, hentPriser, hentSperringer, lagreBestillinger, nyRef, oppdaterBestillinger, OpptattFeil, settStatus, skrivLogg, type Endringer,
} from '@/lib/lager';
import { FORSTE_TIME, SISTE_TIME } from '@/lib/config';
import { byggBelegg, halvdeler, ledigIntervall, prisFor, tidFor, type Bane, type Bestilling, type Status } from '@/lib/tilgjengelighet';
import { erGyldigDato, langDato, naIOslo } from '@/lib/dato';

// «SNAK-AB12C Ola Nordmann: tirsdag 1. desember 16:00–17:00 hel, …» for loggen.
function beskriv(linjer: Pick<Bestilling, 'ref' | 'navn' | 'dato' | 'time' | 'minutt' | 'lengde' | 'bane'>[]) {
  const forste = linjer[0];
  const timer = linjer.slice(0, 6).map(l => `${langDato(l.dato)} ${tidFor(l)} ${l.bane}`).join(', ');
  return `${forste.ref} ${forste.navn}: ${timer}${linjer.length > 6 ? ` og ${linjer.length - 6} timer til` : ''}`;
}
const STATUSLOGG: Record<Status, string> = { bekreftet: 'Bekreftet booking', avlyst: 'Fjernet booking', forespurt: 'Satte booking til venter' };

export const dynamic = 'force-dynamic';

const nekt = () => NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
const tekst = (v: unknown, maks: number) => (typeof v === 'string' ? v.trim().slice(0, maks) : undefined);

// Er tidsrommet ledig for denne banestørrelsen, når vi ser bort fra bestillingene i `unntatt`?
async function ledig(dato: string, time: number, minutt: number, lengde: number, bane: Bane, unntatt: string[] = []) {
  const [bestillinger, sperringer, klubbtider, holdt] = await Promise.all([hentBestillinger(), hentSperringer(), hentKlubbtider(), hentHoldt()]);
  const belegg = byggBelegg(bestillinger.filter(b => !unntatt.includes(b.id)), sperringer, klubbtider, holdt);
  return ledigIntervall(dato, time * 60 + minutt, lengde, belegg, naIOslo()) >= halvdeler(bane);
}

// Start på hel eller halv time, 30 eller 60 minutter, innenfor åpningstida.
const gyldigTid = (time: unknown, minutt: unknown, lengde: unknown) =>
  Number.isInteger(time) && (minutt === 0 || minutt === 30) && (lengde === 30 || lengde === 60)
  && (time as number) >= FORSTE_TIME && (time as number) * 60 + (minutt as number) + (lengde as number) <= (SISTE_TIME + 1) * 60;

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

    // Flytting, ny lengde eller bytte av bane gjelder én linje om gangen og må være ledig.
    if (e.dato !== undefined || e.time !== undefined || e.minutt !== undefined || e.lengde !== undefined || e.bane !== undefined) {
      if (ider.length !== 1) return NextResponse.json({ feil: 'Flytt én time om gangen.' }, { status: 400 });
      const naa = (await hentBestillinger()).find(b => b.id === ider[0]);
      if (!naa) return NextResponse.json({ feil: 'Fant ikke bestillingen.' }, { status: 404 });
      const dato = e.dato ?? naa.dato;
      const time = e.time ?? naa.time;
      const minutt = e.minutt ?? naa.minutt ?? 0;
      const lengde = e.lengde ?? naa.lengde ?? 60;
      const bane: Bane = e.bane ?? naa.bane;
      if (!erGyldigDato(dato) || !gyldigTid(time, minutt, lengde) || (bane !== 'hel' && bane !== 'halv')) {
        return NextResponse.json({ feil: 'Ugyldig dato, tid eller bane.' }, { status: 400 });
      }
      if (!(await ledig(dato, time, minutt, lengde, bane, [naa.id]))) {
        return NextResponse.json({ feil: 'Den tiden er ikke ledig, eller noen holder på å booke den akkurat nå.' }, { status: 409 });
      }
      Object.assign(ut, { dato, time, minutt, lengde, bane, pris: prisFor(bane, dato, await hentPriser(), lengde) });
    }

    const for_ = (await hentBestillinger()).filter(b => ider.includes(b.id));
    await oppdaterBestillinger(ider, ut);
    if (for_.length) {
      const f = for_[0];
      const hva: string[] = [];
      if (ut.dato !== undefined && (ut.dato !== f.dato || ut.time !== f.time || ut.minutt !== f.minutt || ut.lengde !== f.lengde)) {
        hva.push(`flyttet til ${langDato(ut.dato)} ${tidFor({ time: ut.time!, minutt: ut.minutt, lengde: ut.lengde })}`);
      }
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
  const minutt = b.minutt === 30 ? 30 : 0;
  const lengde = b.lengde === 30 ? 30 : 60;
  if (!navn || !erGyldigDato(b.dato) || !gyldigTid(b.time, minutt, lengde)) {
    return NextResponse.json({ feil: 'Fyll inn navn og et gyldig tidsrom.' }, { status: 400 });
  }
  if (!(await ledig(b.dato, b.time, minutt, lengde, bane))) {
    return NextResponse.json({ feil: 'Den tiden er ikke ledig, eller noen holder på å booke den akkurat nå.' }, { status: 409 });
  }
  try {
    const lagret = await lagreBestillinger([{
      ref: nyRef(), dato: b.dato, time: b.time, minutt, lengde, bane, pris: prisFor(bane, b.dato, await hentPriser(), lengde), serie: null,
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
