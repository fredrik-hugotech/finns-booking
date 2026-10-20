import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { hashPassord, innlogget } from '@/lib/tilgang';
import { hentBruker, hentBrukere, lagreBruker, type Rolle } from '@/lib/lager';

export const dynamic = 'force-dynamic';

const tekst = (v: unknown, maks: number) => (typeof v === 'string' ? v.trim().slice(0, maks) : '');

// Lett å lese opp eller skrive av: fire grupper uten tegn som ligner hverandre.
function nyttPassord(): string {
  const tegn = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => tegn[randomInt(tegn.length)]).join('')).join('-');
}

async function admin() {
  const b = await innlogget();
  return b?.rolle === 'admin' ? b : null;
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ feil: 'Bare for admin.' }, { status: 403 });
  return NextResponse.json({ brukere: await hentBrukere() });
}

// Ny bruker, endring, eller nytt passord ({ id, nyttPassord: true }).
// Svarer med passordet når et nytt er laget, så admin kan gi det videre.
export async function POST(req: Request) {
  const meg = await admin();
  if (!meg) return NextResponse.json({ feil: 'Bare for admin.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = typeof b.id === 'string' ? b.id : undefined;
  const navn = tekst(b.navn, 120);
  const epost = tekst(b.epost, 160).toLowerCase();
  const rolle: Rolle | undefined = b.rolle === 'admin' || b.rolle === 'innsyn' ? b.rolle : undefined;
  const aktiv = typeof b.aktiv === 'boolean' ? b.aktiv : undefined;

  if (epost && !/^\S+@\S+\.\S+$/.test(epost)) return NextResponse.json({ feil: 'Ugyldig e-post.' }, { status: 400 });
  if (epost) {
    const annen = await hentBruker({ epost });
    if (annen && annen.id !== id) return NextResponse.json({ feil: 'Det finnes alt en bruker med den e-posten.' }, { status: 409 });
  }

  if (!id) {
    if (!navn || !epost || !rolle) return NextResponse.json({ feil: 'Fyll inn navn, e-post og rolle.' }, { status: 400 });
    const passord = nyttPassord();
    await lagreBruker({ navn, epost, rolle, passord_hash: hashPassord(passord) });
    return NextResponse.json({ ok: true, passord });
  }

  // Ingen kan stenge seg selv ute, og det må alltid finnes en aktiv admin.
  if (id === meg.id && (aktiv === false || rolle === 'innsyn')) {
    return NextResponse.json({ feil: 'Du kan ikke fjerne din egen admin-tilgang.' }, { status: 400 });
  }
  const passord = b.nyttPassord === true ? nyttPassord() : undefined;
  await lagreBruker({
    id, navn: navn || undefined, epost: epost || undefined, rolle, aktiv,
    passord_hash: passord ? hashPassord(passord) : undefined,
  });
  return NextResponse.json({ ok: true, passord });
}
