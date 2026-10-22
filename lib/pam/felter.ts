// Påmeldingsskjemaer: feltene et arrangement spør om, og sjekk av svarene.
// Brukes både i nettleseren og på serveren.

export type Felttype = 'tekst' | 'epost' | 'telefon' | 'arskull' | 'valg' | 'langtekst';

export type Felt = {
  id: string;
  type: Felttype;
  navn: string;
  pakrevd: boolean;
  valg?: string[];
  fra?: number;
  til?: number;
};

export type Arrangement = {
  id: string;
  slug: string;
  serie: string | null;
  tittel: string;
  fane: string | null;
  arrangor: string;
  info: string | null;
  felter: Felt[];
  partner: string | null;
  aapen: boolean;
  rekkefolge: number;
  opprettet: string;
  antall?: number;
};

export type Svar = { id: string; arrangement_id: string; data: Record<string, string>; opprettet: string };

export const FELTTYPER: Record<Felttype, string> = {
  tekst: 'Tekst',
  epost: 'E-post',
  telefon: 'Telefon',
  arskull: 'Årskull',
  valg: 'Valg fra liste',
  langtekst: 'Lang tekst',
};

export const PARTNERE: Record<string, { navn: string; logo: string }> = {
  start: { navn: 'IK Start', logo: '/partnere/start.png' },
};

export const STANDARDFELTER: Felt[] = [
  { id: 'navn', type: 'tekst', navn: 'Navn', pakrevd: true },
  { id: 'epost', type: 'epost', navn: 'E-post', pakrevd: true },
  { id: 'telefon', type: 'telefon', navn: 'Telefon', pakrevd: false },
];

const EPOST = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const navnPa = (a: Pick<Arrangement, 'tittel' | 'fane'>) => (a.fane ? `${a.tittel} – ${a.fane}` : a.tittel);

// En meny i backoffice samler påmeldingene med samme navn (f.eks. Start-turneen
// med trening og seminar). De vises også som faner på én offentlig side.
export type Meny = { key: string; navn: string; arrangementer: Arrangement[]; antall: number };

export const menyAv = (a: Pick<Arrangement, 'serie' | 'slug'>) => a.serie ?? a.slug;

export function menyer(alle: Arrangement[]): Meny[] {
  const ut = new Map<string, Meny>();
  for (const a of alle) {
    const m = ut.get(menyAv(a)) ?? { key: menyAv(a), navn: a.tittel, arrangementer: [], antall: 0 };
    m.arrangementer.push(a);
    m.antall += a.antall ?? 0;
    ut.set(m.key, m);
  }
  for (const m of ut.values()) m.arrangementer.sort((a, b) => a.rekkefolge - b.rekkefolge || a.opprettet.localeCompare(b.opprettet));
  return [...ut.values()].sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
}

export function lagSlug(tekst: string): string {
  return tekst.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function arskullFor(f: Felt): number[] {
  const til = f.til ?? new Date().getFullYear();
  const fra = f.fra ?? til - 20;
  const ut: number[] = [];
  for (let y = til; y >= fra; y--) ut.push(y);
  return ut;
}

// Rydder og sjekker svarene. Gir feil per felt, eller rene data.
export function sjekkSvar(felter: Felt[], inn: Record<string, unknown>): { data: Record<string, string>; feil: Record<string, string> } {
  const data: Record<string, string> = {};
  const feil: Record<string, string> = {};
  for (const f of felter) {
    const maks = f.type === 'langtekst' ? 2000 : 200;
    const v = typeof inn[f.id] === 'string' ? (inn[f.id] as string).trim().slice(0, maks) : '';
    if (!v) {
      if (f.pakrevd) feil[f.id] = f.type === 'valg' || f.type === 'arskull' ? `Velg ${f.navn.toLowerCase()}.` : `Fyll inn ${f.navn.toLowerCase()}.`;
      continue;
    }
    if (f.type === 'epost' && !EPOST.test(v)) feil[f.id] = 'Skriv inn en gyldig e-postadresse.';
    else if (f.type === 'telefon' && v.replace(/\D/g, '').length < 8) feil[f.id] = 'Skriv inn et gyldig telefonnummer.';
    else if (f.type === 'arskull' && !arskullFor(f).includes(Number(v))) feil[f.id] = 'Velg et årskull fra lista.';
    else if (f.type === 'valg' && !(f.valg ?? []).includes(v)) feil[f.id] = 'Velg fra lista.';
    data[f.id] = f.type === 'epost' ? v.toLowerCase() : v;
  }
  return { data, feil };
}

// Sjekker et skjema som admin har satt opp.
export function sjekkFelter(inn: unknown): Felt[] | string {
  if (!Array.isArray(inn) || !inn.length) return 'Legg til minst ett felt.';
  const ider = new Set<string>();
  const ut: Felt[] = [];
  for (const r of inn) {
    const navn = typeof r?.navn === 'string' ? r.navn.trim().slice(0, 80) : '';
    if (!navn) return 'Alle felt må ha et navn.';
    if (!(r.type in FELTTYPER)) return `Ukjent felttype for «${navn}».`;
    let id = typeof r.id === 'string' && /^[a-z0-9_]{1,40}$/.test(r.id) ? r.id : lagSlug(navn).replace(/-/g, '_') || 'felt';
    while (ider.has(id)) id += '_2';
    ider.add(id);
    const f: Felt = { id, type: r.type, navn, pakrevd: r.pakrevd !== false };
    if (f.type === 'valg') {
      f.valg = (Array.isArray(r.valg) ? r.valg : []).map((v: unknown) => String(v).trim().slice(0, 80)).filter(Boolean).slice(0, 50);
      if (!f.valg!.length) return `Legg inn valg for «${navn}».`;
    }
    if (f.type === 'arskull') {
      const fra = Number(r.fra), til = Number(r.til);
      if (!Number.isInteger(fra) || !Number.isInteger(til) || fra < 1900 || til > 2100 || fra > til) return `Ugyldig årskull for «${navn}».`;
      f.fra = fra;
      f.til = til;
    }
    ut.push(f);
  }
  return ut.slice(0, 30);
}

// Excel i Norge forventer semikolon og BOM for å vise æøå riktig.
export function tilCsv(felter: Felt[], svar: Svar[]): string {
  const celle = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const hode = ['Tidspunkt', ...felter.map(f => f.navn)];
  const rader = svar.map(s => [
    new Date(s.opprettet).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' }),
    ...felter.map(f => s.data[f.id] ?? ''),
  ]);
  return '﻿' + [hode, ...rader].map(r => r.map(celle).join(';')).join('\r\n');
}
