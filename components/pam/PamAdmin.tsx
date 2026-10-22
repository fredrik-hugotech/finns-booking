'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowUp, ClipboardList, Download, History, KeyRound, Link2, Loader2, Lock, LogOut, Mail, Pencil, Plus, Trash2, UserCheck, UserX, Users, X,
} from 'lucide-react';
import { FELTTYPER, PARTNERE, lagSlug, navnPa, type Arrangement, type Felt, type Felttype, type Svar } from '@/lib/pam/felter';
import type { PamBruker, PamRolle } from '@/lib/pam/lager';
import { Logg, MittPassord, NyttPassord } from '../Backoffice';

type Fane = 'pameldinger' | 'brukere' | 'logg' | 'passord';
type Melding = { tekst: string; feil?: boolean } | null;

const ROLLER: Record<PamRolle, { navn: string; forklaring: string }> = {
  admin: { navn: 'Admin', forklaring: 'Ser og endrer alt' },
  arrangor: { navn: 'Arrangør', forklaring: 'Ser påmeldingene til sine arrangører' },
};

const tidspunkt = (iso: string) => new Date(iso).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const offentligLenke = (a: Arrangement) => `${location.origin}/p/${a.serie ?? a.slug}${a.serie ? `#${lagSlug(a.fane ?? a.slug)}` : ''}`;

async function json(metode: string, url: string, body?: unknown) {
  const r = await fetch(url, { method: metode, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

export function PamAdmin({ bruker, demo }: { bruker: PamBruker | null; demo: boolean }) {
  const [meg, setMeg] = useState(bruker);
  if (!meg) return <Login demo={demo} onInne={setMeg} />;
  return <Panel meg={meg} onUt={() => setMeg(null)} />;
}

function Login({ demo, onInne }: { demo: boolean; onInne: (b: PamBruker) => void }) {
  const [epost, setEpost] = useState('');
  const [passord, setPassord] = useState('');
  const [feil, setFeil] = useState('');
  const [sender, setSender] = useState(false);
  async function logg(e: React.FormEvent) {
    e.preventDefault();
    setSender(true);
    setFeil('');
    const r = await json('POST', '/api/pam/login', { epost, passord });
    const meg = r.ok ? (await json('GET', '/api/pam/meg')).data.bruker : null;
    setSender(false);
    if (meg) onInne(meg);
    else setFeil(r.data.feil ?? 'Kunne ikke logge inn.');
  }
  return (
    <div className="side admin">
      <div className="oppsett smal">
        <form className="kort skjema" onSubmit={logg}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Finns.Fairway" className="login-logo" />
          <h2><Lock size={18} /> Påmeldinger</h2>
          <label>E-post<input type="email" autoComplete="username" autoFocus required value={epost} onChange={e => setEpost(e.target.value)} /></label>
          <label>Passord<input type="password" autoComplete="current-password" required value={passord} onChange={e => setPassord(e.target.value)} /></label>
          {demo && <p className="dempet">Demo: admin@demo.no eller start@demo.no, passord «demo».</p>}
          {feil && <div className="banner feil">{feil}</div>}
          <button className="knapp full" disabled={sender}>{sender ? 'Logger inn …' : 'Logg inn'}</button>
          <p className="dempet">Glemt passordet? Be en admin om et nytt.</p>
        </form>
      </div>
    </div>
  );
}

function Panel({ meg, onUt }: { meg: PamBruker; onUt: () => void }) {
  const admin = meg.rolle === 'admin';
  const [fane, setFane] = useState<Fane>('pameldinger');
  const [arrangementer, setArrangementer] = useState<Arrangement[] | null>(null);
  const [valgt, setValgt] = useState<string | null>(null);
  const [redigerer, setRedigerer] = useState<Arrangement | 'ny' | null>(null);
  const [melding, setMelding] = useState<Melding>(null);

  async function last() {
    const r = await json('GET', '/api/pam/arrangementer');
    if (r.status === 401) return onUt();
    setArrangementer(r.data.arrangementer ?? []);
  }
  useEffect(() => { last(); }, []);

  async function loggUt() {
    await json('DELETE', '/api/pam/login');
    onUt();
  }

  const faner: { key: Fane; navn: string; ikon: typeof ClipboardList }[] = [
    { key: 'pameldinger', navn: 'Påmeldinger', ikon: ClipboardList },
    ...(admin ? [{ key: 'brukere' as Fane, navn: 'Brukere', ikon: Users }, { key: 'logg' as Fane, navn: 'Logg', ikon: History }] : []),
    { key: 'passord', navn: 'Passord', ikon: KeyRound },
  ];
  const a = arrangementer?.find(x => x.id === valgt) ?? null;

  function bytt(f: Fane) {
    setFane(f);
    setValgt(null);
    setRedigerer(null);
    setMelding(null);
  }

  return (
    <div className="adm admin">
      <aside className="adm-meny">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Finns.Fairway" className="adm-logo" />
        <nav>
          {faner.map(f => (
            <button key={f.key} className={fane === f.key ? 'aktiv' : ''} onClick={() => bytt(f.key)}>
              <f.ikon size={18} /> {f.navn}
            </button>
          ))}
        </nav>
        <button className="adm-ut" onClick={loggUt}><LogOut size={18} /> Logg ut</button>
      </aside>
      <main className="adm-innhold">
        {melding && <div className={`banner ${melding.feil ? 'feil' : ''}`}>{melding.tekst}</div>}
        {fane === 'pameldinger' && (
          redigerer ? (
            <Rediger
              a={redigerer === 'ny' ? null : redigerer}
              alle={arrangementer ?? []}
              onAvbryt={() => setRedigerer(null)}
              onLagret={async (id, tekst) => {
                await last();
                setRedigerer(null);
                setValgt(id);
                setMelding({ tekst });
              }}
            />
          ) : a ? (
            <Detalj
              a={a}
              admin={admin}
              onTilbake={() => { setValgt(null); setMelding(null); last(); }}
              onRediger={() => setRedigerer(a)}
              onEndret={last}
              setMelding={setMelding}
            />
          ) : (
            <Oversikt arrangementer={arrangementer} admin={admin} meg={meg} onVelg={id => { setValgt(id); setMelding(null); }} onNy={() => setRedigerer('ny')} />
          )
        )}
        {fane === 'brukere' && admin && <Brukere meg={meg} arrangorer={[...new Set((arrangementer ?? []).map(x => x.arrangor))]} />}
        {fane === 'logg' && admin && <><div className="adm-topp"><h1>Logg</h1></div><Logg api="/api/pam" /></>}
        {fane === 'passord' && <><div className="adm-topp"><h1>Passord</h1></div><MittPassord api="/api/pam" /></>}
      </main>
    </div>
  );
}

function Oversikt({ arrangementer, admin, meg, onVelg, onNy }: {
  arrangementer: Arrangement[] | null; admin: boolean; meg: PamBruker; onVelg: (id: string) => void; onNy: () => void;
}) {
  return (
    <>
      <div className="adm-topp">
        <h1>Påmeldinger</h1>
        {admin && <button className="liten-knapp primar" onClick={onNy}><Plus size={14} /> Ny påmelding</button>}
      </div>
      {!arrangementer ? <div className="laster"><Loader2 className="spinn" size={18} /> Laster …</div>
        : !arrangementer.length ? (
          <div className="kort tomt">{admin ? 'Ingen påmeldinger ennå. Lag den første med «Ny påmelding».' : `Ingen påmeldinger for ${meg.arrangorer.join(', ')} ennå.`}</div>
        ) : (
          <ul className="pam-liste">
            {arrangementer.map(a => (
              <li key={a.id}>
                <button className="kort pam-rad" onClick={() => onVelg(a.id)}>
                  <span className="pam-rad-navn">
                    <strong>{navnPa(a)}</strong>
                    <span className="dempet">{a.arrangor}</span>
                  </span>
                  <span className={`status ${a.aapen ? 'bekreftet' : 'avlyst'}`}>{a.aapen ? 'Åpen' : 'Stengt'}</span>
                  <span className="pam-antall"><strong>{a.antall ?? 0}</strong><span className="dempet">påmeldt</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

function Detalj({ a, admin, onTilbake, onRediger, onEndret, setMelding }: {
  a: Arrangement; admin: boolean; onTilbake: () => void; onRediger: () => void; onEndret: () => Promise<void>; setMelding: (m: Melding) => void;
}) {
  const [svar, setSvar] = useState<Svar[] | null>(null);
  const [sok, setSok] = useState('');

  async function last() {
    const r = await json('GET', `/api/pam/svar?arrangement=${a.id}`);
    setSvar(r.data.svar ?? []);
  }
  useEffect(() => { last(); }, [a.id]);

  const q = sok.trim().toLowerCase();
  const vist = useMemo(() => [...(svar ?? [])].reverse().filter(s => !q || Object.values(s.data).join(' ').toLowerCase().includes(q)), [svar, q]);
  const epostfelt = a.felter.filter(f => f.type === 'epost');
  const eposter = [...new Set((svar ?? []).flatMap(s => epostfelt.map(f => s.data[f.id]).filter(Boolean)))];

  function kopier(tekst: string, ok: string) {
    navigator.clipboard?.writeText(tekst);
    setMelding({ tekst: ok });
  }

  async function slett(s: Svar) {
    const hvem = s.data.navn || Object.values(s.data)[0] || 'påmeldingen';
    if (!window.confirm(`Slette ${hvem}? Det kan ikke angres.`)) return;
    const r = await json('DELETE', `/api/pam/svar?arrangement=${a.id}&id=${s.id}`);
    setMelding(r.ok ? { tekst: `${hvem} er slettet.` } : { tekst: r.data.feil ?? 'Noe gikk galt.', feil: true });
    await last();
  }

  async function settAapen(aapen: boolean) {
    const r = await json('POST', '/api/pam/arrangementer', { id: a.id, handling: 'aapen', aapen });
    setMelding(r.ok ? { tekst: aapen ? 'Påmeldingen er åpnet.' : 'Påmeldingen er stengt. Ingen nye kan melde seg på.' } : { tekst: r.data.feil ?? 'Noe gikk galt.', feil: true });
    await onEndret();
  }

  return (
    <>
      <button className="lenke pam-tilbake" onClick={onTilbake}><ArrowLeft size={16} /> Alle påmeldinger</button>
      <div className="adm-topp">
        <h1>{navnPa(a)}</h1>
        <span className={`status ${a.aapen ? 'bekreftet' : 'avlyst'}`}>{a.aapen ? 'Åpen' : 'Stengt'}</span>
      </div>
      <div className="tall">
        <div className="tallkort"><span>Påmeldt</span><strong>{svar?.length ?? '–'}</strong></div>
        <div className="tallkort"><span>Arrangør</span><strong className="pam-tall-tekst">{a.arrangor}</strong></div>
      </div>
      <div className="adm-handlinger pam-verktoy">
        <button className="liten-knapp" onClick={() => kopier(offentligLenke(a), 'Lenken er kopiert.')}><Link2 size={14} /> Kopier lenke</button>
        <a className="liten-knapp" href={`/api/pam/eksport?arrangement=${a.id}`}><Download size={14} /> Last ned til Excel</a>
        {eposter.length > 0 && (
          <button className="liten-knapp" onClick={() => kopier(eposter.join('; '), `${eposter.length} e-postadresser er kopiert. Lim dem inn i Bcc.`)}><Mail size={14} /> Kopier e-poster</button>
        )}
        {admin && <button className="liten-knapp" onClick={onRediger}><Pencil size={14} /> Rediger skjema</button>}
        {admin && (a.aapen
          ? <button className="liten-knapp fare" onClick={() => settAapen(false)}><Lock size={14} /> Steng påmeldingen</button>
          : <button className="liten-knapp" onClick={() => settAapen(true)}>Åpne påmeldingen</button>)}
      </div>
      {svar && svar.length > 0 && <input className="adm-sok" placeholder="Søk etter navn eller e-post" value={sok} onChange={e => setSok(e.target.value)} />}
      {!svar ? <div className="laster"><Loader2 className="spinn" size={18} /> Laster …</div>
        : !svar.length ? <div className="kort tomt">Ingen har meldt seg på ennå.</div>
        : (
          <div className="kort pam-tabell-kort">
            <table className="pam-tabell">
              <thead>
                <tr>
                  {a.felter.map(f => <th key={f.id}>{f.navn}</th>)}
                  <th>Påmeldt</th>
                  <th aria-label="Slett" />
                </tr>
              </thead>
              <tbody>
                {vist.map(s => (
                  <tr key={s.id}>
                    {a.felter.map(f => (
                      <td key={f.id} data-felt={f.navn}>
                        {f.type === 'epost' && s.data[f.id] ? <a href={`mailto:${s.data[f.id]}`}>{s.data[f.id]}</a>
                          : f.type === 'telefon' && s.data[f.id] ? <a href={`tel:${s.data[f.id].replace(/\s/g, '')}`}>{s.data[f.id]}</a>
                          : s.data[f.id] ?? ''}
                      </td>
                    ))}
                    <td data-felt="Påmeldt" className="dempet">{tidspunkt(s.opprettet)}</td>
                    <td><button className="ikonknapp liten" title="Slett" onClick={() => slett(s)}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!vist.length && <p className="dempet">Ingen treff på «{sok}».</p>}
          </div>
        )}
    </>
  );
}

type Utkast = {
  tittel: string; fane: string; arrangor: string; serie: string; slug: string; info: string; partner: string;
  felter: (Felt & { valgTekst?: string })[];
};

function Rediger({ a, alle, onAvbryt, onLagret }: {
  a: Arrangement | null; alle: Arrangement[]; onAvbryt: () => void; onLagret: (id: string, tekst: string) => void;
}) {
  const [u, setU] = useState<Utkast>(() => a ? {
    tittel: a.tittel, fane: a.fane ?? '', arrangor: a.arrangor, serie: a.serie ?? '', slug: a.slug, info: a.info ?? '', partner: a.partner ?? '',
    felter: a.felter.map(f => ({ ...f, valgTekst: (f.valg ?? []).join('\n') })),
  } : {
    tittel: '', fane: '', arrangor: '', serie: '', slug: '', info: '', partner: '',
    felter: [
      { id: 'navn', type: 'tekst', navn: 'Navn', pakrevd: true },
      { id: 'epost', type: 'epost', navn: 'E-post', pakrevd: true },
    ],
  });
  const [feil, setFeil] = useState('');
  const [sender, setSender] = useState(false);
  const harSvar = (a?.antall ?? 0) > 0;
  const arrangorer = [...new Set(alle.map(x => x.arrangor))];
  const serier = [...new Set(alle.map(x => x.serie).filter(Boolean))] as string[];
  const forslag = lagSlug(u.fane ? `${u.tittel} ${u.fane}` : u.tittel);

  const settFelt = (i: number, endring: Partial<Utkast['felter'][number]>) =>
    setU(x => ({ ...x, felter: x.felter.map((f, j) => (j === i ? { ...f, ...endring } : f)) }));
  const flytt = (i: number, d: number) => setU(x => {
    const f = [...x.felter];
    [f[i], f[i + d]] = [f[i + d], f[i]];
    return { ...x, felter: f };
  });

  async function lagre(e: React.FormEvent) {
    e.preventDefault();
    setFeil('');
    setSender(true);
    const felter = u.felter.map(({ valgTekst, ...f }) => ({
      ...f,
      ...(f.type === 'valg' ? { valg: (valgTekst ?? '').split('\n').map(v => v.trim()).filter(Boolean) } : {}),
      ...(f.type === 'arskull' ? { fra: f.fra ?? new Date().getFullYear() - 18, til: f.til ?? new Date().getFullYear() - 5 } : {}),
    }));
    const r = await json('POST', '/api/pam/arrangementer', { ...u, id: a?.id, slug: u.slug || forslag, felter });
    setSender(false);
    if (r.ok) onLagret(r.data.id, a ? 'Endringene er lagret.' : 'Påmeldingen er laget. Kopier lenken og send den ut.');
    else setFeil(r.data.feil ?? 'Noe gikk galt.');
  }

  return (
    <>
      <button className="lenke pam-tilbake" onClick={onAvbryt}><ArrowLeft size={16} /> Avbryt</button>
      <div className="adm-topp"><h1>{a ? 'Rediger påmelding' : 'Ny påmelding'}</h1></div>
      <form className="kort skjema pam-rediger" onSubmit={lagre}>
        <div className="to">
          <label>Tittel<input required value={u.tittel} placeholder="F.eks. Start-turneen" onChange={e => setU({ ...u, tittel: e.target.value })} /></label>
          <label>Del (valgfritt)<input value={u.fane} placeholder="F.eks. Trening" onChange={e => setU({ ...u, fane: e.target.value })} /></label>
        </div>
        <div className="to">
          <label>Arrangør
            <input required list="pam-arrangorer" value={u.arrangor} placeholder="F.eks. IK Start" onChange={e => setU({ ...u, arrangor: e.target.value })} />
            <datalist id="pam-arrangorer">{arrangorer.map(x => <option key={x} value={x} />)}</datalist>
          </label>
          <label>Logo ved siden av Finns
            <select value={u.partner} onChange={e => setU({ ...u, partner: e.target.value })}>
              <option value="">Ingen</option>
              {Object.entries(PARTNERE).map(([k, p]) => <option key={k} value={k}>{p.navn}</option>)}
            </select>
          </label>
        </div>
        <div className="to">
          <label>Lenke<input value={u.slug} placeholder={forslag || 'lages fra tittelen'} onChange={e => setU({ ...u, slug: lagSlug(e.target.value) })} /></label>
          <label>Samme side som (valgfritt)
            <input list="pam-serier" value={u.serie} placeholder="F.eks. start-turneen" onChange={e => setU({ ...u, serie: lagSlug(e.target.value) })} />
            <datalist id="pam-serier">{serier.map(x => <option key={x} value={x} />)}</datalist>
          </label>
        </div>
        <p className="dempet pam-hint">
          Lenken blir <code>/p/{u.serie || u.slug || forslag || '…'}</code>.
          {' '}Påmeldinger med samme «Samme side som» vises som faner på én side.
        </p>
        <label>Tekst over skjemaet (valgfritt)<textarea rows={2} value={u.info} placeholder="F.eks. tid og sted" onChange={e => setU({ ...u, info: e.target.value })} /></label>

        <h3>Felter</h3>
        {harSvar && <p className="dempet pam-hint">Noen har alt meldt seg på. Endrer du et felt, beholder de gamle svarene det de skrev.</p>}
        <ol className="pam-felter">
          {u.felter.map((f, i) => (
            <li key={i} className="adm-skjema">
              <div className="pam-felt-rad">
                <label>Spørsmål<input required value={f.navn} onChange={e => settFelt(i, { navn: e.target.value })} /></label>
                <label>Type<select value={f.type} onChange={e => settFelt(i, { type: e.target.value as Felttype })}>
                  {(Object.keys(FELTTYPER) as Felttype[]).map(t => <option key={t} value={t}>{FELTTYPER[t]}</option>)}
                </select></label>
                <span className="pam-felt-knapper">
                  <button type="button" className="ikonknapp liten" title="Flytt opp" disabled={i === 0} onClick={() => flytt(i, -1)}><ArrowUp size={16} /></button>
                  <button type="button" className="ikonknapp liten" title="Flytt ned" disabled={i === u.felter.length - 1} onClick={() => flytt(i, 1)}><ArrowDown size={16} /></button>
                  <button type="button" className="ikonknapp liten" title="Fjern feltet" disabled={u.felter.length === 1} onClick={() => setU(x => ({ ...x, felter: x.felter.filter((_, j) => j !== i) }))}><X size={16} /></button>
                </span>
              </div>
              {f.type === 'arskull' && (
                <div className="adm-felter">
                  <label>Eldste årskull<input type="number" value={f.fra ?? ''} placeholder={String(new Date().getFullYear() - 18)} onChange={e => settFelt(i, { fra: Number(e.target.value) || undefined })} /></label>
                  <label>Yngste årskull<input type="number" value={f.til ?? ''} placeholder={String(new Date().getFullYear() - 5)} onChange={e => settFelt(i, { til: Number(e.target.value) || undefined })} /></label>
                </div>
              )}
              {f.type === 'valg' && (
                <label>Valg, ett per linje<textarea rows={3} value={f.valgTekst ?? ''} onChange={e => settFelt(i, { valgTekst: e.target.value })} /></label>
              )}
              <label className="avkryss"><input type="checkbox" checked={f.pakrevd} onChange={e => settFelt(i, { pakrevd: e.target.checked })} /> Må fylles ut</label>
            </li>
          ))}
        </ol>
        <button type="button" className="liten-knapp pam-nytt-felt" onClick={() => setU(x => ({ ...x, felter: [...x.felter, { id: '', type: 'tekst', navn: '', pakrevd: true }] }))}>
          <Plus size={14} /> Legg til felt
        </button>
        {feil && <div className="banner feil">{feil}</div>}
        <button className="knapp" disabled={sender}>{sender ? 'Lagrer …' : a ? 'Lagre endringer' : 'Lag påmelding'}</button>
      </form>
    </>
  );
}

function Brukere({ meg, arrangorer }: { meg: PamBruker; arrangorer: string[] }) {
  const [brukere, setBrukere] = useState<PamBruker[] | null>(null);
  const [ny, setNy] = useState<{ navn: string; epost: string; rolle: PamRolle; arrangorer: string[] } | null>(null);
  const [visPassord, setVisPassord] = useState<{ hvem: string; passord: string } | null>(null);
  const [melding, setMelding] = useState<Melding>(null);

  async function last() {
    const r = await json('GET', '/api/pam/brukere');
    if (r.ok) setBrukere(r.data.brukere);
  }
  useEffect(() => { last(); }, []);

  async function send(body: unknown, ok: string, hvem: string) {
    setVisPassord(null);
    const r = await json('POST', '/api/pam/brukere', body);
    setMelding(r.ok ? { tekst: ok } : { tekst: r.data.feil ?? 'Noe gikk galt.', feil: true });
    if (r.data.passord) setVisPassord({ hvem, passord: r.data.passord });
    await last();
    return r.ok;
  }

  return (
    <>
      <div className="adm-topp">
        <h1>Brukere</h1>
        <button className="liten-knapp primar" onClick={() => setNy(ny ? null : { navn: '', epost: '', rolle: 'arrangor', arrangorer: arrangorer.length === 1 ? arrangorer : [] })}><Plus size={14} /> Ny bruker</button>
      </div>
      <section className="kort">
        <p className="dempet">Admin ser og endrer alt. En arrangør ser bare påmeldingene til arrangørene som er krysset av, og kan laste dem ned. Denne innloggingen gir ikke tilgang til banebookingen.</p>
        {melding && <div className={`banner ${melding.feil ? 'feil' : ''}`}>{melding.tekst}</div>}
        {visPassord && <NyttPassord {...visPassord} onLukk={() => setVisPassord(null)} />}
        {ny && (
          <form className="adm-skjema" onSubmit={async e => {
            e.preventDefault();
            if (await send(ny, 'Brukeren er lagt til.', ny.navn)) setNy(null);
          }}>
            <div className="adm-felter">
              <label>Navn<input required autoFocus value={ny.navn} onChange={e => setNy({ ...ny, navn: e.target.value })} /></label>
              <label>E-post<input type="email" required value={ny.epost} onChange={e => setNy({ ...ny, epost: e.target.value })} /></label>
              <label>Tilgang<select value={ny.rolle} onChange={e => setNy({ ...ny, rolle: e.target.value as PamRolle })}>
                {(Object.keys(ROLLER) as PamRolle[]).map(r => <option key={r} value={r}>{ROLLER[r].navn} – {ROLLER[r].forklaring.toLowerCase()}</option>)}
              </select></label>
            </div>
            {ny.rolle === 'arrangor' && <Arrangorvalg alle={arrangorer} valgt={ny.arrangorer} onEndre={v => setNy({ ...ny, arrangorer: v })} />}
            <div className="adm-handlinger">
              <button className="liten-knapp primar">Legg til og lag passord</button>
              <button type="button" className="liten-knapp" onClick={() => setNy(null)}>Avbryt</button>
            </div>
          </form>
        )}
        {!brukere ? <div className="laster"><Loader2 className="spinn" size={18} /></div> : !brukere.length ? null : (
          <ul className="brukerliste">
            {brukere.map(b => (
              <li key={b.id} className={b.aktiv ? '' : 'inaktiv'}>
                <span className="adm-navn">
                  <strong>{b.navn}{b.id === meg.id ? ' (deg)' : ''}</strong>
                  <span className="dempet">
                    {b.epost}
                    {b.rolle === 'arrangor' && ` · ser ${b.arrangorer.join(', ') || 'ingenting'}`}
                    {b.sist_inne ? ` · sist inne ${new Date(b.sist_inne).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}` : ' · aldri logget inn'}
                  </span>
                </span>
                <select aria-label={`Tilgang for ${b.navn}`} value={b.rolle} disabled={b.id === meg.id || !b.aktiv}
                  onChange={e => send({ id: b.id, rolle: e.target.value }, 'Tilgangen er endret.', b.navn)}>
                  {(Object.keys(ROLLER) as PamRolle[]).map(r => <option key={r} value={r}>{ROLLER[r].navn}</option>)}
                </select>
                <span className="adm-handlinger">
                  {b.aktiv && b.rolle === 'arrangor' && (
                    <button className="liten-knapp" onClick={() => {
                      const svar = window.prompt(`Hvilke arrangører skal ${b.navn} se? Skill med komma.`, b.arrangorer.join(', '));
                      if (svar !== null) send({ id: b.id, arrangorer: svar.split(',').map(x => x.trim()).filter(Boolean) }, 'Tilgangen er endret.', b.navn);
                    }}><Pencil size={14} /> Arrangører</button>
                  )}
                  {b.aktiv && (
                    <button className="liten-knapp" onClick={() => {
                      if (window.confirm(`Lage nytt passord til ${b.navn}? Det gamle slutter å virke.`)) send({ id: b.id, nyttPassord: true }, 'Nytt passord laget.', b.navn);
                    }}><KeyRound size={14} /> Nytt passord</button>
                  )}
                  {b.id !== meg.id && (b.aktiv ? (
                    <button className="liten-knapp fare" onClick={() => {
                      if (window.confirm(`Stenge tilgangen for ${b.navn}?`)) send({ id: b.id, aktiv: false }, 'Tilgangen er stengt.', b.navn);
                    }}><UserX size={14} /> Steng</button>
                  ) : (
                    <button className="liten-knapp" onClick={() => send({ id: b.id, aktiv: true }, 'Tilgangen er åpnet igjen.', b.navn)}><UserCheck size={14} /> Åpne igjen</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Arrangorvalg({ alle, valgt, onEndre }: { alle: string[]; valgt: string[]; onEndre: (v: string[]) => void }) {
  const [annen, setAnnen] = useState('');
  const liste = [...new Set([...alle, ...valgt])];
  const bytt = (x: string) => onEndre(valgt.includes(x) ? valgt.filter(v => v !== x) : [...valgt, x]);
  return (
    <div className="pam-arrangorvalg">
      <span className="dempet">Ser påmeldingene til:</span>
      <div className="segment">
        {liste.map(x => <button type="button" key={x} className={valgt.includes(x) ? 'pa' : ''} onClick={() => bytt(x)}>{x}</button>)}
      </div>
      <span className="pam-annen">
        <input placeholder="Annen arrangør" value={annen} onChange={e => setAnnen(e.target.value)} />
        <button type="button" className="liten-knapp" disabled={!annen.trim()} onClick={() => { onEndre([...valgt, annen.trim()]); setAnnen(''); }}><Plus size={14} /> Legg til</button>
      </span>
    </div>
  );
}
