import { NextResponse } from 'next/server';
import { ikkeInne, innlogget, kanSe } from '@/lib/pam/tilgang';
import { bekreftSvar, hentArrangementer, hentSvar, skrivLogg } from '@/lib/pam/lager';
import { navnPa } from '@/lib/pam/felter';
import { navnI, sendPlass, standardMelding } from '@/lib/pam/epost';
import { epostErSattOpp } from '@/lib/epost';
import { erDemo } from '@/lib/lager';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const tekst = (v: unknown, maks: number) => (typeof v === 'string' ? v.trim().slice(0, maks) : '');

async function medTilgang(id: string | null) {
  const meg = await innlogget();
  if (!meg) return { feil: ikkeInne() };
  const a = (await hentArrangementer()).find(x => x.id === id);
  if (!a || !kanSe(meg, a)) return { feil: NextResponse.json({ feil: 'Fant ikke påmeldingen.' }, { status: 404 }) };
  return { meg, a };
}

// Forslag til e-posten, så den kan redigeres før den sendes.
export async function GET(req: Request) {
  const t = await medTilgang(new URL(req.url).searchParams.get('arrangement'));
  if (t.feil) return t.feil;
  return NextResponse.json({ ...standardMelding(t.a), kanSende: epostErSattOpp() || erDemo() });
}

// Gi plass til de valgte og send «Du har fått plass» på e-post. Bare de som fikk
// e-posten, blir merket som bekreftet, så ingen blir glemt om noe feiler.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const t = await medTilgang(typeof b.arrangement === 'string' ? b.arrangement : null);
  if (t.feil) return t.feil;
  const { meg, a } = t;
  const emne = tekst(b.emne, 200);
  const melding = tekst(b.tekst, 5000);
  if (!emne || !melding) return NextResponse.json({ feil: 'Skriv emne og tekst.' }, { status: 400 });
  const ider = new Set(Array.isArray(b.ider) ? b.ider.filter((x: unknown) => typeof x === 'string') : []);
  const valgt = (await hentSvar(a.id)).filter(s => ider.has(s.id) && !s.plass_bekreftet);
  if (!valgt.length) return NextResponse.json({ feil: 'Ingen å bekrefte. De valgte har allerede fått bekreftelse.' }, { status: 400 });

  const r = await sendPlass(a, valgt, { emne, tekst: melding }, meg.epost, new URL(req.url).origin);
  if (r.sendt.length) await bekreftSvar(r.sendt.map(s => s.id), meg.navn);
  if (r.sendt.length) await skrivLogg(meg, 'Ga plass og sendte bekreftelse', `${navnPa(a)} · ${r.sendt.length} stk.`);
  if (r.uten.length) await skrivLogg(meg, 'Bekreftelse ikke sendt', `${navnPa(a)} · mangler e-post: ${r.uten.map(s => navnI(a, s)).join(', ')}`);
  if (r.feil) await skrivLogg(meg, 'Bekreftelse feilet', `${navnPa(a)} · ${r.feil}`);

  const deler = [`${r.sendt.length} har fått bekreftelse på e-post.`];
  if (r.uten.length) deler.push(`${r.uten.length} har ingen e-post og fikk ingen bekreftelse.`);
  if (r.feil) deler.push(`${valgt.length - r.sendt.length - r.uten.length} ble ikke sendt: ${r.feil}`);
  return NextResponse.json({ ok: !r.feil, sendt: r.sendt.length, tekst: deler.join(' ') }, { status: r.feil && !r.sendt.length ? 502 : 200 });
}
