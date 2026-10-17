import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID, randomInt } from 'crypto';
import type { Bestilling, Sperring, Status } from './tilgjengelighet';

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
export async function lagreBestillinger(linjer: NyBestilling[]): Promise<Bestilling[]> {
  if (erDemo()) {
    const naa = new Date().toISOString();
    const nye = linjer.map(l => ({ ...l, id: randomUUID(), status: 'forespurt' as Status, opprettet: naa }));
    demo().bestillinger.push(...nye);
    return nye;
  }
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
