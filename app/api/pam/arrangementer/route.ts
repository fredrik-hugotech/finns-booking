import { NextResponse } from 'next/server';
import { bareAdmin, ikkeInne, innlogget, kanSe } from '@/lib/pam/tilgang';
import { hentArrangementer, lagreArrangement, skrivLogg } from '@/lib/pam/lager';
import { PARTNERE, lagSlug, navnPa, sjekkFelter, type Arrangement } from '@/lib/pam/felter';

export const dynamic = 'force-dynamic';

const tekst = (v: unknown, maks: number) => (typeof v === 'string' ? v.trim().slice(0, maks) : '');

export async function GET() {
  const meg = await innlogget();
  if (!meg) return ikkeInne();
  const alle = await hentArrangementer();
  return NextResponse.json({ arrangementer: alle.filter(a => kanSe(meg, a)) });
}

// Ny påmelding eller endring. Bare admin.
export async function POST(req: Request) {
  const meg = await innlogget();
  if (!meg) return ikkeInne();
  if (meg.rolle !== 'admin') return bareAdmin();
  const b = await req.json().catch(() => ({}));
  const id = typeof b.id === 'string' ? b.id : undefined;
  const alle = await hentArrangementer();
  const for_ = id ? alle.find(a => a.id === id) : undefined;
  if (id && !for_) return NextResponse.json({ feil: 'Fant ikke påmeldingen.' }, { status: 404 });

  if (for_ && b.handling === 'aapen' && typeof b.aapen === 'boolean') {
    await lagreArrangement({ id, aapen: b.aapen });
    await skrivLogg(meg, b.aapen ? 'Åpnet påmelding' : 'Stengte påmelding', navnPa(for_));
    return NextResponse.json({ ok: true });
  }

  const tittel = tekst(b.tittel, 120);
  const fane = tekst(b.fane, 60);
  const arrangor = tekst(b.arrangor, 80);
  if (!tittel || !arrangor) return NextResponse.json({ feil: 'Fyll inn tittel og arrangør.' }, { status: 400 });
  const felter = sjekkFelter(b.felter);
  if (typeof felter === 'string') return NextResponse.json({ feil: felter }, { status: 400 });
  const serie = lagSlug(tekst(b.serie, 60));
  const slug = lagSlug(tekst(b.slug, 60)) || lagSlug(fane ? `${tittel} ${fane}` : tittel);
  if (!slug) return NextResponse.json({ feil: 'Ugyldig lenke.' }, { status: 400 });
  if (alle.some(a => a.id !== id && (a.slug === slug || a.serie === slug))) {
    return NextResponse.json({ feil: `Lenken «${slug}» er allerede i bruk.` }, { status: 409 });
  }
  if (serie && alle.some(a => a.slug === serie)) {
    return NextResponse.json({ feil: `«${serie}» er lenken til en annen påmelding og kan ikke brukes som gruppe.` }, { status: 409 });
  }
  const partner = typeof b.partner === 'string' && b.partner in PARTNERE ? b.partner : '';

  const a: Partial<Arrangement> = {
    id, slug, serie: serie || null, tittel, fane: fane || null, arrangor,
    info: tekst(b.info, 500) || null, felter, partner: partner || null,
    aapen: typeof b.aapen === 'boolean' ? b.aapen : for_?.aapen ?? true,
    rekkefolge: Number.isInteger(b.rekkefolge) ? b.rekkefolge : for_?.rekkefolge ?? 0,
  };
  // Tomme verdier sendes som tom tekst, så databasen nuller dem ut.
  const nyId = await lagreArrangement({ ...a, serie: a.serie ?? '', fane: a.fane ?? '', info: a.info ?? '', partner: a.partner ?? '' } as Partial<Arrangement>);
  await skrivLogg(meg, id ? 'Endret påmelding' : 'Laget påmelding', navnPa(a as Arrangement));
  return NextResponse.json({ ok: true, id: nyId });
}
