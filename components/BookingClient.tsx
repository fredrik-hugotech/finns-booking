'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ARENA, PRIS, SESONG } from '@/lib/config';
import {
  TIMER, nokkel, prisFor, slot, type Bane, type Belegg,
} from '@/lib/tilgjengelighet';
import {
  dagOgManed, dagnavn, datoer, kr, langDato, mandagI, ukedag, ukenummer,
} from '@/lib/dato';
import { Retningslinjer } from './Retningslinjer';

type Valgt = { dato: string; time: number; bane: Bane };
type Visning = 'enkelt' | 'fast';
type Tid = 'alle' | 'dag' | 'kveld';
type Na = { dato: string; time: number };
type Kvittering = { ref: string; antall: number; sum: number; linjer: Valgt[] };

const DAGER = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const ALLE_DATOER = datoer(SESONG.fra, SESONG.til);
const UKER_PER_SIDE = 3;

const vKey = (v: { dato: string; time: number }) => nokkel(v.dato, v.time);
const sorter = (l: Valgt[]) => [...l].sort((a, b) => vKey(a).localeCompare(vKey(b)));
const kl = (t: number) => `${String(t).padStart(2, '0')}–${String(t + 1).padStart(2, '0')}`;
const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Slår sammen like timer (samme ukedag, tid og bane) til én linje.
function grupper(linjer: Valgt[]): Valgt[][] {
  const m = new Map<string, Valgt[]>();
  for (const l of sorter(linjer)) {
    const k = `${ukedag(l.dato)}|${l.time}|${l.bane}`;
    m.set(k, [...(m.get(k) ?? []), l]);
  }
  return [...m.values()].sort((a, b) => vKey(a[0]).localeCompare(vKey(b[0])));
}

function gruppetekst(ls: Valgt[]) {
  const f = ls[0];
  const bane = f.bane === 'hel' ? 'hel bane' : 'halv bane';
  if (ls.length === 1) return { tittel: `${langDato(f.dato)}, kl. ${kl(f.time)}`, under: bane };
  return {
    tittel: `${stor(dagnavn(f.dato))}er kl. ${kl(f.time)}`,
    under: `${bane}, ${ls.length} ganger (${dagOgManed(f.dato, true)} – ${dagOgManed(ls[ls.length - 1].dato, true)})`,
  };
}

export function BookingClient() {
  const [belegg, setBelegg] = useState<Belegg | null>(null);
  const [na, setNa] = useState<Na | null>(null);
  const [demo, setDemo] = useState(false);
  const [lastFeil, setLastFeil] = useState<string | null>(null);

  const [visning, setVisning] = useState<Visning>('enkelt');
  const [dager, setDager] = useState<number[]>([]);
  const [tid, setTid] = useState<Tid>('alle');
  const [antallUker, setAntallUker] = useState(UKER_PER_SIDE);
  const [valgt, setValgt] = useState<Valgt[]>([]);
  const [steg, setSteg] = useState<'velg' | 'skjema'>('velg');
  const [kvittering, setKvittering] = useState<Kvittering | null>(null);

  async function last() {
    try {
      const r = await fetch('/api/tilgjengelighet', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.feil);
      setBelegg(j.belegg);
      setNa(j.na);
      setDemo(j.demo);
      setLastFeil(null);
    } catch {
      setLastFeil('Fikk ikke hentet ledige tider. Sjekk nettet og prøv igjen.');
    }
  }
  useEffect(() => { last(); }, []);

  const passer = (dato: string, time: number) =>
    (dager.length === 0 || dager.includes(ukedag(dato))) &&
    (tid === 'alle' || (tid === 'dag' ? time < 17 : time >= 17));

  // Alle ledige timer i sesongen, gruppert på uke og dag.
  const ledigeUker = useMemo(() => {
    if (!belegg || !na) return [];
    const uker = new Map<string, Map<string, { time: number; ledige: number }[]>>();
    for (const d of ALLE_DATOER) {
      for (const t of TIMER) {
        if (!passer(d, t)) continue;
        const s = slot(d, t, belegg, na);
        if (s.ledigeHalvdeler === 0) continue;
        const uke = uker.get(mandagI(d)) ?? new Map();
        uke.set(d, [...(uke.get(d) ?? []), { time: t, ledige: s.ledigeHalvdeler }]);
        uker.set(mandagI(d), uke);
      }
    }
    return [...uker.entries()];
  }, [belegg, na, dager, tid]);

  // Faste ukentlige tider: hvor mange av de gjenværende ukene hver
  // kombinasjon av ukedag og time er ledig.
  const fasteTider = useMemo(() => {
    if (!belegg || !na) return [];
    const ut: { dag: number; time: number; hel: string[]; halv: string[]; uker: number }[] = [];
    for (let dag = 1; dag <= 7; dag++) {
      const dagens = ALLE_DATOER.filter(d => ukedag(d) === dag && d >= na.dato);
      for (const t of TIMER) {
        if (!passer(dagens[0] ?? SESONG.fra, t) || (dager.length && !dager.includes(dag))) continue;
        const kommende = dagens.filter(d => slot(d, t, belegg, na).tilstand !== 'passert');
        const hel = kommende.filter(d => slot(d, t, belegg, na).ledigeHalvdeler === 2);
        const halv = kommende.filter(d => slot(d, t, belegg, na).ledigeHalvdeler >= 1);
        if (halv.length >= 2) ut.push({ dag, time: t, hel, halv, uker: kommende.length });
      }
    }
    return ut;
  }, [belegg, na, dager, tid]);

  const sum = valgt.reduce((s, v) => s + prisFor(v.bane, v.dato), 0);
  const valgtPaa = (d: string, t: number) => valgt.find(v => v.dato === d && v.time === t);

  function velg(d: string, t: number, bane: Bane) {
    setValgt(prev => {
      const finnes = prev.find(v => v.dato === d && v.time === t);
      const uten = prev.filter(v => v !== finnes);
      return finnes?.bane === bane ? uten : sorter([...uten, { dato: d, time: t, bane }]);
    });
  }

  // Velger (eller fjerner) samme time alle ledige uker.
  function velgFast(datoer: string[], t: number, bane: Bane) {
    setValgt(prev => {
      const alleValgt = datoer.every(d => prev.some(v => v.dato === d && v.time === t && v.bane === bane));
      const uten = prev.filter(v => !(v.time === t && datoer.includes(v.dato)));
      return alleValgt ? uten : sorter([...uten, ...datoer.map(d => ({ dato: d, time: t, bane }))]);
    });
  }

  if (kvittering) {
    return <Bekreftelse k={kvittering} onNy={() => { setKvittering(null); setValgt([]); setSteg('velg'); last(); }} />;
  }

  if (steg === 'skjema') {
    return (
      <Ramme>
        <Skjema valgt={valgt} sum={sum} onTilbake={() => setSteg('velg')} onFjern={ls => setValgt(p => p.filter(v => !ls.includes(v)))}
          onFerdig={setKvittering} onOpptatt={last} />
      </Ramme>
    );
  }

  const vistUker = ledigeUker.slice(0, antallUker);

  return (
    <Ramme>
      {demo && <p className="melding">Demo: bestillinger lagres ikke permanent.</p>}
      {lastFeil && <p className="melding feil">{lastFeil} <button className="lenke" onClick={last}>Prøv igjen</button></p>}

      <div className="visning" role="tablist">
        <button role="tab" aria-selected={visning === 'enkelt'} className={visning === 'enkelt' ? 'aktiv' : ''} onClick={() => setVisning('enkelt')}>Enkelttimer</button>
        <button role="tab" aria-selected={visning === 'fast'} className={visning === 'fast' ? 'aktiv' : ''} onClick={() => setVisning('fast')}>Fast tid hver uke</button>
      </div>

      <div className="filter">
        <div className="dagvalg" role="group" aria-label="Ukedager">
          {DAGER.map((n, i) => {
            const dag = i + 1;
            const pa = dager.includes(dag);
            return (
              <button key={n} aria-pressed={pa} className={pa ? 'pa' : ''}
                onClick={() => { setDager(p => pa ? p.filter(x => x !== dag) : [...p, dag]); setAntallUker(UKER_PER_SIDE); }}>
                {n}
              </button>
            );
          })}
        </div>
        <select aria-label="Tid på døgnet" value={tid} onChange={e => { setTid(e.target.value as Tid); setAntallUker(UKER_PER_SIDE); }}>
          <option value="alle">Hele dagen</option>
          <option value="dag">Før kl. 17</option>
          <option value="kveld">Etter kl. 17</option>
        </select>
      </div>

      {!belegg ? (
        <p className="laster"><Loader2 className="spinn" size={18} /> Henter ledige tider</p>
      ) : visning === 'enkelt' ? (
        ledigeUker.length === 0 ? (
          <p className="tomt">Ingen ledige timer med dette utvalget.</p>
        ) : (
          <>
            {vistUker.map(([mandag, dagerIUka]) => (
              <section key={mandag} className="uke">
                <h2>Uke {ukenummer(mandag)}</h2>
                {[...dagerIUka.entries()].map(([d, timer]) => (
                  <div key={d} className="dag">
                    <h3>{langDato(d)}</h3>
                    <ul>
                      {timer.map(({ time: t, ledige }) => (
                        <Rad key={t} tekst={`kl. ${kl(t)}`} merknad={ledige === 1 ? 'Kun halv bane' : undefined}
                          dato={d} kanHel={ledige === 2} valgt={valgtPaa(d, t)?.bane}
                          onVelg={b => velg(d, t, b)} />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
            {ledigeUker.length > antallUker && (
              <button className="flere" onClick={() => setAntallUker(n => n + UKER_PER_SIDE)}>
                Vis flere uker ({ledigeUker.length - antallUker} igjen)
              </button>
            )}
          </>
        )
      ) : fasteTider.length === 0 ? (
        <p className="tomt">Ingen faste tider er ledige flere uker med dette utvalget.</p>
      ) : (
        <>
          <p className="hjelp">Velg en tid, så legges alle ledige uker resten av sesongen i bestillingen.</p>
          {[1, 2, 3, 4, 5, 6, 7].map(dag => {
            const rader = fasteTider.filter(f => f.dag === dag);
            if (!rader.length) return null;
            const eksempel = rader[0].halv[0];
            return (
              <section key={dag} className="dag">
                <h3>{stor(dagnavn(eksempel))}er</h3>
                <ul>
                  {rader.map(f => {
                    const valgtBane = (['hel', 'halv'] as Bane[]).find(b => {
                      const ds = b === 'hel' ? f.hel : f.halv;
                      return ds.length > 0 && ds.every(d => valgt.some(v => v.dato === d && v.time === f.time && v.bane === b));
                    });
                    return (
                      <Rad key={f.time} tekst={`kl. ${kl(f.time)}`} dato={eksempel}
                        merknad={`Ledig ${f.halv.length} av ${f.uker} uker${f.hel.length < f.halv.length ? `, hel bane ${f.hel.length}` : ''}`}
                        kanHel={f.hel.length >= 2} valgt={valgtBane}
                        onVelg={b => velgFast(b === 'hel' ? f.hel : f.halv, f.time, b)} />
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {valgt.length > 0 && (
        <div className="bunn">
          <div className="bunn-innhold">
            <div>
              <strong>{valgt.length} {valgt.length === 1 ? 'time' : 'timer'}</strong>
              <span>{kr(sum)}</span>
            </div>
            <button className="lenke" onClick={() => setValgt([])}>Tøm</button>
            <button className="knapp" onClick={() => { setSteg('skjema'); window.scrollTo(0, 0); }}>Fortsett</button>
          </div>
        </div>
      )}
    </Ramme>
  );
}

function Rad({ tekst, merknad, dato, kanHel, valgt, onVelg }: {
  tekst: string;
  merknad?: string;
  dato: string;
  kanHel: boolean;
  valgt?: Bane;
  onVelg: (b: Bane) => void;
}) {
  return (
    <li className={`rad ${valgt ? 'valgt' : ''}`}>
      <span className="rad-tid">{tekst}</span>
      {merknad && <span className="rad-merknad">{merknad}</span>}
      <span className="rad-valg">
        {kanHel && (
          <button aria-pressed={valgt === 'hel'} className={valgt === 'hel' ? 'pa' : ''} onClick={() => onVelg('hel')}>
            Hel <small>{kr(prisFor('hel', dato))}</small>
          </button>
        )}
        <button aria-pressed={valgt === 'halv'} className={valgt === 'halv' ? 'pa' : ''} onClick={() => onVelg('halv')}>
          Halv <small>{kr(prisFor('halv', dato))}</small>
        </button>
      </span>
    </li>
  );
}

function Ramme({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topp">
        <div className="innhold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Finns.Fairway" className="logo" />
        </div>
      </header>
      <main className="innhold">
        <h1>Ledige timer på {ARENA.navn}</h1>
        <p className="ingress">
          Vinteråpen arena {dagOgManed(SESONG.fra)} – {dagOgManed(SESONG.til)}, kl. 08–23.
          Hel bane {kr(PRIS.ukedag.hel)} per time ({kr(PRIS.helg.hel)} i helgene),
          halv bane {kr(PRIS.ukedag.halv)} ({kr(PRIS.helg.halv)} i helgene).
        </p>
        {children}
      </main>
      <footer className="fot innhold">
        {ARENA.arrangor} · {ARENA.navn}, {ARENA.sted}
      </footer>
    </>
  );
}

function Skjema({ valgt, sum, onTilbake, onFjern, onFerdig, onOpptatt }: {
  valgt: Valgt[];
  sum: number;
  onTilbake: () => void;
  onFjern: (ls: Valgt[]) => void;
  onFerdig: (k: Kvittering) => void;
  onOpptatt: () => void;
}) {
  const [f, setF] = useState({ navn: '', telefon: '', epost: '', klubb: '', kommentar: '' });
  const [godtatt, setGodtatt] = useState(false);
  const [sender, setSender] = useState(false);
  const [feil, setFeil] = useState<{ tekst: string; opptatt?: string[] } | null>(null);
  const serie = new Set(valgt.map(v => `${v.time}|${v.bane}`)).size < valgt.length;

  useEffect(() => { if (valgt.length === 0) onTilbake(); }, [valgt.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!godtatt) return setFeil({ tekst: 'Du må godta retningslinjene for bruk av arenaen.' });
    setSender(true);
    setFeil(null);
    try {
      const r = await fetch('/api/bestill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f, linjer: valgt, serie }),
      });
      const j = await r.json();
      if (!r.ok) {
        setFeil({ tekst: j.feil, opptatt: j.opptatt });
        if (r.status === 409) onOpptatt();
        return;
      }
      onFerdig({ ref: j.ref, antall: j.antall, sum: j.sum, linjer: valgt });
    } catch {
      setFeil({ tekst: 'Fikk ikke kontakt. Prøv igjen.' });
    } finally {
      setSender(false);
    }
  }

  const felt = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value }),
  });

  return (
    <div className="smal">
      <button type="button" className="lenke" onClick={onTilbake}>&larr; Tilbake til ledige timer</button>

      <h2 className="seksjon">Din bestilling</h2>
      <ul className="oppsummering">
        {grupper(valgt).map(ls => {
          const { tittel, under } = gruppetekst(ls);
          const pris = ls.reduce((s, v) => s + prisFor(v.bane, v.dato), 0);
          return (
            <li key={vKey(ls[0]) + ls[0].bane}>
              <div>
                <strong>{tittel}</strong>
                <span>{under}</span>
              </div>
              <span className="pris">{kr(pris)}</span>
              <button className="fjern" aria-label="Fjern" onClick={() => onFjern(ls)}><X size={16} /></button>
            </li>
          );
        })}
      </ul>
      <p className="total"><span>Totalt, {valgt.length} {valgt.length === 1 ? 'time' : 'timer'}</span><strong>{kr(sum)}</strong></p>

      <form className="skjema" onSubmit={send}>
        <h2 className="seksjon">Kontaktinfo</h2>
        <label>Navn<input required autoComplete="name" {...felt('navn')} /></label>
        <div className="to">
          <label>Telefon<input required type="tel" autoComplete="tel" inputMode="tel" {...felt('telefon')} /></label>
          <label>E-post<input required type="email" autoComplete="email" {...felt('epost')} /></label>
        </div>
        <label>Klubb eller lag (valgfritt)<input {...felt('klubb')} /></label>
        <label>Kommentar (valgfritt)<textarea rows={3} {...felt('kommentar')} /></label>

        <details className="regler">
          <summary>Retningslinjer for bruk av arenaen</summary>
          <Retningslinjer />
        </details>
        <label className="avkryss">
          <input type="checkbox" checked={godtatt} onChange={e => setGodtatt(e.target.checked)} />
          Jeg har lest og godtar retningslinjene
        </label>

        <p className="liten">Bestillingen er en forespørsel. Finns.Fairway bekrefter, og den blir bindende når betalingen er mottatt.</p>

        {feil && (
          <div className="melding feil">
            {feil.tekst}
            {feil.opptatt && <ul>{feil.opptatt.map(o => <li key={o}>{o}</li>)}</ul>}
          </div>
        )}
        <button className="knapp" disabled={sender}>
          {sender ? 'Sender …' : `Send bestilling (${kr(sum)})`}
        </button>
      </form>
    </div>
  );
}

function Bekreftelse({ k, onNy }: { k: Kvittering; onNy: () => void }) {
  return (
    <Ramme>
      <div className="smal">
        <h2 className="seksjon">Takk, forespørselen er sendt</h2>
        <p>Referanse: <strong className="ref">{k.ref}</strong></p>
        <p>Finns.Fairway går gjennom bestillingen og bekrefter den. Den blir bindende når betalingen er mottatt.</p>

        <ul className="oppsummering">
          {grupper(k.linjer).map(ls => {
            const { tittel, under } = gruppetekst(ls);
            return (
              <li key={vKey(ls[0]) + ls[0].bane}>
                <div><strong>{tittel}</strong><span>{under}</span></div>
              </li>
            );
          })}
        </ul>
        <p className="total"><span>Totalt, {k.antall} {k.antall === 1 ? 'time' : 'timer'}</span><strong>{kr(k.sum)}</strong></p>

        <div className="vipps">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vipps-qr.png" alt="Vipps QR-kode til Finns.Fairway" width={132} height={132} />
          <div>
            <h3>Betal med Vipps</h3>
            <p>Skann koden og skriv <strong>{k.ref}</strong> i meldingen.</p>
          </div>
        </div>
        <button className="knapp sekundar" onClick={onNy}>Book flere timer</button>
      </div>
    </Ramme>
  );
}
