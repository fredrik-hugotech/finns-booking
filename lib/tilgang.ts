import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { erDemo, hentBruker, hentBrukere, lagreBruker, type Bruker, type Rolle } from './lager';

// Innlogging til backoffice. Hver person har egen bruker med rolle:
//   admin  – kan endre alt
//   innsyn – ser bare hvem som har banen
// Økta er en signert cookie med bruker-id og utløpstid. Signaturen tar med
// en del av passord-hashen, så bytte av passord logger ut alle andre økter.

export const OKT_COOKIE = 'snak_okt';
const VARIGHET = 60 * 60 * 24 * 30; // 30 dager

function hemmelighet(): string {
  const s = process.env.SNAK_API_NOKKEL || process.env.ADMIN_PASSWORD || (erDemo() ? 'demo-hemmelighet' : '');
  if (!s) throw new Error('Mangler hemmelighet for økter.');
  return s;
}

export function hashPassord(passord: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(passord, salt, 64).toString('hex')}`;
}

export function riktigPassord(passord: string, hash: string): boolean {
  const [type, salt, fasit] = hash.split('$');
  if (type !== 'scrypt' || !salt || !fasit) return false;
  const a = scryptSync(passord, salt, 64);
  const b = Buffer.from(fasit, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const signer = (id: string, utloper: number, hash: string) =>
  createHmac('sha256', hemmelighet()).update(`${id}.${utloper}.${hash.slice(-16)}`).digest('hex');

export function lagOkt(id: string, hash: string): { verdi: string; maxAge: number } {
  const utloper = Math.floor(Date.now() / 1000) + VARIGHET;
  return { verdi: `${id}.${utloper}.${signer(id, utloper, hash)}`, maxAge: VARIGHET };
}

export const oktValg = (maxAge: number) => ({
  httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge,
});

// Demo-modus får to brukere å teste med, begge med passordet «demo».
async function demoBrukere() {
  if (!erDemo() || (await hentBrukere()).length) return;
  await lagreBruker({ epost: 'admin@demo.no', navn: 'Demo Admin', rolle: 'admin', passord_hash: hashPassord('demo') });
  await lagreBruker({ epost: 'vakt@demo.no', navn: 'Demo Vakt', rolle: 'innsyn', passord_hash: hashPassord('demo') });
}

export async function loggInn(epost: string, passord: string) {
  await demoBrukere();
  const b = await hentBruker({ epost: epost.trim().toLowerCase() });
  if (!b || !b.aktiv || !riktigPassord(passord, b.passord_hash)) return null;
  return b;
}

// Den innloggede brukeren, eller null. Sjekker mot databasen hver gang, så
// en bruker som deaktiveres eller får ny rolle merker det med en gang.
export async function innlogget(): Promise<Bruker | null> {
  const okt = cookies().get(OKT_COOKIE)?.value;
  if (!okt) return null;
  const [id, utloper, sig] = okt.split('.');
  if (!id || !sig || Number(utloper) < Date.now() / 1000) return null;
  const b = await hentBruker({ id }).catch(() => null);
  if (!b || !b.aktiv) return null;
  const fasit = Buffer.from(signer(id, Number(utloper), b.passord_hash));
  const gitt = Buffer.from(sig);
  if (fasit.length !== gitt.length || !timingSafeEqual(fasit, gitt)) return null;
  const { passord_hash, ...bruker } = b;
  return bruker;
}

export async function harRolle(rolle: Rolle): Promise<boolean> {
  const b = await innlogget();
  return !!b && (rolle === 'innsyn' || b.rolle === 'admin');
}

export const erAdmin = () => harRolle('admin');
