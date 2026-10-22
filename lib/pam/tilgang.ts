import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { erDemo } from '../lager';
import { hashPassord, riktigPassord } from '../tilgang';
import { hentBruker, hentBrukere, lagreBruker, type PamBruker } from './lager';
import type { Arrangement } from './felter';

// Innlogging til påmeldings-backoffice. Egne brukere og egen cookie, så
// tilgang hit gir aldri tilgang til banebookingen, og omvendt.

export const PAM_COOKIE = 'pam_okt';
const VARIGHET = 60 * 60 * 24 * 30;

function hemmelighet(): string {
  const s = process.env.SNAK_API_NOKKEL || process.env.ADMIN_PASSWORD || (erDemo() ? 'demo-hemmelighet' : '');
  if (!s) throw new Error('Mangler hemmelighet for økter.');
  return s;
}

const signer = (id: string, utloper: number, hash: string) =>
  createHmac('sha256', hemmelighet()).update(`pam.${id}.${utloper}.${hash.slice(-16)}`).digest('hex');

export function lagOkt(id: string, hash: string): { verdi: string; maxAge: number } {
  const utloper = Math.floor(Date.now() / 1000) + VARIGHET;
  return { verdi: `${id}.${utloper}.${signer(id, utloper, hash)}`, maxAge: VARIGHET };
}

export const oktValg = (maxAge: number) => ({
  httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge,
});

// Lett å lese opp eller skrive av: fire grupper uten tegn som ligner hverandre.
export function nyttPassord(): string {
  const tegn = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => tegn[randomInt(tegn.length)]).join('')).join('-');
}

async function demoBrukere() {
  if (!erDemo() || (await hentBrukere()).length) return;
  await lagreBruker({ epost: 'admin@demo.no', navn: 'Demo Admin', rolle: 'admin', arrangorer: [], passord_hash: hashPassord('demo') });
  await lagreBruker({ epost: 'start@demo.no', navn: 'Demo Start', rolle: 'arrangor', arrangorer: ['IK Start'], passord_hash: hashPassord('demo') });
}

export async function loggInn(epost: string, passord: string) {
  await demoBrukere();
  const b = await hentBruker({ epost: epost.trim().toLowerCase() });
  if (!b || !b.aktiv || !riktigPassord(passord, b.passord_hash)) return null;
  return b;
}

export async function innlogget(): Promise<PamBruker | null> {
  const okt = cookies().get(PAM_COOKIE)?.value;
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

export const kanSe = (b: PamBruker, a: Pick<Arrangement, 'arrangor'>) =>
  b.rolle === 'admin' || b.arrangorer.some(x => x.toLowerCase() === a.arrangor.toLowerCase());

export const ikkeInne = () => NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
export const bareAdmin = () => NextResponse.json({ feil: 'Bare for admin.' }, { status: 403 });

export { hashPassord, riktigPassord };
