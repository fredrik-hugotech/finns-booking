import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID, randomInt } from 'crypto';
import { halvdeler, type Bane, type Bestilling, type Klubbtid, type Sperring, type Status } from './tilgjengelighet';
import { KLUBBTIDER_START } from './klubbtider-start';
import { STANDARD_PRIS, type Priser } from './config';

// Lagring: Supabase når miljøvariablene er satt, ellers minne (demo-modus,
// tømmes ved omstart). Begge gir samme grensesnitt.
//
// Serveren snakker med databasen gjennom funksjoner (supabase/schema.sql) som
// krever SNAK_API_NOKKEL. Tabellene er stengt for alle andre.

type NyBestilling = Omit<Bestilling, 'id' | 'opprettet' | 'status'>;

export class OpptattFeil extends Error {}

let klient: SupabaseClient | null | undefined;
function supabase(): SupabaseClient | null {
  if (klient !== undefined) return klient;
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  klient = url && anon && process.env.SNAK_API_NOKKEL ? createClient(url, anon, { auth: { persistSession: false } }) : null;
  return klient;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase()!.rpc(fn, { p_nokkel: process.env.SNAK_API_NOKKEL, ...args });
  if (error) {
    if (error.message.includes('OPPTATT')) throw new OpptattFeil();
    throw error;
  }
  return data as T;
}

export const erDemo = () => supabase() === null;

const minne = globalThis as unknown as { __snak?: { bestillinger: Bestilling[]; sperringer: Sperring[] } };
const demoEkstra = globalThis as unknown as { __snakPriser?: Priser; __snakKlubbtider?: Klubbtid[]; __snakBrukere?: BrukerMedHash[]; __snakLogg?: Loggrad[]; __snakHoldt?: (Holdt & { okt: string; utloper: number })[] };
const demo = () => (minne.__snak ??= { bestillinger: [], sperringer: [] });

export function nyRef(): string {
  const tegn = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return 'SNAK-' + Array.from({ length: 5 }, () => tegn[randomInt(tegn.length)]).join('');
}

export async function hentBestillinger(fra?: string): Promise<Bestilling[]> {
  if (erDemo()) {
    return demo().bestillinger.filter(b => !fra || b.dato >= fra).sort((a, b) => (a.dato + a.time).localeCompare(b.dato + b.time));
  }
  return rpc<Bestilling[]>('snak_hent_bestillinger', { p_fra: fra ?? null });
}

export async function hentSperringer(): Promise<Sperring[]> {
  if (erDemo()) return [...demo().sperringer].sort((a, b) => a.dato.localeCompare(b.dato));
  return rpc<Sperring[]>('snak_hent_sperringer');
}

// Lagrer alle linjene samlet, eller ingen. Databasen sjekker selv at ingen
// time blir overbooket (trigger i supabase/schema.sql), så to som trykker
// samtidig kan ikke få samme bane.
// Med `okt` slippes øktas holdte timer i samme transaksjon som bestillingen
// lagres, så ingen andre kan ta dem i mellomtiden.
export async function lagreBestillinger(linjer: NyBestilling[], okt?: string): Promise<Bestilling[]> {
  if (erDemo()) {
    if (okt) demoEkstra.__snakHoldt = demoHoldt().filter(h => h.okt !== okt);
    const naa = new Date().toISOString();
    const nye = linjer.map(l => ({ ...l, id: randomUUID(), status: 'forespurt' as Status, opprettet: naa }));
    demo().bestillinger.push(...nye);
    return nye;
  }
  if (okt) return rpc<Bestilling[]>('snak_bestill', { p_okt: okt, p_linjer: linjer });
  return rpc<Bestilling[]>('snak_lagre_bestillinger', { p_linjer: linjer });
}

export async function settStatus(ider: string[], status: Status): Promise<void> {
  if (erDemo()) {
    for (const b of demo().bestillinger) if (ider.includes(b.id)) b.status = status;
    return;
  }
  await rpc('snak_sett_status', { p_ider: ider, p_status: status });
}

export async function lagreSperring(s: Omit<Sperring, 'id'>): Promise<void> {
  if (erDemo()) {
    demo().sperringer.push({ ...s, id: randomUUID() });
    return;
  }
  await rpc('snak_lagre_sperring', { p_dato: s.dato, p_fra: s.fra_time, p_til: s.til_time, p_arsak: s.arsak });
}

export async function slettSperring(id: string): Promise<void> {
  if (erDemo()) {
    demo().sperringer = demo().sperringer.filter(s => s.id !== id);
    return;
  }
  await rpc('snak_fjern_sperring', { p_id: id });
}

export type Endringer = Partial<Pick<Bestilling, 'dato' | 'time' | 'bane' | 'pris' | 'navn' | 'telefon' | 'epost' | 'klubb' | 'kommentar'>>;

export async function oppdaterBestillinger(ider: string[], endringer: Endringer): Promise<Bestilling[]> {
  if (erDemo()) {
    const rader = demo().bestillinger.filter(b => ider.includes(b.id));
    for (const b of rader) Object.assign(b, endringer);
    return rader;
  }
  return rpc<Bestilling[]>('snak_oppdater_bestillinger', { p_ider: ider, p_endringer: endringer });
}

export async function hentPriser(): Promise<Priser> {
  if (erDemo()) return (demoEkstra.__snakPriser ??= STANDARD_PRIS);
  return (await rpc<Priser | null>('snak_hent_priser')) ?? STANDARD_PRIS;
}

export async function lagrePriser(priser: Priser): Promise<void> {
  if (erDemo()) {
    demoEkstra.__snakPriser = priser;
    return;
  }
  await rpc('snak_lagre_priser', { p_priser: priser });
}

export async function hentKlubbtider(): Promise<Klubbtid[]> {
  if (erDemo()) {
    return (demoEkstra.__snakKlubbtider ??= KLUBBTIDER_START.map(k => ({ ...k, id: randomUUID(), unntak: [] })));
  }
  const rader = await rpc<Klubbtid[]>('snak_hent_klubbtider');
  return rader.map(k => ({ ...k, unntak: k.unntak ?? [] }));
}

// Ny klubbtid når id mangler, ellers endring av en eksisterende.
export async function lagreKlubbtid(k: Omit<Klubbtid, 'id'> & { id?: string }): Promise<void> {
  if (erDemo()) {
    const alle = await hentKlubbtider();
    const i = alle.findIndex(x => x.id === k.id);
    if (i >= 0) alle[i] = { ...alle[i], ...k } as Klubbtid;
    else alle.push({ ...k, id: randomUUID() });
    return;
  }
  await rpc('snak_lagre_klubbtid', { p_k: k });
}

export async function fjernKlubbtid(id: string): Promise<void> {
  if (erDemo()) {
    demoEkstra.__snakKlubbtider = (await hentKlubbtider()).filter(k => k.id !== id);
    return;
  }
  await rpc('snak_fjern_klubbtid', { p_id: id });
}

// Brukere i backoffice. `passord_hash` forlater aldri serveren.
export type Rolle = 'admin' | 'innsyn';
export type Bruker = { id: string; epost: string; navn: string; rolle: Rolle; aktiv: boolean; opprettet?: string; sist_inne?: string | null };
export type BrukerMedHash = Bruker & { passord_hash: string };

const demoBrukere = () => (demoEkstra.__snakBrukere ??= []);

export async function hentBruker(sok: { id?: string; epost?: string }): Promise<BrukerMedHash | null> {
  if (erDemo()) {
    return demoBrukere().find(b => (sok.id && b.id === sok.id) || (sok.epost && b.epost === sok.epost.toLowerCase())) ?? null;
  }
  const rader = await rpc<BrukerMedHash[]>('snak_hent_bruker', { p_id: sok.id ?? null, p_epost: sok.epost ?? null });
  return rader[0] ?? null;
}

export async function hentBrukere(): Promise<Bruker[]> {
  if (erDemo()) return demoBrukere().map(({ passord_hash, ...b }) => b);
  return rpc<Bruker[]>('snak_hent_brukere');
}

export async function lagreBruker(b: Partial<BrukerMedHash>): Promise<string> {
  if (erDemo()) {
    const alle = demoBrukere();
    const finnes = alle.find(x => x.id === b.id);
    if (finnes) {
      Object.assign(finnes, Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)));
      return finnes.id;
    }
    const ny = { aktiv: true, opprettet: new Date().toISOString(), sist_inne: null, ...b, id: randomUUID() } as BrukerMedHash;
    alle.push(ny);
    return ny.id;
  }
  return rpc<string>('snak_lagre_bruker', { p_b: b });
}

export async function markerInne(id: string): Promise<void> {
  if (erDemo()) {
    const b = demoBrukere().find(x => x.id === id);
    if (b) b.sist_inne = new Date().toISOString();
    return;
  }
  await rpc('snak_bruker_inne', { p_id: id });
}

// Logg over handlinger i backoffice. Skriving feiler aldri handlingen selv.
export type Loggrad = { id: number; tid: string; bruker_id: string | null; hvem: string; handling: string; detaljer: string | null };
const demoLogg = () => (demoEkstra.__snakLogg ??= []);

export async function skrivLogg(hvem: { id?: string | null; navn: string }, handling: string, detaljer?: string): Promise<void> {
  try {
    if (erDemo()) {
      demoLogg().unshift({ id: demoLogg().length + 1, tid: new Date().toISOString(), bruker_id: hvem.id ?? null, hvem: hvem.navn, handling, detaljer: detaljer ?? null });
      return;
    }
    await rpc('snak_skriv_logg', { p_bruker: hvem.id ?? null, p_hvem: hvem.navn, p_handling: handling, p_detaljer: detaljer ?? null });
  } catch (e) {
    console.error('Kunne ikke skrive logg', e);
  }
}

export async function hentLogg(antall = 1000): Promise<Loggrad[]> {
  if (erDemo()) return demoLogg().slice(0, antall);
  return rpc<Loggrad[]>('snak_hent_logg', { p_antall: antall });
}

// Holdte timer: valgte timer holdes av for en nettleser-økt i noen minutter,
// så den som valgte først får dem mens skjemaet fylles ut.
export const HOLD_MINUTTER = 10;
export type Holdt = { dato: string; time: number; bane: Bane };
const demoHoldt = () => (demoEkstra.__snakHoldt ??= []);

// Aktive holdte timer, unntatt den gitte øktas egne.
export async function hentHoldt(unntattOkt?: string): Promise<Holdt[]> {
  if (erDemo()) {
    return demoHoldt().filter(h => h.utloper > Date.now() && h.okt !== unntattOkt).map(({ dato, time, bane }) => ({ dato, time, bane }));
  }
  const rader = await rpc<{ h_dato: string; h_time: number; h_bane: Bane }[]>('snak_hent_holdt', { p_okt: unntattOkt ?? null });
  return rader.map(r => ({ dato: r.h_dato, time: r.h_time, bane: r.h_bane }));
}

// Hold av timene for økta (erstatter det den holdt før). `plass` er ledige
// halvdeler etter klubbtider og sperringer. Svarer med timene som ikke fikk plass.
export async function hold(okt: string, linjer: (Holdt & { plass: number })[]): Promise<{ dato: string; time: number }[]> {
  if (erDemo()) {
    const na = Date.now();
    const andre = demoHoldt().filter(h => h.okt !== okt && h.utloper > na);
    const avvist: { dato: string; time: number }[] = [];
    const mine: (Holdt & { okt: string; utloper: number })[] = [];
    for (const l of linjer) {
      const brukt = demo().bestillinger.filter(b => b.status !== 'avlyst' && b.dato === l.dato && b.time === l.time).reduce((n, b) => n + halvdeler(b.bane), 0)
        + andre.filter(h => h.dato === l.dato && h.time === l.time).reduce((n, h) => n + halvdeler(h.bane), 0);
      if (brukt + halvdeler(l.bane) > l.plass) avvist.push({ dato: l.dato, time: l.time });
      else mine.push({ dato: l.dato, time: l.time, bane: l.bane, okt, utloper: na + HOLD_MINUTTER * 60_000 });
    }
    demoEkstra.__snakHoldt = [...andre, ...mine];
    return avvist;
  }
  const rader = await rpc<{ avvist_dato: string; avvist_time: number }[]>('snak_hold', {
    p_okt: okt, p_linjer: linjer, p_minutter: HOLD_MINUTTER,
  });
  return rader.map(r => ({ dato: r.avvist_dato, time: r.avvist_time }));
}
