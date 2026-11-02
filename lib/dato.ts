// Datoer håndteres som rene «YYYY-MM-DD»-strenger. All regning skjer i UTC
// slik at sommertid og tidssone på serveren aldri flytter en dag.

const DAGNAVN = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const DAGNAVN_KORT = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];
const MANEDER = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const MANEDER_KORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function tilUtc(dato: string): Date {
  const [a, m, d] = dato.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function fraUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function erGyldigDato(dato: unknown): dato is string {
  return typeof dato === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dato) && fraUtc(tilUtc(dato)) === dato;
}

export function leggTilDager(dato: string, dager: number): string {
  const d = tilUtc(dato);
  d.setUTCDate(d.getUTCDate() + dager);
  return fraUtc(d);
}

// 1 = mandag … 7 = søndag
export function ukedag(dato: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const n = tilUtc(dato).getUTCDay();
  return (n === 0 ? 7 : n) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export function datoer(fra: string, til: string): string[] {
  const ut: string[] = [];
  for (let d = fra; d <= til; d = leggTilDager(d, 1)) ut.push(d);
  return ut;
}

// ISO-ukenummer
export function ukenummer(dato: string): number {
  const d = tilUtc(dato);
  d.setUTCDate(d.getUTCDate() + 4 - ukedag(dato));
  const arStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - arStart) / 86400000 + 1) / 7);
}

export function mandagI(dato: string): string {
  return leggTilDager(dato, 1 - ukedag(dato));
}

export function dagnavn(dato: string, kort = false): string {
  return (kort ? DAGNAVN_KORT : DAGNAVN)[ukedag(dato) - 1];
}

export function dagOgManed(dato: string, kort = false): string {
  const d = tilUtc(dato);
  return `${d.getUTCDate()}. ${(kort ? MANEDER_KORT : MANEDER)[d.getUTCMonth()]}`;
}

export function langDato(dato: string): string {
  const s = `${dagnavn(dato)} ${dagOgManed(dato)}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function tidsrom(time: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(time)}:00–${p(time + 1)}:00`;
}

export function minutter(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Dato og time «nå» i norsk tid, uavhengig av serverens tidssone.
export function naIOslo(): { dato: string; time: number; minutt: number } {
  const deler = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const f = (t: string) => deler.find(p => p.type === t)?.value ?? '';
  return { dato: `${f('year')}-${f('month')}-${f('day')}`, time: Number(f('hour')), minutt: Number(f('minute')) };
}

export function kr(belop: number): string {
  return `${belop.toLocaleString('nb-NO')} kr`;
}
