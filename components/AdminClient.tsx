'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, X, ChevronLeft, ChevronRight, LogOut, Trash2, Loader2, Lock, Inbox, CalendarDays, Ban, List, Phone, Mail } from 'lucide-react';
import { SESONG } from '@/lib/config';
import { TIMER, byggBelegg, fastTidFor, slot, type Bestilling, type Sperring, type Status } from '@/lib/tilgjengelighet';
import { dagOgManed, dagnavn, datoer, kr, langDato, leggTilDager, mandagI, naIOslo, tidsrom, ukenummer } from '@/lib/dato';

type Fane = 'foresporsler' | 'alle' | 'ukeplan' | 'sperringer';
type Gruppe = { ref: string; linjer: Bestilling[]; forste: Bestilling };

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
    <div className="side">
      <div className="oppsett smal">
        <form className="kort skjema" onSubmit={logg}>
          <h2><Lock size={18} /> Admin · vinteråpen arena</h2>
          <label>Passord<input type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)} /></label>
          {demo && <p className="dempet">Demo-modus: passordet er «demo».</p>}
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
  const [fane, setFane] = useState<Fane>('foresporsler');
  const [melding, setMelding] = useState('');

  async function last() {
    const [a, b] = await Promise.all([fetch('/api/admin/bestillinger'), fetch('/api/admin/sperringer')]);
    if (a.status === 401) return onUt();
    setBestillinger((await a.json()).bestillinger);
    setSperringer((await b.json()).sperringer);
  }
  useEffect(() => { last(); }, []);

  async function settStatus(ider: string[], status: Status) {
    setMelding('');
    const r = await fetch('/api/admin/bestillinger', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ider, status }) });
    if (!r.ok) setMelding((await r.json()).feil ?? 'Kunne ikke oppdatere.');
    await last();
  }

  async function loggUt() {
    await fetch('/api/admin/login', { method: 'DELETE' });
    onUt();
  }

  const grupper = useMemo<Gruppe[]>(() => {
    const m = new Map<string, Bestilling[]>();
    for (const b of bestillinger ?? []) (m.get(b.ref) ?? m.set(b.ref, []).get(b.ref)!).push(b);
    return [...m.entries()]
      .map(([ref, linjer]) => ({ ref, linjer, forste: linjer[0] }))
      .sort((a, b) => b.forste.opprettet.localeCompare(a.forste.opprettet));
  }, [bestillinger]);

  if (!bestillinger) return <div className="side"><div className="laster"><Loader2 className="spinn" size={20} /> Laster …</div></div>;

  const aktive = bestillinger.filter(b => b.status !== 'avlyst');
  const ventende = grupper.filter(g => g.linjer.some(l => l.status === 'forespurt'));
  const bekreftet = bestillinger.filter(b => b.status === 'bekreftet');
  const na = naIOslo();
  const belegg = byggBelegg(aktive, sperringer);
  const ledigIgjen = datoer(SESONG.fra, SESONG.til)
    .flatMap(d => TIMER.map(t => slot(d, t, belegg, na)))
    .filter(s => s.ledigeHalvdeler === 2).length;

  return (
    <div className="side admin">
      <header className="admintopp">
        <div>
          <p className="overtittel">Admin</p>
          <h1>{SESONG.navn}</h1>
        </div>
        <button className="lenke" onClick={loggUt}><LogOut size={16} /> Logg ut</button>
      </header>

      <div className="tall">
        <div className="tallkort"><span>Venter på svar</span><strong>{ventende.length}</strong></div>
        <div className="tallkort"><span>Bekreftede timer</span><strong>{bekreftet.length}</strong></div>
        <div className="tallkort"><span>Bekreftet omsetning</span><strong>{kr(bekreftet.reduce((s, b) => s + b.pris, 0))}</strong></div>
        <div className="tallkort"><span>Helt ledige timer igjen</span><strong>{ledigIgjen}</strong></div>
      </div>

      <nav className="faner">
        <button className={fane === 'foresporsler' ? 'på' : ''} onClick={() => setFane('foresporsler')}><Inbox size={15} /> Forespørsler{ventende.length ? ` (${ventende.length})` : ''}</button>
        <button className={fane === 'ukeplan' ? 'på' : ''} onClick={() => setFane('ukeplan')}><CalendarDays size={15} /> Ukeplan</button>
        <button className={fane === 'alle' ? 'på' : ''} onClick={() => setFane('alle')}><List size={15} /> Alle</button>
        <button className={fane === 'sperringer' ? 'på' : ''} onClick={() => setFane('sperringer')}><Ban size={15} /> Sperringer</button>
      </nav>

      {melding && <div className="banner feil">{melding}</div>}

      {fane === 'foresporsler' && (
        ventende.length === 0
          ? <div className="kort tomt">Ingen forespørsler venter. Nye bestillinger dukker opp her.</div>
          : ventende.map(g => <GruppeKort key={g.ref} g={g} onStatus={settStatus} />)
      )}
      {fane === 'alle' && (
        grupper.length === 0
          ? <div className="kort tomt">Ingen bestillinger ennå.</div>
          : grupper.map(g => <GruppeKort key={g.ref} g={g} onStatus={settStatus} />)
      )}
      {fane === 'ukeplan' && <Ukeplan bestillinger={aktive} sperringer={sperringer} />}
      {fane === 'sperringer' && <Sperringer sperringer={sperringer} onEndret={last} />}
    </div>
  );
}

const STATUSTEKST: Record<Status, string> = { forespurt: 'Venter', bekreftet: 'Bekreftet', avlyst: 'Avlyst' };

function GruppeKort({ g, onStatus }: { g: Gruppe; onStatus: (ider: string[], s: Status) => void }) {
  const { forste: f } = g;
  const aktive = g.linjer.filter(l => l.status !== 'avlyst');
  const ventende = g.linjer.filter(l => l.status === 'forespurt');
  const sum = aktive.reduce((s, l) => s + l.pris, 0);
  return (
    <section className="kort gruppe">
      <div className="gruppe-topp">
        <div>
          <strong>{f.navn}</strong>{f.klubb && <span className="dempet"> · {f.klubb}</span>}
          <div className="kontakt">
            <a href={`tel:${f.telefon}`}><Phone size={13} /> {f.telefon}</a>
            <a href={`mailto:${f.epost}?subject=${encodeURIComponent(`Booking ${g.ref}`)}`}><Mail size={13} /> {f.epost}</a>
          </div>
        </div>
        <div className="gruppe-ref">
          <span className="ref">{g.ref}</span>
          <strong>{kr(sum)}</strong>
        </div>
      </div>
      {f.kommentar && <p className="kommentar">{f.kommentar}</p>}
      <ul className="linjer">
        {g.linjer.map(l => (
          <li key={l.id} className={l.status}>
            <span>{langDato(l.dato)} · {tidsrom(l.time)} · {l.bane === 'hel' ? 'Hel' : 'Halv'}</span>
            <span className={`status ${l.status}`}>{STATUSTEKST[l.status]}</span>
            {l.status !== 'avlyst'
              ? <button className="ikonknapp liten" aria-label="Avlys denne timen" onClick={() => onStatus([l.id], 'avlyst')}><X size={14} /></button>
              : <span className="ikonplass" />}
          </li>
        ))}
      </ul>
      {ventende.length > 0 && (
        <div className="handlinger">
          <button className="knapp" onClick={() => onStatus(ventende.map(l => l.id), 'bekreftet')}><Check size={16} /> Bekreft {ventende.length > 1 ? `alle ${ventende.length}` : ''}</button>
          <button className="knapp sekundar" onClick={() => onStatus(ventende.map(l => l.id), 'avlyst')}>Avslå</button>
        </div>
      )}
    </section>
  );
}

function Ukeplan({ bestillinger, sperringer }: { bestillinger: Bestilling[]; sperringer: Sperring[] }) {
  const start = naIOslo().dato < SESONG.fra ? SESONG.fra : naIOslo().dato;
  const [mandag, setMandag] = useState(mandagI(start));
  const uke = datoer(mandag, leggTilDager(mandag, 6));

  function celle(d: string, t: number) {
    if (d < SESONG.fra || d > SESONG.til) return <td key={d} className="c-ute" />;
    const sp = sperringer.find(s => s.dato === d && s.fra_time <= t && s.til_time > t);
    if (sp) return <td key={d} className="c-sperret">{sp.arsak}</td>;
    const fast = fastTidFor(d, t);
    if (fast) return <td key={d} className="c-fast">{fast.klubb}</td>;
    const her = bestillinger.filter(b => b.dato === d && b.time === t);
    if (her.length === 0) return <td key={d} className="c-ledig" />;
    return (
      <td key={d} className={her.some(b => b.status === 'forespurt') ? 'c-venter' : 'c-booket'}>
        {her.map(b => <div key={b.id}>{b.klubb || b.navn} <span>{b.bane === 'hel' ? 'hel' : '½'}</span></div>)}
      </td>
    );
  }

  return (
    <section className="kort">
      <div className="ukevelger">
        <button className="ikonknapp" aria-label="Forrige uke" onClick={() => setMandag(leggTilDager(mandag, -7))}><ChevronLeft size={20} /></button>
        <div className="uketittel"><strong>Uke {ukenummer(mandag)}</strong><span className="dempet">{dagOgManed(uke[0])} – {dagOgManed(uke[6])}</span></div>
        <button className="ikonknapp" aria-label="Neste uke" onClick={() => setMandag(leggTilDager(mandag, 7))}><ChevronRight size={20} /></button>
      </div>
      <div className="forklaring">
        <span className="c-fast">Fast klubbtid</span><span className="c-booket">Bekreftet</span><span className="c-venter">Venter</span><span className="c-sperret">Sperret</span><span className="c-ledig">Ledig</span>
      </div>
      <div className="tabellrull">
        <table className="ukeplan">
          <thead>
            <tr><th />{uke.map(d => <th key={d}>{dagnavn(d, true)} {Number(d.slice(8))}.</th>)}</tr>
          </thead>
          <tbody>
            {TIMER.map(t => (
              <tr key={t}><th>{String(t).padStart(2, '0')}</th>{uke.map(d => celle(d, t))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Sperringer({ sperringer, onEndret }: { sperringer: Sperring[]; onEndret: () => void }) {
  const [s, setS] = useState({ dato: '', fra_time: 8, til_time: 23, arsak: '' });
  const [feil, setFeil] = useState('');
  async function lagre(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch('/api/admin/sperringer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) });
    if (!r.ok) return setFeil((await r.json()).feil);
    setFeil('');
    setS({ ...s, arsak: '' });
    onEndret();
  }
  async function slett(id: string) {
    await fetch(`/api/admin/sperringer?id=${id}`, { method: 'DELETE' });
    onEndret();
  }
  const timer = [...TIMER, TIMER[TIMER.length - 1] + 1];
  return (
    <>
      <form className="kort skjema" onSubmit={lagre}>
        <h2>Sperr tid</h2>
        <p className="dempet">For kampdager, vedlikehold eller arrangementer. Sperret tid kan ikke bookes.</p>
        <div className="to">
          <label>Dato<input type="date" required min={SESONG.fra} max={SESONG.til} value={s.dato} onChange={e => setS({ ...s, dato: e.target.value })} /></label>
          <label>Årsak<input required placeholder="F.eks. Kamp" value={s.arsak} onChange={e => setS({ ...s, arsak: e.target.value })} /></label>
        </div>
        <div className="to">
          <label>Fra<select value={s.fra_time} onChange={e => setS({ ...s, fra_time: Number(e.target.value) })}>{timer.slice(0, -1).map(t => <option key={t} value={t}>{String(t).padStart(2, '0')}:00</option>)}</select></label>
          <label>Til<select value={s.til_time} onChange={e => setS({ ...s, til_time: Number(e.target.value) })}>{timer.slice(1).map(t => <option key={t} value={t}>{String(t).padStart(2, '0')}:00</option>)}</select></label>
        </div>
        {feil && <div className="banner feil">{feil}</div>}
        <button className="knapp">Sperr</button>
      </form>
      {sperringer.length > 0 && (
        <section className="kort">
          <ul className="linjer">
            {sperringer.map(sp => (
              <li key={sp.id}>
                <span>{langDato(sp.dato)} · {String(sp.fra_time).padStart(2, '0')}:00–{String(sp.til_time).padStart(2, '0')}:00</span>
                <span>{sp.arsak}</span>
                <button className="ikonknapp liten" aria-label="Fjern sperring" onClick={() => slett(sp.id)}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
