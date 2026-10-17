// Felles regler for hva som er ledig. Brukes både i nettleseren (visning)
// og på serveren (sjekk før en bestilling lagres), så de aldri kan spriker.

import { FORSTE_TIME, SISTE_TIME, SESONG, STENGTE_DAGER, PRIS } from './config';
import { FASTE_TIDER } from './faste-tider';
import { minutter, ukedag } from './dato';

export type Bane = 'hel' | 'halv';
export type Status = 'forespurt' | 'bekreftet' | 'avlyst';

export type Bestilling = {
  id: string;
  ref: string;
  dato: string;
  time: number;
  bane: Bane;
  status: Status;
  navn: string;
  telefon: string;
  epost: string;
  klubb: string | null;
  kommentar: string | null;
  pris: number;
  serie: string | null;
  opprettet: string;
};

export type Sperring = {
  id: string;
  dato: string;
  fra_time: number;
  til_time: number; // eksklusiv
  arsak: string;
};

// Offentlig oversikt: hvor mange halvdeler som er tatt per «dato|time».
// Inneholder aldri navn eller kontaktinfo.
export type Belegg = {
  brukt: Record<string, number>;
  sperringer: Sperring[];
};

export type Slot = {
  dato: string;
  time: number;
  tilstand: 'ledig' | 'halv' | 'opptatt' | 'stengt' | 'passert' | 'utenfor';
  ledigeHalvdeler: 0 | 1 | 2;
  tekst?: string;
};

export const TIMER: number[] = Array.from({ length: SISTE_TIME - FORSTE_TIME + 1 }, (_, i) => FORSTE_TIME + i);

export const halvdeler = (bane: Bane) => (bane === 'hel' ? 2 : 1);
export const erHelg = (dato: string) => ukedag(dato) >= 6;
export const prisFor = (bane: Bane, dato: string) => PRIS[erHelg(dato) ? 'helg' : 'ukedag'][bane];
export const nokkel = (dato: string, time: number) => `${dato}|${time}`;

export function fastTidFor(dato: string, time: number) {
  const dag = ukedag(dato);
  const start = time * 60;
  const slutt = start + 60;
  return FASTE_TIDER.find(f => f.dag === dag && minutter(f.fra) < slutt && minutter(f.til) > start);
}

export function slot(dato: string, time: number, belegg: Belegg, na: { dato: string; time: number }): Slot {
  const grunn = { dato, time };
  if (dato < SESONG.fra || dato > SESONG.til || !TIMER.includes(time)) {
    return { ...grunn, tilstand: 'utenfor', ledigeHalvdeler: 0 };
  }
  if (dato < na.dato || (dato === na.dato && time <= na.time)) {
    return { ...grunn, tilstand: 'passert', ledigeHalvdeler: 0 };
  }
  if (STENGTE_DAGER[dato]) {
    return { ...grunn, tilstand: 'stengt', ledigeHalvdeler: 0, tekst: STENGTE_DAGER[dato] };
  }
  const sperring = belegg.sperringer.find(s => s.dato === dato && s.fra_time <= time && s.til_time > time);
  if (sperring) {
    return { ...grunn, tilstand: 'stengt', ledigeHalvdeler: 0, tekst: sperring.arsak };
  }
  const fast = fastTidFor(dato, time);
  if (fast) {
    return { ...grunn, tilstand: 'opptatt', ledigeHalvdeler: 0, tekst: fast.lag ? `${fast.klubb} · ${fast.lag}` : fast.klubb };
  }
  const brukt = belegg.brukt[nokkel(dato, time)] ?? 0;
  const ledige = Math.max(0, 2 - brukt) as 0 | 1 | 2;
  if (ledige === 0) return { ...grunn, tilstand: 'opptatt', ledigeHalvdeler: 0, tekst: 'Booket' };
  if (ledige === 1) return { ...grunn, tilstand: 'halv', ledigeHalvdeler: 1, tekst: 'Halv bane ledig' };
  return { ...grunn, tilstand: 'ledig', ledigeHalvdeler: 2 };
}

export function byggBelegg(bestillinger: Pick<Bestilling, 'dato' | 'time' | 'bane' | 'status'>[], sperringer: Sperring[]): Belegg {
  const brukt: Record<string, number> = {};
  for (const b of bestillinger) {
    if (b.status === 'avlyst') continue;
    const k = nokkel(b.dato, b.time);
    brukt[k] = (brukt[k] ?? 0) + halvdeler(b.bane);
  }
  return { brukt, sperringer };
}
