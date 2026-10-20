'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Loader2, Lock, LogOut, Mail, MessageSquare, Phone, Plus, UserCheck, UserX } from 'lucide-react';
import { SESONG, STENGTE_DAGER } from '@/lib/config';
import { TIMER, klubbNavn, type Klubbtid, type Sperring } from '@/lib/tilgjengelighet';
import type { Bruker, Rolle } from '@/lib/lager';
import { dagOgManed, langDato, leggTilDager, mandagI, minutter, naIOslo, ukedag, ukenummer } from '@/lib/dato';
import { UkeOversikt, klubbFarge, tid, type SynligBestilling } from './AdminKlubber';
import type { Api } from './AdminClient';

const ROLLER: Record<Rolle, { navn: string; forklaring: string }> = {
  admin: { navn: 'Admin', forklaring: 'Kan endre alt' },
  innsyn: { navn: 'Innsyn', forklaring: 'Ser hvem som har banen, med kontaktinfo' },
};
const to = (t: number) => String(t).padStart(2, '0');
const iSesong = (d: string) => (d < SESONG.fra ? SESONG.fra : d > SESONG.til ? SESONG.til : d);

export async function hentMeg(): Promise<Bruker | null> {
  const r = await fetch('/api/admin/meg', { cache: 'no-store' });
  return r.ok ? (await r.json()).bruker : null;
}

export async function loggUt() {
  await fetch('/api/admin/login', { method: 'DELETE' });
}

export function Login({ demo, onInne }: { demo: boolean; onInne: (b: Bruker) => void }) {
  const [epost, setEpost] = useState('');
  const [passord, setPassord] = useState('');
  const [feil, setFeil] = useState('');
  const [sender, setSender] = useState(false);
  async function logg(e: React.FormEvent) {
    e.preventDefault();
    setSender(true);
    setFeil('');
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ epost, passord }) });
    const meg = r.ok ? await hentMeg() : null;
    setSender(false);
    if (meg) onInne(meg);
    else setFeil((await r.json().catch(() => ({}))).feil ?? 'Kunne ikke logge inn.');
  }
  return (
    <div className="side admin">
      <div className="oppsett smal">
        <form className="kort skjema" onSubmit={logg}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Finns.Fairway" className="login-logo" />
          <h2><Lock size={18} /> Backoffice</h2>
          <label>E-post<input type="email" autoComplete="username" autoFocus required value={epost} onChange={e => setEpost(e.target.value)} /></label>
          <label>Passord<input type="password" autoComplete="current-password" required value={passord} onChange={e => setPassord(e.target.value)} /></label>
          {demo && <p className="dempet">Demo: admin@demo.no eller vakt@demo.no, passord «demo».</p>}
          {feil && <div className="banner feil">{feil}</div>}
          <button className="knapp full" disabled={sender}>{sender ? 'Logger inn …' : 'Logg inn'}</button>
          <p className="dempet">Glemt passordet? Be en admin om et nytt.</p>
        </form>
      </div>
    </div>
  );
}

export function MittPassord({ onFerdig }: { onFerdig?: () => void }) {
  const [f, setF] = useState({ gammelt: '', nytt: '', igjen: '' });
  const [melding, setMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  async function lagre(e: React.FormEvent) {
    e.preventDefault();
    if (f.nytt !== f.igjen) return setMelding({ tekst: 'De to nye passordene er ikke like.', feil: true });
    const r = await fetch('/api/admin/meg', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gammelt: f.gammelt, nytt: f.nytt }) });
    if (r.ok) {
      setF({ gammelt: '', nytt: '', igjen: '' });
      setMelding({ tekst: 'Passordet er byttet.' });
      onFerdig?.();
    } else setMelding({ tekst: (await r.json().catch(() => ({}))).feil ?? 'Noe gikk galt.', feil: true });
  }
  const felt = (k: keyof typeof f, navn: string, ac: string) => (
    <label>{navn}<input type="password" autoComplete={ac} required value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <form className="kort skjema" onSubmit={lagre}>
      <h2><KeyRound size={18} /> Mitt passord</h2>
      {felt('gammelt', 'Nåværende passord', 'current-password')}
      <div className="to">{felt('nytt', 'Nytt passord (minst 8 tegn)', 'new-password')}{felt('igjen', 'Nytt passord igjen', 'new-password')}</div>
      {melding && <div className={`banner ${melding.feil ? 'feil' : ''}`}>{melding.tekst}</div>}
      <button className="knapp">Bytt passord</button>
    </form>
  );
}

// Viser et nytt passord én gang, med knapp for å kopiere.
function NyttPassord({ hvem, passord, onLukk }: { hvem: string; passord: string; onLukk: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="nytt-passord">
      <span>Passord til {hvem}. Vises bare nå, så gi det videre:</span>
      <code>{passord}</code>
      <span className="adm-handlinger">
        <button className="liten-knapp" onClick={() => { navigator.clipboard?.writeText(passord); setKopiert(true); }}><Copy size={14} /> {kopiert ? 'Kopiert' : 'Kopier'}</button>
        <button className="liten-knapp" onClick={onLukk}>Ferdig</button>
      </span>
    </div>
  );
}

export function Brukere({ meg, api }: { meg: Bruker; api: Api }) {
  const [brukere, setBrukere] = useState<Bruker[] | null>(null);
  const [ny, setNy] = useState<{ navn: string; epost: string; rolle: Rolle } | null>(null);
  const [visPassord, setVisPassord] = useState<{ hvem: string; passord: string } | null>(null);

  async function last() {
    const r = await fetch('/api/admin/brukere', { cache: 'no-store' });
    if (r.ok) setBrukere((await r.json()).brukere);
  }
  useEffect(() => { last(); }, []);

  async function send(body: unknown, ok: string, hvem: string) {
    setVisPassord(null);
    const r = await fetch('/api/admin/brukere', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    await api('GET', '/api/admin/meg', undefined, r.ok ? ok : undefined);
    if (!r.ok) {
      window.alert(j.feil ?? 'Noe gikk galt.');
      return false;
    }
    if (j.passord) setVisPassord({ hvem, passord: j.passord });
    await last();
    return true;
  }

  return (
    <section className="kort">
      <div className="klubbkort-hode">
        <h2>Brukere</h2>
        <button className="liten-knapp primar" onClick={() => setNy(ny ? null : { navn: '', epost: '', rolle: 'innsyn' })}><Plus size={14} /> Ny bruker</button>
      </div>
      <p className="dempet">Admin kan endre alt. Innsyn ser hvem som har banen og hvordan de kan nås, men ikke priser, og kan ikke endre noe.</p>
      {visPassord && <NyttPassord {...visPassord} onLukk={() => setVisPassord(null)} />}
      {ny && (
        <form className="adm-skjema" onSubmit={async e => {
          e.preventDefault();
          if (await send(ny, 'Brukeren er lagt til.', ny.navn)) setNy(null);
        }}>
          <div className="adm-felter">
            <label>Navn<input required autoFocus value={ny.navn} onChange={e => setNy({ ...ny, navn: e.target.value })} /></label>
            <label>E-post<input type="email" required value={ny.epost} onChange={e => setNy({ ...ny, epost: e.target.value })} /></label>
            <label>Tilgang<select value={ny.rolle} onChange={e => setNy({ ...ny, rolle: e.target.value as Rolle })}>
              {(Object.keys(ROLLER) as Rolle[]).map(r => <option key={r} value={r}>{ROLLER[r].navn} – {ROLLER[r].forklaring.toLowerCase()}</option>)}
            </select></label>
          </div>
          <div className="adm-handlinger">
            <button className="liten-knapp primar">Legg til og lag passord</button>
            <button type="button" className="liten-knapp" onClick={() => setNy(null)}>Avbryt</button>
          </div>
        </form>
      )}
      {!brukere ? <div className="laster"><Loader2 className="spinn" size={18} /></div> : (
        <ul className="brukerliste">
          {brukere.map(b => (
            <li key={b.id} className={b.aktiv ? '' : 'inaktiv'}>
              <span className="adm-navn">
                <strong>{b.navn}{b.id === meg.id ? ' (deg)' : ''}</strong>
                <span className="dempet">{b.epost}{b.sist_inne ? ` · sist inne ${dagOgManed(b.sist_inne.slice(0, 10), true)}` : ' · aldri logget inn'}</span>
              </span>
              <select aria-label={`Tilgang for ${b.navn}`} value={b.rolle} disabled={b.id === meg.id || !b.aktiv}
                onChange={e => send({ id: b.id, rolle: e.target.value }, 'Tilgangen er endret.', b.navn)}>
                {(Object.keys(ROLLER) as Rolle[]).map(r => <option key={r} value={r}>{ROLLER[r].navn}</option>)}
              </select>
              <span className="adm-handlinger">
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
  );
}

// Innsyn: hvem som har banen, uke for uke og time for time. Ingen endringer.
type Oversikt = { bestillinger: (SynligBestilling & { telefon: string; epost: string })[]; klubbtider: Klubbtid[]; sperringer: Sperring[] };

// Navn, telefon og e-post med knapper for å ringe, sende SMS og e-post.
function Kontaktlinje({ navn, telefon, epost }: { navn?: string | null; telefon?: string | null; epost?: string | null }) {
  const tlf = (telefon ?? '').replace(/\s/g, '');
  if (!navn && !tlf && !epost) return null;
  return (
    <span className="innsyn-kontakt">
      <span className="dempet">{[navn, telefon].filter(Boolean).join(' · ')}</span>
      <span className="kontaktknapper">
        {tlf && <a href={`tel:${tlf}`} title={`Ring ${navn ?? telefon}`}><Phone size={15} /></a>}
        {tlf && <a href={`sms:${tlf}`} title="Send SMS"><MessageSquare size={15} /></a>}
        {epost && <a href={`mailto:${epost}`} title={`E-post til ${epost}`}><Mail size={15} /></a>}
      </span>
    </span>
  );
}

export function Innsyn({ bruker, onUt }: { bruker: Bruker; onUt: () => void }) {
  const [data, setData] = useState<Oversikt | null>(null);
  const [dag, setDag] = useState(() => iSesong(naIOslo().dato));
  const [passord, setPassord] = useState(false);

  useEffect(() => {
    const hent = async () => {
      const r = await fetch('/api/admin/oversikt', { cache: 'no-store' });
      if (r.status === 401) return onUt();
      if (r.ok) setData(await r.json());
    };
    hent();
    // Hold oversikten fersk når den står åpen på en skjerm.
    const t = setInterval(hent, 60_000);
    return () => clearInterval(t);
  }, []);

  const mandag = mandagI(dag);
  const sondag = leggTilDager(mandag, 6);
  const velg = (d: string) => setDag(iSesong(d));

  // Dagens rader i tidsrekkefølge: klubber med nøyaktig tid, bookinger per time,
  // sperringer, og ledige timer så hele dagen vises.
  const rader = useMemo(() => {
    if (!data) return [];
    const ut: { start: number; node: React.ReactNode }[] = [];
    const klubber = data.klubbtider.filter(k => k.dag === ukedag(dag) && !k.unntak.includes(dag));
    for (const k of klubber) {
      ut.push({
        start: minutter(k.fra),
        node: (
          <div key={k.id} className={`innsyn-rad farge-${klubbFarge(k.klubb)}`}>
            <span className="adm-tid">{tid(k)}</span>
            <strong>{klubbNavn(k)}</strong>
            {k.bane === 'halv' && <span className="merkelapp">Halv</span>}
            <Kontaktlinje navn={k.kontakt} telefon={k.telefon} epost={k.epost} />
          </div>
        ),
      });
    }
    const bookinger = data.bestillinger.filter(b => b.dato === dag);
    for (const b of bookinger) {
      ut.push({
        start: b.time * 60 + 0.5,
        node: (
          <div key={b.id} className={`innsyn-rad kunde ${b.status}`}>
            <span className="adm-tid">{to(b.time)}:00–{to(b.time + 1)}:00</span>
            <strong>{b.navn}{b.klubb ? ` · ${b.klubb}` : ''}</strong>
            <span className="merkelapp">{b.bane === 'hel' ? 'Hel' : 'Halv'}</span>
            {b.status === 'forespurt' && <span className="status forespurt">Ikke bekreftet</span>}
            <Kontaktlinje telefon={b.telefon} epost={b.epost} />
          </div>
        ),
      });
    }
    for (const s of data.sperringer.filter(s => s.dato === dag)) {
      ut.push({ start: s.fra_time * 60, node: <div key={s.id} className="innsyn-rad sperret"><span className="adm-tid">{to(s.fra_time)}:00–{to(s.til_time)}:00</span><strong>Sperret · {s.arsak}</strong></div> });
    }
    for (const t of TIMER) {
      const opptatt = klubber.some(k => minutter(k.fra) < t * 60 + 60 && minutter(k.til) > t * 60)
        || bookinger.some(b => b.time === t)
        || data.sperringer.some(s => s.dato === dag && s.fra_time <= t && s.til_time > t);
      if (!opptatt) ut.push({ start: t * 60, node: <div key={`l${t}`} className="innsyn-rad ledig"><span className="adm-tid">{to(t)}:00–{to(t + 1)}:00</span><span>Ledig</span></div> });
    }
    return ut.sort((a, b) => a.start - b.start).map(r => r.node);
  }, [data, dag]);

  return (
    <div className="admin innsyn">
      <header className="innsyn-topp">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Finns.Fairway" className="adm-logo" />
        <span className="dempet">{bruker.navn}</span>
        <button className="lenke" onClick={() => setPassord(v => !v)}><KeyRound size={16} /> Passord</button>
        <button className="lenke" onClick={async () => { await loggUt(); onUt(); }}><LogOut size={16} /> Logg ut</button>
      </header>
      <main className="innsyn-innhold">
        {passord && <MittPassord onFerdig={() => setPassord(false)} />}
        <div className="dag-nav">
          <button className="kal-nav" aria-label="Forrige dag" disabled={dag <= SESONG.fra} onClick={() => velg(leggTilDager(dag, -1))}>‹</button>
          <h1>{langDato(dag)}</h1>
          <button className="kal-nav" aria-label="Neste dag" disabled={dag >= SESONG.til} onClick={() => velg(leggTilDager(dag, 1))}>›</button>
          <button className="liten-knapp" onClick={() => velg(naIOslo().dato)}>I dag</button>
        </div>
        {!data ? <div className="laster"><Loader2 className="spinn" size={20} /> Laster …</div> : (
          <>
            {STENGTE_DAGER[dag] ? <div className="kort tomt">Stengt · {STENGTE_DAGER[dag]}</div> : <div className="kort innsyn-dag">{rader}</div>}
            <div className="kort uke-kort">
              <div className="mnd-hode">
                <button className="kal-nav" aria-label="Forrige uke" disabled={mandag <= mandagI(SESONG.fra)} onClick={() => velg(leggTilDager(dag, -7))}>‹</button>
                <strong>Uke {ukenummer(mandag)} <span className="dempet">{dagOgManed(mandag, true)} – {dagOgManed(sondag, true)}</span></strong>
                <button className="kal-nav" aria-label="Neste uke" disabled={sondag >= SESONG.til} onClick={() => velg(leggTilDager(dag, 7))}>›</button>
              </div>
              <div className="ur-rull">
                <UkeOversikt mandag={mandag} valgt={dag} onVelg={velg} bestillinger={data.bestillinger} sperringer={data.sperringer} klubbtider={data.klubbtider} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
