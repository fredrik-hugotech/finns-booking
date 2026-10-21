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
  minutt: number; // 0 eller 30: starter på hel eller halv time
  lengde: number; // 30 eller 60 minutter
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

// Offentlig oversikt: hvor mange halvdeler bookinger og holdte timer tar
// per halvtime («dato|minutter etter midnatt»), sperringer og klubbtider.
// Inneholder aldri kontaktinfo.
export type Belegg = {
  brukt: Record<string, number>;
  sperringer: Sperring[];
  klubbtider: OffentligKlubbtid[];
};

export type Na = { dato: string; time: number; minutt?: number };

export type Slot = {
  dato: string;
  time: number;
  tilstand: 'ledig' | 'halv' | 'opptatt' | 'stengt' | 'passert' | 'utenfor';
  ledigeHalvdeler: 0 | 1 | 2;
  tekst?: string;
};

export const TIMER: number[] = Array.from({ length: SISTE_TIME - FORSTE_TIME + 1 }, (_, i) => FORSTE_TIME + i);
// Starten på hver halvtime som kan bookes, i minutter etter midnatt (08:00 … 22:30).
export const HALVTIMER: number[] = TIMER.flatMap(t => [t * 60, t * 60 + 30]);

export const halvdeler = (bane: Bane) => (bane === 'hel' ? 2 : 1);
export const erHelg = (dato: string) => ukedag(dato) >= 6;
// Timepris for banen; en halvtime koster halvparten.
export const prisFor = (bane: Bane, dato: string, priser: Priser, lengde = 60) =>
  Math.round((priser[erHelg(dato) ? 'helg' : 'ukedag'][bane] * lengde) / 60);
export const nokkel = (dato: string, start: number) => `${dato}|${start}`;

// Start og lengde i minutter for en booking (eldre rader har hele timer).
export const startAv = (b: { time: number; minutt?: number }) => b.time * 60 + (b.minutt ?? 0);
export const lengdeAv = (b: { lengde?: number }) => b.lengde ?? 60;
export const halvtimerI = (start: number, lengde: number) => Array.from({ length: lengde / 30 }, (_, i) => start + i * 30);
export const klokke = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const tidFor = (b: { time: number; minutt?: number; lengde?: number }) => `${klokke(startAv(b))}–${klokke(startAv(b) + lengdeAv(b))}`;
export const varighet = (min: number) =>
  min === 30 ? '30 min' : min === 60 ? '1 time' : `${(min / 60).toLocaleString('nb-NO')} timer`;

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

// Én halvtime, `start` i minutter etter midnatt.
export function halvslot(dato: string, start: number, belegg: Belegg, na: Na): Slot {
  const grunn = { dato, time: Math.floor(start / 60) };
  if (dato < SESONG.fra || dato > SESONG.til || start < FORSTE_TIME * 60 || start >= (SISTE_TIME + 1) * 60 || start % 30) {
    return { ...grunn, tilstand: 'utenfor', ledigeHalvdeler: 0 };
  }
  if (dato < na.dato || (dato === na.dato && start <= na.time * 60 + (na.minutt ?? 0))) {
    return { ...grunn, tilstand: 'passert', ledigeHalvdeler: 0 };
  }
  if (STENGTE_DAGER[dato]) {
    return { ...grunn, tilstand: 'stengt', ledigeHalvdeler: 0, tekst: STENGTE_DAGER[dato] };
  }
  const sperring = belegg.sperringer.find(s => s.dato === dato && s.fra_time * 60 <= start && s.til_time * 60 > start);
  if (sperring) {
    return { ...grunn, tilstand: 'stengt', ledigeHalvdeler: 0, tekst: sperring.arsak };
  }
  const dag = ukedag(dato);
  const klubber = belegg.klubbtider
    .filter(k => k.dag === dag && !k.unntak.includes(dato) && minutter(k.fra) <= start && minutter(k.til) > start);
  const klubb = Math.min(2, klubber.reduce((n, k) => n + halvdeler(k.bane), 0));
  const brukt = klubb + (belegg.brukt[nokkel(dato, start)] ?? 0);
  const ledige = Math.max(0, 2 - brukt) as 0 | 1 | 2;
  if (ledige === 0) {
    return { ...grunn, tilstand: 'opptatt', ledigeHalvdeler: 0, tekst: klubber.length ? [...new Set(klubber.map(klubbNavn))].join(' / ') : 'Booket' };
  }
  if (ledige === 1) return { ...grunn, tilstand: 'halv', ledigeHalvdeler: 1, tekst: 'Halv bane ledig' };
  return { ...grunn, tilstand: 'ledig', ledigeHalvdeler: 2 };
}

// Hel time (time:00–time+1:00): ledig bare så langt begge halvtimene er det.
export function slot(dato: string, time: number, belegg: Belegg, na: Na): Slot {
  const a = halvslot(dato, time * 60, belegg, na);
  const b = halvslot(dato, time * 60 + 30, belegg, na);
  if (a.ledigeHalvdeler <= b.ledigeHalvdeler && a.tilstand !== 'ledig') {
    if (a.ledigeHalvdeler === 0 && b.ledigeHalvdeler === 0 && b.tekst && a.tekst && a.tekst !== b.tekst && a.tilstand === b.tilstand) {
      return { ...a, tekst: `${a.tekst} / ${b.tekst}` };
    }
    return a;
  }
  return b.ledigeHalvdeler < a.ledigeHalvdeler || b.tilstand !== 'ledig' ? b : a;
}

// Ledige halvdeler for et tidsrom: det minste av halvtimene i det.
export function ledigIntervall(dato: string, start: number, lengde: number, belegg: Belegg, na: Na): 0 | 1 | 2 {
  return Math.min(...halvtimerI(start, lengde).map(s => halvslot(dato, s, belegg, na).ledigeHalvdeler)) as 0 | 1 | 2;
}

export type HoldtHalv = { dato: string; start: number; bane: Bane };

export function byggBelegg(
  bestillinger: (Pick<Bestilling, 'dato' | 'time' | 'bane' | 'status'> & { minutt?: number; lengde?: number })[],
  sperringer: Sperring[],
  klubbtider: OffentligKlubbtid[],
  holdt: HoldtHalv[] = [],
): Belegg {
  const brukt: Record<string, number> = {};
  for (const b of bestillinger) {
    if (b.status === 'avlyst') continue;
    for (const s of halvtimerI(startAv(b), lengdeAv(b))) {
      const k = nokkel(b.dato, s);
      brukt[k] = (brukt[k] ?? 0) + halvdeler(b.bane);
    }
  }
  // Halvtimer andre holder på å booke, teller som opptatt.
  for (const h of holdt) {
    const k = nokkel(h.dato, h.start);
    brukt[k] = (brukt[k] ?? 0) + halvdeler(h.bane);
  }
  return { brukt, sperringer, klubbtider: klubbtider.map(k => ('kontakt' in k ? utenKontakt(k as Klubbtid) : k)) };
}
