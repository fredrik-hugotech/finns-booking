'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Check, X, LogOut, Trash2, Loader2, Lock, Inbox, CalendarDays, Ban, List, Users, Phone, Mail, MessageSquare, Pencil,
} from 'lucide-react';
import { SESONG } from '@/lib/config';
import {
  TIMER, byggBelegg, fastTidFor, prisFor, slot, type Bane, type Bestilling, type Sperring, type Status,
} from '@/lib/tilgjengelighet';
import { dagOgManed, datoer, kr, langDato, leggTilDager, mandagI, naIOslo, tidsrom, ukedag } from '@/lib/dato';

type Fane = 'kalender' | 'foresporsler' | 'bookinger' | 'kunder' | 'sperringer';
const FANER: { key: Fane; navn: string; ikon: typeof Inbox }[] = [
  { key: 'kalender', navn: 'Kalender', ikon: CalendarDays },
  { key: 'foresporsler', navn: 'Forespørsler', ikon: Inbox },
  { key: 'bookinger', navn: 'Bookinger', ikon: List },
  { key: 'kunder', navn: 'Kunder', ikon: Users },
  { key: 'sperringer', navn: 'Sperringer', ikon: Ban },
];
const DAGER = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const MANEDER = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const STATUSTEKST: Record<Status, string> = { forespurt: 'Venter', bekreftet: 'Bekreftet', avlyst: 'Fjernet' };
const to = (t: number) => String(t).padStart(2, '0');
const kl = (fra: number, til = fra + 1) => `${to(fra)}–${to(til)}`;

type Api = (metode: string, url: string, body?: unknown, ok?: string) => Promise<boolean>;

export function AdminClient({ innlogget, demo }: { innlogget: boolean; demo: boolean }) {
  const [inne, setInne] = useState(innlogget);
  if (!inne) return <Login demo={demo} onInne={() => setInne(true)} />;
  return <Panel onUt={() => setInne(false)} />;
}

function Login({ demo, onInne }: { demo: boolean; onInne: () => void }) {
  const [pw, setPw] = useState('');
  const [feil, setFeil] = useState('');
  async function logg(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passord: pw }) });
    if (r.ok) onInne();
    else setFeil('Feil passord.');
  }
  return (
    <div className="side admin">
      <div className="oppsett smal">
        <form className="kort skjema" onSubmit={logg}>
          <h2><Lock size={18} /> Admin</h2>
          <label>Passord<input type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)} /></label>
          {demo && <p className="dempet">Demo: passordet er «demo».</p>}
          {feil && <div className="banner feil">{feil}</div>}
          <button className="knapp full">Logg inn</button>
        </form>
      </div>
    </div>
  );
}

function Panel({ onUt }: { onUt: () => void }) {
  const [bestillinger, setBestillinger] = useState<Bestilling[] | null>(null);
  const [sperringer, setSperringer] = useState<Sperring[]>([]);
  const [fane, setFane] = useState<Fane>('kalender');
  const [melding, setMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  const [dag, setDag] = useState(() => {
    const n = naIOslo().dato;
    return n < SESONG.fra ? SESONG.fra : n > SESONG.til ? SESONG.til : n;
  });

  async function last() {
    const [a, b] = await Promise.all([fetch('/api/admin/bestillinger'), fetch('/api/admin/sperringer')]);
    if (a.status === 401) return onUt();
    setBestillinger((await a.json()).bestillinger);
    setSperringer((await b.json()).sperringer);
  }
  useEffect(() => { last(); }, []);

  const api: Api = async (metode, url, body, ok) => {
    setMelding(null);
    const r = await fetch(url, { method: metode, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) {
      setMelding({ tekst: (await r.json().catch(() => ({}))).feil ?? 'Noe gikk galt.', feil: true });
      await last();
      return false;
    }
    if (ok) setMelding({ tekst: ok });
    await last();
    return true;
  };

  async function loggUt() {
    await fetch('/api/admin/login', { method: 'DELETE' });
    onUt();
  }

  const aktive = useMemo(() => (bestillinger ?? []).filter(b => b.status !== 'avlyst'), [bestillinger]);
  const ventende = useMemo(() => grupperRef(aktive.filter(b => b.status === 'forespurt')), [aktive]);

  function visDag(d: string) {
    setDag(d);
    setFane('kalender');
    window.scrollTo(0, 0);
  }

  const aktiv = FANER.find(f => f.key === fane)!;

  return (
    <div className="admin adm">
      <aside className="adm-meny">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Finns.Fairway" className="adm-logo" />
        <nav>
          {FANER.map(f => (
            <button key={f.key} className={fane === f.key ? 'aktiv' : ''} onClick={() => setFane(f.key)}>
              <f.ikon size={18} />
              <span>{f.navn}</span>
              {f.key === 'foresporsler' && ventende.length > 0 && <b className="teller">{ventende.length}</b>}
            </button>
          ))}
        </nav>
        <button className="adm-ut" onClick={loggUt}><LogOut size={18} /><span>Logg ut</span></button>
      </aside>

      <main className="adm-innhold">
        <div className="adm-topp">
          <h1>{aktiv.navn}</h1>
          <span className="dempet">{SESONG.navn}</span>
        </div>
        {melding && <div className={`banner ${melding.feil ? 'feil' : ''}`}>{melding.tekst}</div>}

        {!bestillinger ? (
          <div className="laster"><Loader2 className="spinn" size={20} /> Laster …</div>
        ) : (
          <>
            {fane === 'kalender' && <Kalender dag={dag} setDag={setDag} bestillinger={aktive} alle={bestillinger} sperringer={sperringer} api={api} />}
            {fane === 'foresporsler' && (
              ventende.length === 0
                ? <div className="kort tomt">Ingen forespørsler venter.</div>
                : ventende.map(g => <Bestillingskort key={g[0].ref} linjer={g} alle={bestillinger} api={api} onDag={visDag} />)
            )}
            {fane === 'bookinger' && <Bookinger bestillinger={aktive} alle={bestillinger} sperringer={sperringer} api={api} onDag={visDag} />}
            {fane === 'kunder' && <Kunder bestillinger={aktive} alle={bestillinger} api={api} onDag={visDag} />}
            {fane === 'sperringer' && <Sperringer sperringer={sperringer} api={api} />}
          </>
        )}
      </main>
    </div>
  );
}

function grupperRef(linjer: Bestilling[]): Bestilling[][] {
  const m = new Map<string, Bestilling[]>();
  for (const b of linjer) m.set(b.ref, [...(m.get(b.ref) ?? []), b]);
  return [...m.values()].sort((a, b) => b[0].opprettet.localeCompare(a[0].opprettet));
}

// Kontaktknapper med ferdig utfylt e-post og SMS om bestillingen.
function Kontakt({ b, alle }: { b: Bestilling; alle: Bestilling[] }) {
  const linjer = alle.filter(x => x.ref === b.ref && x.status !== 'avlyst');
  const liste = linjer.map(l => `${langDato(l.dato)} ${tidsrom(l.time)}, ${l.bane === 'hel' ? 'hel' : 'halv'} bane`).join('\n');
  const sum = linjer.reduce((s, l) => s + l.pris, 0);
  const emne = `Booking ${b.ref} – Sparebanken Norge Arena`;
  const tekst = `Hei ${b.navn.split(' ')[0]},\n\nTakk for bookingen hos Finns.Fairway på Sparebanken Norge Arena:\n\n${liste}\n\nTotalt ${kr(sum)}. Betal med Vipps og merk betalingen med ${b.ref}.\n\nHilsen Finns.Fairway`;
  const tlf = b.telefon.replace(/\s/g, '');
  return (
    <span className="kontaktknapper">
      {tlf && <a href={`tel:${tlf}`} title={`Ring ${b.telefon}`}><Phone size={15} /></a>}
      {tlf && <a href={`sms:${tlf}?&body=${encodeURIComponent(`Hei! Bookingen din ${b.ref} på Sparebanken Norge Arena er registrert. Hilsen Finns.Fairway`)}`} title="Send SMS"><MessageSquare size={15} /></a>}
      {b.epost && <a href={`mailto:${b.epost}?subject=${encodeURIComponent(emne)}&body=${encodeURIComponent(tekst)}`} title={`E-post til ${b.epost}`}><Mail size={15} /></a>}
    </span>
  );
}

// Én booket time med handlinger, som i mer.golf-admin.
function Bookingrad({ b, alle, api, visDato }: { b: Bestilling; alle: Bestilling[]; api: Api; visDato?: boolean }) {
  const [rediger, setRediger] = useState(false);
  return (
    <div className={`adm-rad ${b.status}`}>
      <div className="adm-rad-hode">
        <span className="adm-tid">{visDato ? `${dagOgManed(b.dato, true)} ` : ''}{tidsrom(b.time)}</span>
        <span className="merkelapp">{b.bane === 'hel' ? 'Hel' : 'Halv'}</span>
        <span className="adm-navn">
          <strong>{b.navn}</strong>{b.klubb && <span className="dempet">{b.klubb}</span>}
          {b.kommentar && <span className="adm-kommentar">{b.kommentar}</span>}
        </span>
        <span className={`status ${b.status}`}>{STATUSTEKST[b.status]}</span>
        <Kontakt b={b} alle={alle} />
      </div>
      <div className="adm-handlinger">
        {b.status === 'forespurt' && (
          <button className="liten-knapp primar" onClick={() => api('PATCH', '/api/admin/bestillinger', { ider: [b.id], status: 'bekreftet' }, 'Bekreftet.')}>
            <Check size={14} /> Bekreft
          </button>
        )}
        <button className="liten-knapp" onClick={() => setRediger(v => !v)}><Pencil size={14} /> {rediger ? 'Lukk' : 'Rediger'}</button>
        <button className="liten-knapp fare" onClick={() => {
          if (window.confirm(`Fjerne ${tidsrom(b.time)} ${langDato(b.dato)} for ${b.navn}?`)) {
            api('PATCH', '/api/admin/bestillinger', { ider: [b.id], status: 'avlyst' }, 'Fjernet.');
          }
        }}><Trash2 size={14} /> Fjern</button>
      </div>
      {rediger && <Redigering b={b} alle={alle} api={api} onFerdig={() => setRediger(false)} />}
    </div>
  );
}

function Redigering({ b, alle, api, onFerdig }: { b: Bestilling; alle: Bestilling[]; api: Api; onFerdig: () => void }) {
  const andre = alle.filter(x => x.ref === b.ref && x.status !== 'avlyst');
  const [f, setF] = useState({
    dato: b.dato, time: b.time, bane: b.bane as Bane,
    navn: b.navn, telefon: b.telefon, epost: b.epost, klubb: b.klubb ?? '', kommentar: b.kommentar ?? '',
  });
  const [heleBestillingen, setHele] = useState(true);
  const [lagrer, setLagrer] = useState(false);

  async function lagre(e: React.FormEvent) {
    e.preventDefault();
    setLagrer(true);
    let ok = true;
    if (f.dato !== b.dato || f.time !== b.time || f.bane !== b.bane) {
      ok = await api('PATCH', '/api/admin/bestillinger', { ider: [b.id], endringer: { dato: f.dato, time: f.time, bane: f.bane } });
    }
    const kontakt = { navn: f.navn, telefon: f.telefon, epost: f.epost, klubb: f.klubb, kommentar: f.kommentar };
    const endret = (Object.keys(kontakt) as (keyof typeof kontakt)[]).some(k => (b[k] ?? '') !== kontakt[k]);
    if (ok && endret) {
      ok = await api('PATCH', '/api/admin/bestillinger', { ider: heleBestillingen ? andre.map(x => x.id) : [b.id], endringer: kontakt });
    }
    setLagrer(false);
    if (ok) onFerdig();
  }

  const felt = (k: 'navn' | 'telefon' | 'epost' | 'klubb' | 'kommentar') => ({
    value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
  });

  return (
    <form className="adm-skjema" onSubmit={lagre}>
      <div className="adm-felter">
        <label>Dato<input type="date" min={SESONG.fra} max={SESONG.til} value={f.dato} onChange={e => setF({ ...f, dato: e.target.value })} /></label>
        <label>Tid<select value={f.time} onChange={e => setF({ ...f, time: Number(e.target.value) })}>{TIMER.map(t => <option key={t} value={t}>{kl(t)}</option>)}</select></label>
        <label>Bane<select value={f.bane} onChange={e => setF({ ...f, bane: e.target.value as Bane })}><option value="hel">Hel</option><option value="halv">Halv</option></select></label>
        <label>Pris<input disabled value={kr(prisFor(f.bane, f.dato))} /></label>
      </div>
      <div className="adm-felter">
        <label>Navn<input {...felt('navn')} /></label>
        <label>Telefon<input {...felt('telefon')} /></label>
        <label>E-post<input {...felt('epost')} /></label>
        <label>Klubb<input {...felt('klubb')} /></label>
      </div>
      <label className="adm-bred">Kommentar<input {...felt('kommentar')} /></label>
      {andre.length > 1 && (
        <label className="avkryss"><input type="checkbox" checked={heleBestillingen} onChange={e => setHele(e.target.checked)} /> Kontaktinfo gjelder hele bestillingen ({andre.length} timer)</label>
      )}
      <div className="adm-handlinger">
        <button className="liten-knapp primar" disabled={lagrer}>{lagrer ? 'Lagrer …' : 'Lagre'}</button>
        <button type="button" className="liten-knapp" onClick={onFerdig}>Avbryt</button>
      </div>
    </form>
  );
}

function NyBooking({ dato, time, kanHel, api, onFerdig }: { dato: string; time: number; kanHel: boolean; api: Api; onFerdig: () => void }) {
  const [f, setF] = useState({ navn: '', telefon: '', epost: '', klubb: '', bane: (kanHel ? 'hel' : 'halv') as Bane });
  async function lagre(e: React.FormEvent) {
    e.preventDefault();
    if (await api('POST', '/api/admin/bestillinger', { ...f, dato, time }, 'Booking lagt inn.')) onFerdig();
  }
  const felt = (k: 'navn' | 'telefon' | 'epost' | 'klubb') => ({
    value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
  });
  return (
    <form className="adm-skjema" onSubmit={lagre}>
      <div className="adm-felter">
        <label>Navn<input required autoFocus {...felt('navn')} /></label>
        <label>Telefon<input {...felt('telefon')} /></label>
        <label>E-post<input type="email" {...felt('epost')} /></label>
        <label>Klubb<input {...felt('klubb')} /></label>
      </div>
      <div className="adm-handlinger">
        <span className="segment">
          {(['hel', 'halv'] as Bane[]).map(b => (
            <button type="button" key={b} disabled={b === 'hel' && !kanHel} className={f.bane === b ? 'pa' : ''} onClick={() => setF({ ...f, bane: b })}>
              {b === 'hel' ? 'Hel' : 'Halv'} {kr(prisFor(b, dato))}
            </button>
          ))}
        </span>
        <button className="liten-knapp primar">Legg inn</button>
        <button type="button" className="liten-knapp" onClick={onFerdig}>Avbryt</button>
      </div>
    </form>
  );
}

function Kalender({ dag, setDag, bestillinger, alle, sperringer, api }: {
  dag: string; setDag: (d: string) => void; bestillinger: Bestilling[]; alle: Bestilling[]; sperringer: Sperring[]; api: Api;
}) {
  const [mnd, setMnd] = useState(dag.slice(0, 7));
  const [apen, setApen] = useState<number | null>(null);
  const belegg = useMemo(() => byggBelegg(bestillinger, sperringer), [bestillinger, sperringer]);
  const na = naIOslo();

  const forste = `${mnd}-01`;
  const sisteDag = datoer(forste, leggTilDager(forste, 40)).filter(d => d.startsWith(mnd));
  const celler = datoer(mandagI(forste), leggTilDager(mandagI(sisteDag[sisteDag.length - 1]), 6));
  const flyttMnd = (delta: number) => {
    const [a, m] = mnd.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    setMnd(d.toISOString().slice(0, 7));
  };

  // Tidslinje: klubbtider og sperringer slås sammen, bookinger vises med handlinger.
  type Rad = { type: 'blokk'; fra: number; til: number; tekst: string; sperret?: boolean } | { type: 'time'; time: number };
  const rader: Rad[] = [];
  for (const t of TIMER) {
    const sp = sperringer.find(s => s.dato === dag && s.fra_time <= t && s.til_time > t);
    const fast = fastTidFor(dag, t);
    const tekst = sp ? `Sperret · ${sp.arsak}` : fast ? (fast.lag ? `${fast.klubb} · ${fast.lag}` : fast.klubb) : null;
    const forrige = rader[rader.length - 1];
    if (tekst) {
      if (forrige?.type === 'blokk' && forrige.til === t && forrige.tekst === tekst) forrige.til = t + 1;
      else rader.push({ type: 'blokk', fra: t, til: t + 1, tekst, sperret: !!sp });
    } else rader.push({ type: 'time', time: t });
  }

  return (
    <div className="adm-kalender">
      <div className="kort">
        <div className="mnd-hode">
          <button className="kal-nav" aria-label="Forrige måned" disabled={mnd <= SESONG.fra.slice(0, 7)} onClick={() => flyttMnd(-1)}>‹</button>
          <strong>{MANEDER[Number(mnd.slice(5)) - 1]} {mnd.slice(0, 4)}</strong>
          <button className="kal-nav" aria-label="Neste måned" disabled={mnd >= SESONG.til.slice(0, 7)} onClick={() => flyttMnd(1)}>›</button>
          <button className="liten-knapp" onClick={() => { const d = na.dato < SESONG.fra ? SESONG.fra : na.dato; setDag(d); setMnd(d.slice(0, 7)); }}>I dag</button>
        </div>
        <div className="mnd-grid">
          {DAGER.map(d => <span key={d} className="mnd-ukedag">{d}</span>)}
          {celler.map(d => {
            const annenMnd = !d.startsWith(mnd);
            const ute = annenMnd || d < SESONG.fra || d > SESONG.til;
            const her = bestillinger.filter(b => b.dato === d);
            return (
              <button key={d} disabled={ute} className={`mnd-dag ${d === dag ? 'valgt' : ''} ${d === na.dato ? 'idag' : ''} ${ukedag(d) >= 6 ? 'helg' : ''} ${annenMnd ? 'annen' : ''}`}
                onClick={() => { setDag(d); setApen(null); }}>
                {annenMnd ? '' : Number(d.slice(8))}
                {!ute && her.length > 0 && <span className={`mnd-prikk ${her.some(b => b.status === 'forespurt') ? 'venter' : ''}`} />}
              </button>
            );
          })}
        </div>
      </div>

      <h2 className="valgt-dag">{langDato(dag)}</h2>
      <div className="tidslinje">
        {rader.map(r => {
          if (r.type === 'blokk') {
            return <div key={`b${r.fra}`} className={`tl-opptatt ${r.sperret ? 'sperret' : ''}`}><span className="tl-tid">{kl(r.fra, r.til)}</span><span>{r.tekst}</span></div>;
          }
          const t = r.time;
          const her = bestillinger.filter(b => b.dato === dag && b.time === t);
          const s = slot(dag, t, belegg, na);
          return (
            <div key={t} className="adm-time">
              {her.map(b => <Bookingrad key={b.id} b={b} alle={alle} api={api} />)}
              {s.ledigeHalvdeler > 0 && (
                apen === t
                  ? <div className="adm-rad"><div className="adm-rad-hode"><span className="adm-tid">{kl(t)}</span><strong>Ny booking</strong></div><NyBooking dato={dag} time={t} kanHel={s.ledigeHalvdeler === 2} api={api} onFerdig={() => setApen(null)} /></div>
                  : <button className="adm-ledig" onClick={() => setApen(t)}><span className="adm-tid">{kl(t)}</span><span>{s.ledigeHalvdeler === 2 ? 'Ledig' : 'Halv bane ledig'}</span><span className="tl-pluss">+</span></button>
              )}
              {s.ledigeHalvdeler === 0 && her.length === 0 && (
                <div className="tl-opptatt"><span className="tl-tid">{kl(t)}</span><span>{s.tilstand === 'passert' ? 'Passert' : s.tekst ?? ''}</span></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bestillingskort({ linjer, alle, api, onDag }: { linjer: Bestilling[]; alle: Bestilling[]; api: Api; onDag: (d: string) => void }) {
  const f = linjer[0];
  const ventende = linjer.filter(l => l.status === 'forespurt');
  const sum = linjer.reduce((s, l) => s + l.pris, 0);
  return (
    <section className="kort gruppe">
      <div className="gruppe-topp">
        <div>
          <strong>{f.navn}</strong>{f.klubb && <span className="dempet"> · {f.klubb}</span>}
          <div className="kontakt">{f.telefon} · {f.epost} <Kontakt b={f} alle={alle} /></div>
        </div>
        <div className="gruppe-ref"><span className="ref">{f.ref}</span><strong>{kr(sum)}</strong></div>
      </div>
      {f.kommentar && <p className="kommentar">{f.kommentar}</p>}
      <ul className="linjer">
        {linjer.map(l => (
          <li key={l.id}>
            <button className="lenke" onClick={() => onDag(l.dato)}>{langDato(l.dato)} · {tidsrom(l.time)} · {l.bane === 'hel' ? 'Hel' : 'Halv'}</button>
            <span className={`status ${l.status}`}>{STATUSTEKST[l.status]}</span>
            <button className="ikonknapp liten" aria-label="Fjern denne timen" onClick={() => api('PATCH', '/api/admin/bestillinger', { ider: [l.id], status: 'avlyst' }, 'Fjernet.')}><X size={14} /></button>
          </li>
        ))}
      </ul>
      {ventende.length > 0 && (
        <div className="handlinger">
          <button className="knapp" onClick={() => api('PATCH', '/api/admin/bestillinger', { ider: ventende.map(l => l.id), status: 'bekreftet' }, 'Bekreftet.')}><Check size={16} /> Bekreft {ventende.length > 1 ? `alle ${ventende.length}` : ''}</button>
          <button className="knapp sekundar" onClick={() => {
            if (window.confirm(`Avslå hele bestillingen fra ${f.navn}?`)) api('PATCH', '/api/admin/bestillinger', { ider: ventende.map(l => l.id), status: 'avlyst' }, 'Avslått.');
          }}>Avslå</button>
        </div>
      )}
    </section>
  );
}

function Bookinger({ bestillinger, alle, sperringer, api, onDag }: { bestillinger: Bestilling[]; alle: Bestilling[]; sperringer: Sperring[]; api: Api; onDag: (d: string) => void }) {
  const na = naIOslo();
  const kommende = bestillinger.filter(b => b.dato >= na.dato).sort((a, b) => (a.dato + to(a.time)).localeCompare(b.dato + to(b.time)));
  const dager = [...new Set(kommende.map(b => b.dato))];
  const bekreftet = bestillinger.filter(b => b.status === 'bekreftet');
  const belegg = byggBelegg(bestillinger, sperringer);
  const ledigIgjen = datoer(SESONG.fra, SESONG.til).flatMap(d => TIMER.map(t => slot(d, t, belegg, na))).filter(s => s.ledigeHalvdeler === 2).length;
  return (
    <>
      <div className="tall">
        <div className="tallkort"><span>Kommende timer</span><strong>{kommende.length}</strong></div>
        <div className="tallkort"><span>Venter på svar</span><strong>{bestillinger.filter(b => b.status === 'forespurt').length}</strong></div>
        <div className="tallkort"><span>Bekreftet omsetning</span><strong>{kr(bekreftet.reduce((s, b) => s + b.pris, 0))}</strong></div>
        <div className="tallkort"><span>Ledige timer igjen</span><strong>{ledigIgjen}</strong></div>
      </div>
      {dager.length === 0 ? <div className="kort tomt">Ingen kommende bookinger.</div> : (
        <div className="kort">
          {dager.map(d => (
            <Fragment key={d}>
              <button className="lenke adm-daglenke" onClick={() => onDag(d)}>{langDato(d)}</button>
              {kommende.filter(b => b.dato === d).map(b => <Bookingrad key={b.id} b={b} alle={alle} api={api} />)}
            </Fragment>
          ))}
        </div>
      )}
    </>
  );
}

function Kunder({ bestillinger, alle, api, onDag }: { bestillinger: Bestilling[]; alle: Bestilling[]; api: Api; onDag: (d: string) => void }) {
  const [apen, setApen] = useState<string | null>(null);
  const [sok, setSok] = useState('');
  const na = naIOslo();
  const kunder = useMemo(() => {
    const m = new Map<string, Bestilling[]>();
    for (const b of bestillinger) {
      const k = (b.epost || b.telefon || b.navn).toLowerCase();
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return [...m.entries()]
      .map(([k, ls]) => ({ k, ls: ls.sort((a, b) => a.dato.localeCompare(b.dato)), sum: ls.reduce((s, b) => s + b.pris, 0) }))
      .sort((a, b) => b.sum - a.sum);
  }, [bestillinger]);
  const q = sok.trim().toLowerCase();
  const vist = q ? kunder.filter(({ ls }) => [ls[0].navn, ls[0].klubb, ls[0].epost, ls[0].telefon].some(v => v?.toLowerCase().includes(q))) : kunder;

  return (
    <>
      <input className="adm-sok" placeholder="Søk etter navn, klubb, e-post eller telefon" value={sok} onChange={e => setSok(e.target.value)} />
      {vist.length === 0 ? <div className="kort tomt">Ingen kunder ennå.</div> : (
        <div className="kort">
          {vist.map(({ k, ls, sum }) => {
            const f = ls[ls.length - 1];
            const neste = ls.find(b => b.dato >= na.dato);
            return (
              <div key={k} className="kunde">
                <div className="kunde-hode" onClick={() => setApen(apen === k ? null : k)} role="button" tabIndex={0}>
                  <span className="adm-navn"><strong>{f.navn}</strong>{f.klubb && <span className="dempet">{f.klubb}</span>}
                    <span className="dempet kunde-info">{f.telefon}{f.epost ? ` · ${f.epost}` : ''}</span></span>
                  <span className="kunde-tall"><strong>{ls.length} {ls.length === 1 ? 'time' : 'timer'}</strong><span className="dempet">{kr(sum)}{neste ? ` · neste ${dagOgManed(neste.dato, true)}` : ''}</span></span>
                  <Kontakt b={f} alle={alle} />
                </div>
                {apen === k && ls.map(b => <Bookingrad key={b.id} b={b} alle={alle} api={api} visDato />)}
                {apen === k && <button className="lenke" onClick={() => onDag((neste ?? f).dato)}>Vis i kalenderen</button>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Sperringer({ sperringer, api }: { sperringer: Sperring[]; api: Api }) {
  const [s, setS] = useState({ dato: '', fra_time: 8, til_time: 23, arsak: '' });
  async function lagre(e: React.FormEvent) {
    e.preventDefault();
    if (await api('POST', '/api/admin/sperringer', s, 'Sperret.')) setS({ ...s, arsak: '' });
  }
  const timer = [...TIMER, TIMER[TIMER.length - 1] + 1];
  return (
    <>
      <form className="kort skjema" onSubmit={lagre}>
        <p className="dempet">For kampdager, vedlikehold eller arrangementer. Sperret tid kan ikke bookes.</p>
        <div className="to">
          <label>Dato<input type="date" required min={SESONG.fra} max={SESONG.til} value={s.dato} onChange={e => setS({ ...s, dato: e.target.value })} /></label>
          <label>Årsak<input required placeholder="F.eks. Kamp" value={s.arsak} onChange={e => setS({ ...s, arsak: e.target.value })} /></label>
        </div>
        <div className="to">
          <label>Fra<select value={s.fra_time} onChange={e => setS({ ...s, fra_time: Number(e.target.value) })}>{timer.slice(0, -1).map(t => <option key={t} value={t}>{to(t)}:00</option>)}</select></label>
          <label>Til<select value={s.til_time} onChange={e => setS({ ...s, til_time: Number(e.target.value) })}>{timer.slice(1).map(t => <option key={t} value={t}>{to(t)}:00</option>)}</select></label>
        </div>
        <button className="knapp">Sperr</button>
      </form>
      {sperringer.length > 0 && (
        <section className="kort">
          <ul className="linjer">
            {sperringer.map(sp => (
              <li key={sp.id}>
                <span>{langDato(sp.dato)} · {to(sp.fra_time)}:00–{to(sp.til_time)}:00</span>
                <span>{sp.arsak}</span>
                <button className="ikonknapp liten" aria-label="Fjern sperring" onClick={() => api('DELETE', `/api/admin/sperringer?id=${sp.id}`, undefined, 'Sperring fjernet.')}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
