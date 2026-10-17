// Felles regler for hva som er ledig. Brukes både i nettleseren (visning)
// og på serveren (sjekk før en bestilling lagres), så de aldri kan spriker.

import { FORSTE_TIME, SISTE_TIME, SESONG, STENGTE_DAGER, type Priser } from './config';
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

// Fast ukentlig klubbtid. Tidene er «HH:MM» og kan starte og slutte på
// halvtimer. `unntak` er datoer der tida er frigitt og kan bookes av andre.
export type Klubbtid = {
  id: string;
  dag: number; // 1 = mandag … 7 = søndag
  fra: string;
  til: string;
  bane: Bane;
  klubb: string;
  lag: string | null;
  kontakt: string | null;
  telefon: string | null;
  epost: string | null;
  unntak: string[];
};
export type OffentligKlubbtid = Omit<Klubbtid, 'kontakt' | 'telefon' | 'epost'>;

export const utenKontakt = ({ kontakt, telefon, epost, ...k }: Klubbtid): OffentligKlubbtid => k;
export const klubbNavn = (k: Pick<Klubbtid, 'klubb' | 'lag'>) => (k.lag ? `${k.klubb} · ${k.lag}` : k.klubb);

// Offentlig oversikt: hvor mange halvdeler bookinger tar per «dato|time»,
// sperringer og klubbtider. Inneholder aldri kontaktinfo.
export type Belegg = {
  brukt: Record<string, number>;
  sperringer: Sperring[];
  klubbtider: OffentligKlubbtid[];
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
export const prisFor = (bane: Bane, dato: string, priser: Priser) => priser[erHelg(dato) ? 'helg' : 'ukedag'][bane];
export const nokkel = (dato: string, time: number) => `${dato}|${time}`;

// Klubbtidene som gjelder en dato og overlapper timen (time:00–time+1:00).
export function klubbtiderFor(klubbtider: OffentligKlubbtid[], dato: string, time: number) {
  const dag = ukedag(dato);
  const start = time * 60;
  return klubbtider
    .filter(k => k.dag === dag && !k.unntak.includes(dato) && minutter(k.fra) < start + 60 && minutter(k.til) > start)
    .sort((a, b) => a.fra.localeCompare(b.fra) || a.klubb.localeCompare(b.klubb));
}

// Halvdeler klubbene bruker i timen. Regnes per halvtime, så to klubber som
// har banen etter hverandre (16:00–16:30 og 16:30–17:30) ikke telles dobbelt.
export function klubbHalvdeler(klubbtider: OffentligKlubbtid[], time: number) {
  let maks = 0;
  for (const s of [time * 60, time * 60 + 30]) {
    const sum = klubbtider.filter(k => minutter(k.fra) <= s && minutter(k.til) > s).reduce((n, k) => n + halvdeler(k.bane), 0);
    maks = Math.max(maks, sum);
  }
  return Math.min(2, maks);
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
  const klubber = klubbtiderFor(belegg.klubbtider, dato, time);
  const klubb = klubbHalvdeler(klubber, time);
  const brukt = klubb + (belegg.brukt[nokkel(dato, time)] ?? 0);
  const ledige = Math.max(0, 2 - brukt) as 0 | 1 | 2;
  if (ledige === 0) {
    return { ...grunn, tilstand: 'opptatt', ledigeHalvdeler: 0, tekst: klubber.length ? [...new Set(klubber.map(klubbNavn))].join(' / ') : 'Booket' };
  }
  if (ledige === 1) return { ...grunn, tilstand: 'halv', ledigeHalvdeler: 1, tekst: 'Halv bane ledig' };
  return { ...grunn, tilstand: 'ledig', ledigeHalvdeler: 2 };
}

export function byggBelegg(
  bestillinger: Pick<Bestilling, 'dato' | 'time' | 'bane' | 'status'>[],
  sperringer: Sperring[],
  klubbtider: OffentligKlubbtid[],
): Belegg {
  const brukt: Record<string, number> = {};
  for (const b of bestillinger) {
    if (b.status === 'avlyst') continue;
    const k = nokkel(b.dato, b.time);
    brukt[k] = (brukt[k] ?? 0) + halvdeler(b.bane);
  }
  return { brukt, sperringer, klubbtider: klubbtider.map(k => ('kontakt' in k ? utenKontakt(k as Klubbtid) : k)) };
}
