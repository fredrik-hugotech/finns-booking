import { randomUUID } from 'crypto';
import { erDemo, rpc } from '../lager';
import type { Arrangement, Svar } from './felter';

// Lagring for påmeldinger: databasefunksjonene i supabase/pameldinger.sql,
// eller minne i demo-modus (samme grensesnitt).

export class StengtFeil extends Error {}

export type PamRolle = 'admin' | 'arrangor';
export type PamBruker = {
  id: string; epost: string; navn: string; rolle: PamRolle; arrangorer: string[]; aktiv: boolean;
  opprettet?: string; sist_inne?: string | null;
};
export type PamBrukerMedHash = PamBruker & { passord_hash: string };
export type PamLoggrad = { id: number; tid: string; bruker_id: string | null; hvem: string; handling: string; detaljer: string | null };

type Demo = { arrangementer: Arrangement[]; svar: Svar[]; brukere: PamBrukerMedHash[]; logg: PamLoggrad[] };
const g = globalThis as unknown as { __pam?: Demo };

function demo(): Demo {
  if (g.__pam) return g.__pam;
  const naa = new Date().toISOString();
  const felles = { serie: 'start-turneen', tittel: 'Start-turneen', arrangor: 'IK Start', info: null, partner: 'start', aapen: true, opprettet: naa };
  g.__pam = {
    arrangementer: [
      {
        ...felles, id: randomUUID(), slug: 'start-turneen-trening', fane: 'Trening', rekkefolge: 1,
        felter: [
          { id: 'navn', type: 'tekst', navn: 'Deltakers navn', pakrevd: true },
          { id: 'arskull', type: 'arskull', navn: 'Deltakers årskull', pakrevd: true, fra: 2006, til: 2021 },
          { id: 'epost', type: 'epost', navn: 'E-post til foresatt', pakrevd: true },
        ],
      },
      {
        ...felles, id: randomUUID(), slug: 'start-turneen-seminar', fane: 'Seminar', rekkefolge: 2,
        felter: [
          { id: 'navn', type: 'tekst', navn: 'Deltakers navn', pakrevd: true },
          { id: 'epost', type: 'epost', navn: 'Deltakers e-post', pakrevd: true },
        ],
      },
    ],
    svar: [],
    brukere: [],
    logg: [],
  };
  return g.__pam;
}

export async function hentArrangementer(): Promise<Arrangement[]> {
  if (erDemo()) {
    const d = demo();
    return d.arrangementer.map(a => ({ ...a, antall: d.svar.filter(s => s.arrangement_id === a.id).length }));
  }
  const rader = await rpc<(Arrangement & { antall: number | string })[]>('pam_hent_arrangementer');
  return rader.map(r => ({ ...r, antall: Number(r.antall) }));
}

// Arrangementet med denne sluggen, eller alle i serien.
export async function hentForSide(slug: string): Promise<Arrangement[]> {
  const alle = await hentArrangementer();
  const ett = alle.find(a => a.slug === slug);
  if (ett) return [ett];
  return alle.filter(a => a.serie === slug).sort((a, b) => a.rekkefolge - b.rekkefolge);
}

export async function lagreArrangement(a: Partial<Arrangement>): Promise<string> {
  if (erDemo()) {
    const d = demo();
    const finnes = d.arrangementer.find(x => x.id === a.id);
    if (finnes) {
      Object.assign(finnes, Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)));
      return finnes.id;
    }
    const ny = { serie: null, fane: null, info: null, partner: null, aapen: true, rekkefolge: 0, felter: [], ...a, id: randomUUID(), opprettet: new Date().toISOString() } as Arrangement;
    d.arrangementer.unshift(ny);
    return ny.id;
  }
  const { antall, opprettet, ...rest } = a;
  return rpc<string>('pam_lagre_arrangement', { p_a: rest });
}

export async function hentSvar(arrangementId: string): Promise<Svar[]> {
  if (erDemo()) return demo().svar.filter(s => s.arrangement_id === arrangementId);
  return rpc<Svar[]>('pam_hent_svar', { p_arrangement: arrangementId });
}

export async function nyttSvar(arrangementId: string, data: Record<string, string>): Promise<string> {
  if (erDemo()) {
    const a = demo().arrangementer.find(x => x.id === arrangementId);
    if (!a?.aapen) throw new StengtFeil();
    const id = randomUUID();
    demo().svar.push({ id, arrangement_id: arrangementId, data, opprettet: new Date().toISOString() });
    return id;
  }
  try {
    return await rpc<string>('pam_nytt_svar', { p_arrangement: arrangementId, p_data: data });
  } catch (e) {
    if (e instanceof Error && e.message.includes('STENGT')) throw new StengtFeil();
    throw e;
  }
}

export async function slettSvar(id: string): Promise<void> {
  if (erDemo()) {
    demo().svar = demo().svar.filter(s => s.id !== id);
    return;
  }
  await rpc('pam_slett_svar', { p_id: id });
}

export async function hentBruker(sok: { id?: string; epost?: string }): Promise<PamBrukerMedHash | null> {
  if (erDemo()) {
    return demo().brukere.find(b => (sok.id && b.id === sok.id) || (sok.epost && b.epost === sok.epost.toLowerCase())) ?? null;
  }
  const rader = await rpc<PamBrukerMedHash[]>('pam_hent_bruker', { p_id: sok.id ?? null, p_epost: sok.epost ?? null });
  return rader[0] ?? null;
}

export async function hentBrukere(): Promise<PamBruker[]> {
  if (erDemo()) return demo().brukere.map(({ passord_hash, ...b }) => b);
  return rpc<PamBruker[]>('pam_hent_brukere');
}

export async function lagreBruker(b: Partial<PamBrukerMedHash>): Promise<string> {
  if (erDemo()) {
    const alle = demo().brukere;
    const finnes = alle.find(x => x.id === b.id);
    if (finnes) {
      Object.assign(finnes, Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)));
      return finnes.id;
    }
    const ny = { aktiv: true, arrangorer: [], opprettet: new Date().toISOString(), sist_inne: null, ...b, id: randomUUID() } as PamBrukerMedHash;
    alle.push(ny);
    return ny.id;
  }
  return rpc<string>('pam_lagre_bruker', { p_b: b });
}

export async function markerInne(id: string): Promise<void> {
  if (erDemo()) {
    const b = demo().brukere.find(x => x.id === id);
    if (b) b.sist_inne = new Date().toISOString();
    return;
  }
  await rpc('pam_bruker_inne', { p_id: id });
}

export async function skrivLogg(hvem: { id?: string | null; navn: string }, handling: string, detaljer?: string): Promise<void> {
  try {
    if (erDemo()) {
      const l = demo().logg;
      l.unshift({ id: l.length + 1, tid: new Date().toISOString(), bruker_id: hvem.id ?? null, hvem: hvem.navn, handling, detaljer: detaljer ?? null });
      return;
    }
    await rpc('pam_skriv_logg', { p_bruker: hvem.id ?? null, p_hvem: hvem.navn, p_handling: handling, p_detaljer: detaljer ?? null });
  } catch (e) {
    console.error('Kunne ikke skrive logg', e);
  }
}

export async function hentLogg(antall = 1000): Promise<PamLoggrad[]> {
  if (erDemo()) return demo().logg.slice(0, antall);
  return rpc<PamLoggrad[]>('pam_hent_logg', { p_antall: antall });
}
