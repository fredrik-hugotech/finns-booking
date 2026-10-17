import { NextResponse } from 'next/server';
import { erAdmin } from '@/lib/admin';
import { fjernKlubbtid, hentBestillinger, hentKlubbtider, lagreKlubbtid } from '@/lib/lager';
import { halvdeler, type Bane, type Bestilling, type Klubbtid } from '@/lib/tilgjengelighet';
import { FORSTE_TIME, SESONG, SISTE_TIME, STENGTE_DAGER } from '@/lib/config';
import { datoer, erGyldigDato, langDato, minutter, naIOslo, ukedag } from '@/lib/dato';

export const dynamic = 'force-dynamic';

const nekt = () => NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
const tekst = (v: unknown, maks: number) => (typeof v === 'string' ? v.trim().slice(0, maks) : '');
const KLOKKE = /^\d\d:[03]0$/;

export async function GET() {
  if (!erAdmin()) return nekt();
  return NextResponse.json({ klubbtider: await hentKlubbtider() });
}

// Datoer der klubbtida ikke får plass fordi banen alt er booket. Sjekkes per
// halvtime fra i dag og ut sesongen.
function kollisjoner(k: Omit<Klubbtid, 'id'>, andre: Klubbtid[], bestillinger: Bestilling[]): string[] {
  const ut: string[] = [];
  const iDag = naIOslo().dato;
  for (const d of datoer(iDag > SESONG.fra ? iDag : SESONG.fra, SESONG.til)) {
    if (ukedag(d) !== k.dag || k.unntak.includes(d) || STENGTE_DAGER[d]) continue;
    for (let m = minutter(k.fra); m < minutter(k.til); m += 30) {
      const klubb = andre
        .filter(o => o.dag === k.dag && !o.unntak.includes(d) && minutter(o.fra) <= m && minutter(o.til) > m)
        .reduce((n, o) => n + halvdeler(o.bane), 0);
      const booket = bestillinger
        .filter(b => b.status !== 'avlyst' && b.dato === d && b.time === Math.floor(m / 60))
        .reduce((n, b) => n + halvdeler(b.bane), 0);
      if (klubb + booket + halvdeler(k.bane) > 2) {
        ut.push(langDato(d));
        break;
      }
    }
  }
  return ut;
}

// Ny eller endret klubbtid. Frigitte datoer ligger i `unntak`.
export async function POST(req: Request) {
  if (!erAdmin()) return nekt();
  const b = await req.json().catch(() => ({}));
  const k = {
    id: typeof b.id === 'string' ? b.id : undefined,
    dag: Number(b.dag),
    fra: tekst(b.fra, 5),
    til: tekst(b.til, 5),
    bane: (b.bane === 'halv' ? 'halv' : 'hel') as Bane,
    klubb: tekst(b.klubb, 80),
    lag: tekst(b.lag, 80) || null,
    kontakt: tekst(b.kontakt, 120) || null,
    telefon: tekst(b.telefon, 30) || null,
    epost: tekst(b.epost, 160) || null,
    unntak: Array.isArray(b.unntak) ? [...new Set<string>(b.unntak.filter(erGyldigDato))].sort() : [],
  };
  const gyldig = Number.isInteger(k.dag) && k.dag >= 1 && k.dag <= 7 && KLOKKE.test(k.fra) && KLOKKE.test(k.til)
    && k.fra < k.til && minutter(k.fra) >= FORSTE_TIME * 60 && minutter(k.til) <= (SISTE_TIME + 1) * 60;
  if (!gyldig || !k.klubb) {
    return NextResponse.json({ feil: 'Fyll inn klubb, dag og et gyldig tidsrom (hele og halve timer).' }, { status: 400 });
  }

  const [alle, bestillinger] = await Promise.all([hentKlubbtider(), hentBestillinger(SESONG.fra)]);
  if (k.id && !alle.some(x => x.id === k.id)) return NextResponse.json({ feil: 'Fant ikke klubbtida.' }, { status: 404 });
  const opptatt = kollisjoner(k, alle.filter(x => x.id !== k.id), bestillinger);
  if (opptatt.length) {
    const vis = opptatt.slice(0, 4).join(', ') + (opptatt.length > 4 ? ` og ${opptatt.length - 4} til` : '');
    return NextResponse.json({ feil: `Banen er alt booket ${vis}. Flytt eller fjern de bookingene først.` }, { status: 409 });
  }
  await lagreKlubbtid(k);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!erAdmin()) return nekt();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ feil: 'Mangler id.' }, { status: 400 });
  await fjernKlubbtid(id);
  return NextResponse.json({ ok: true });
}
