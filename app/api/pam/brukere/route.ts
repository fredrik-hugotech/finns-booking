import { NextResponse } from 'next/server';
import { bareAdmin, hashPassord, ikkeInne, innlogget, nyttPassord } from '@/lib/pam/tilgang';
import { hentBruker, hentBrukere, lagreBruker, skrivLogg, type PamRolle } from '@/lib/pam/lager';

export const dynamic = 'force-dynamic';

const tekst = (v: unknown, maks: number) => (typeof v === 'string' ? v.trim().slice(0, maks) : '');
const ROLLENAVN: Record<PamRolle, string> = { admin: 'Admin', arrangor: 'Arrangør' };

async function admin() {
  const b = await innlogget();
  return b ? (b.rolle === 'admin' ? b : 'nei') : null;
}

export async function GET() {
  const meg = await admin();
  if (!meg) return ikkeInne();
  if (meg === 'nei') return bareAdmin();
  return NextResponse.json({ brukere: await hentBrukere() });
}

// Ny bruker, endring, eller nytt passord ({ id, nyttPassord: true }).
// Svarer med passordet når et nytt er laget, så admin kan gi det videre.
export async function POST(req: Request) {
  const meg = await admin();
  if (!meg) return ikkeInne();
  if (meg === 'nei') return bareAdmin();
  const b = await req.json().catch(() => ({}));
  const id = typeof b.id === 'string' ? b.id : undefined;
  const navn = tekst(b.navn, 120);
  const epost = tekst(b.epost, 160).toLowerCase();
  const rolle: PamRolle | undefined = b.rolle === 'admin' || b.rolle === 'arrangor' ? b.rolle : undefined;
  const aktiv = typeof b.aktiv === 'boolean' ? b.aktiv : undefined;
  const arrangorer = Array.isArray(b.arrangorer)
    ? [...new Set(b.arrangorer.map((x: unknown) => tekst(x, 80)).filter(Boolean))] as string[]
    : undefined;

  if (epost && !/^\S+@\S+\.\S+$/.test(epost)) return NextResponse.json({ feil: 'Ugyldig e-post.' }, { status: 400 });
  if (epost) {
    const annen = await hentBruker({ epost });
    if (annen && annen.id !== id) return NextResponse.json({ feil: 'Det finnes alt en bruker med den e-posten.' }, { status: 409 });
  }

  if (!id) {
    if (!navn || !epost || !rolle) return NextResponse.json({ feil: 'Fyll inn navn, e-post og rolle.' }, { status: 400 });
    if (rolle === 'arrangor' && !arrangorer?.length) return NextResponse.json({ feil: 'Velg hvilke arrangører brukeren skal se.' }, { status: 400 });
    const passord = nyttPassord();
    await lagreBruker({ navn, epost, rolle, arrangorer: arrangorer ?? [], passord_hash: hashPassord(passord) });
    await skrivLogg(meg, 'La til bruker', `${navn} (${epost}) · ${ROLLENAVN[rolle]}${rolle === 'arrangor' ? ` · ${arrangorer!.join(', ')}` : ''}`);
    return NextResponse.json({ ok: true, passord });
  }

  if (id === meg.id && (aktiv === false || rolle === 'arrangor')) {
    return NextResponse.json({ feil: 'Du kan ikke fjerne din egen admin-tilgang.' }, { status: 400 });
  }
  const for_ = await hentBruker({ id });
  if (!for_) return NextResponse.json({ feil: 'Fant ikke brukeren.' }, { status: 404 });
  const passord = b.nyttPassord === true ? nyttPassord() : undefined;
  await lagreBruker({
    id, navn: navn || undefined, epost: epost || undefined, rolle, aktiv, arrangorer,
    passord_hash: passord ? hashPassord(passord) : undefined,
  });
  const hvem = `${for_.navn} (${for_.epost})`;
  if (passord) await skrivLogg(meg, 'Laget nytt passord', hvem);
  if (rolle && rolle !== for_.rolle) await skrivLogg(meg, 'Endret tilgang', `${hvem} · ${ROLLENAVN[rolle]}`);
  if (arrangorer && arrangorer.join('|') !== for_.arrangorer.join('|')) await skrivLogg(meg, 'Endret arrangører', `${hvem} · ${arrangorer.join(', ') || 'ingen'}`);
  if (aktiv === false && for_.aktiv) await skrivLogg(meg, 'Stengte tilgang', hvem);
  if (aktiv === true && !for_.aktiv) await skrivLogg(meg, 'Åpnet tilgang igjen', hvem);
  if ((navn && navn !== for_.navn) || (epost && epost !== for_.epost)) await skrivLogg(meg, 'Endret bruker', `${hvem} → ${navn || for_.navn} (${epost || for_.epost})`);
  return NextResponse.json({ ok: true, passord });
}
