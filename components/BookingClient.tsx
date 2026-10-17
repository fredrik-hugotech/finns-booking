'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { ARENA, SESONG } from '@/lib/config';
import {
  TIMER, erHelg, halvdeler, nokkel, prisFor, slot, type Bane, type Belegg,
} from '@/lib/tilgjengelighet';
import {
  dagOgManed, dagnavn, datoer, kr, langDato, leggTilDager, mandagI, ukedag, ukenummer,
} from '@/lib/dato';
import { Retningslinjer } from './Retningslinjer';

type Valgt = { dato: string; time: number; bane: Bane };
type Visning = 'enkelt' | 'fast';
type Na = { dato: string; time: number };
type Kvittering = { ref: string; antall: number; sum: number; linjer: Valgt[] };

const DAGER = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const ALLE_DATOER = datoer(SESONG.fra, SESONG.til);

const vKey = (v: { dato: string; time: number }) => nokkel(v.dato, v.time);
const sorter = (l: Valgt[]) => [...l].sort((a, b) => vKey(a).localeCompare(vKey(b)));
const to = (t: number) => String(t).padStart(2, '0');
const kl = (fra: number, til = fra + 1) => `${to(fra)}–${to(til)}`;
const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Sammenhengende timer samme dag og bane blir én blokk (20–21 + 21–22 = 20–22),
// og like blokker på samme ukedag blir én linje («Søndager kl. 17–19, 12 ganger»).
type Linje = { tittel: string; under: string; timer: Valgt[] };
function oppsummer(linjer: Valgt[]): Linje[] {
  const blokker: Valgt[][] = [];
  for (const v of sorter(linjer)) {
    const forrige = blokker[blokker.length - 1];
    const siste = forrige?.[forrige.length - 1];
    if (siste && siste.dato === v.dato && siste.bane === v.bane && siste.time + 1 === v.time) forrige.push(v);
    else blokker.push([v]);
  }
  const grupper = new Map<string, Valgt[][]>();
  for (const b of blokker) {
    const k = `${ukedag(b[0].dato)}|${b[0].time}|${b.length}|${b[0].bane}`;
    grupper.set(k, [...(grupper.get(k) ?? []), b]);
  }
  return [...grupper.values()]
    .sort((a, b) => vKey(a[0][0]).localeCompare(vKey(b[0][0])))
    .map(bs => {
      const f = bs[0][0];
      const tid = kl(f.time, f.time + bs[0].length);
      const bane = f.bane === 'hel' ? 'hel bane' : 'halv bane';
      const timer = bs.flat();
      if (bs.length === 1) return { tittel: `${langDato(f.dato)}, kl. ${tid}`, under: bane, timer };
      const sisteDato = bs[bs.length - 1][0].dato;
      return {
        tittel: `${stor(dagnavn(f.dato))}er kl. ${tid}`,
        under: `${bane}, ${bs.length} ganger (${dagOgManed(f.dato, true)} – ${dagOgManed(sisteDato, true)})`,
        timer,
      };
    });
}

// Dagbrikker og ukenavigasjon etter mønster fra mer.golf-kalenderen.
function ukeTekst(mandag: string, iDag: string) {
  const denne = mandagI(iDag);
  if (mandag === denne) return 'Denne uken';
  if (mandag === leggTilDager(denne, 7)) return 'Neste uke';
  const son = leggTilDager(mandag, 6);
  return mandag.slice(5, 7) === son.slice(5, 7)
    ? `${Number(mandag.slice(8))}.–${dagOgManed(son, true)}`
    : `${dagOgManed(mandag, true)} – ${dagOgManed(son, true)}`;
}

function brikke(d: string, iDag: string) {
  const tekst = d === iDag ? 'I dag' : d === leggTilDager(iDag, 1) ? 'I morgen' : DAGER[ukedag(d) - 1];
  return { tekst, dato: `${Number(d.slice(8))}.${Number(d.slice(5, 7))}.` };
}

// Tidslinje for én dag: ledige timer enkeltvis, opptatte timer slått sammen.
type Rad =
  | { type: 'ledig'; time: number }
  | { type: 'opptatt'; fra: number; til: number; tekst: string };

function byggRader(erLedig: (t: number) => boolean, grunn: (t: number) => string): Rad[] {
  const rader: Rad[] = [];
  for (const t of TIMER) {
    if (erLedig(t)) { rader.push({ type: 'ledig', time: t }); continue; }
    const forrige = rader[rader.length - 1];
    const tekst = grunn(t);
    if (forrige?.type === 'opptatt' && forrige.til === t && forrige.tekst === tekst) forrige.til = t + 1;
    else rader.push({ type: 'opptatt', fra: t, til: t + 1, tekst });
  }
  return rader;
}

export function BookingClient() {
  const [belegg, setBelegg] = useState<Belegg | null>(null);
  const [na, setNa] = useState<Na | null>(null);
  const [demo, setDemo] = useState(false);
  const [lastFeil, setLastFeil] = useState<string | null>(null);

  const [visning, setVisning] = useState<Visning>('enkelt');
  const [dag, setDag] = useState(SESONG.fra);
  const [fastDag, setFastDag] = useState(1);
  const [retning, setRetning] = useState<'fwd' | 'back'>('fwd');
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
      return j as { belegg: Belegg; na: Na };
    } catch {
      setLastFeil('Fikk ikke hentet ledige tider. Sjekk nettet og prøv igjen.');
      return null;
    }
  }
  useEffect(() => {
    // Start på første dag med noe ledig.
    last().then(j => {
      if (!j) return;
      const forste = ALLE_DATOER.find(d => TIMER.some(t => slot(d, t, j.belegg, j.na).ledigeHalvdeler > 0));
      if (forste) setDag(forste);
    });
  }, []);

  const iDag = na?.dato ?? SESONG.fra;
  // Antall ledige halvdeler: 2 = hel bane ledig, 1 = bare halv bane.
  const kapasitet = (d: string, t: number) => (belegg && na ? slot(d, t, belegg, na).ledigeHalvdeler : 0);
  const antallLedige = (d: string) => TIMER.filter(t => kapasitet(d, t) > 0).length;

  // Faste tider: for hver ukedag og time, hvilke gjenværende uker som har hel/halv bane ledig.
  const faste = useMemo(() => {
    const ut = new Map<string, { hel: string[]; halv: string[]; kommende: string[] }>();
    if (!belegg || !na) return ut;
    for (let d = 1; d <= 7; d++) {
      const dagens = ALLE_DATOER.filter(x => ukedag(x) === d);
      for (const t of TIMER) {
        const kommende = dagens.filter(x => slot(x, t, belegg, na).tilstand !== 'passert');
        const halv = kommende.filter(x => slot(x, t, belegg, na).ledigeHalvdeler >= 1);
        const hel = kommende.filter(x => slot(x, t, belegg, na).ledigeHalvdeler === 2);
        if (halv.length >= 2) ut.set(`${d}|${t}`, { hel, halv, kommende });
      }
    }
    return ut;
  }, [belegg, na]);

  const sum = valgt.reduce((s, v) => s + prisFor(v.bane, v.dato), 0);
  const valgtPaa = (d: string, t: number) => valgt.find(v => v.dato === d && v.time === t);

  // Samme knapp igjen fjerner timen, den andre banestørrelsen bytter.
  function velg(d: string, t: number, bane: Bane) {
    setValgt(prev => {
      const finnes = prev.find(v => v.dato === d && v.time === t);
      const uten = prev.filter(v => v !== finnes);
      return finnes?.bane === bane ? uten : sorter([...uten, { dato: d, time: t, bane }]);
    });
  }

  function velgFast(ds: string[], t: number, bane: Bane) {
    setValgt(prev => {
      const alle = ds.every(d => prev.some(v => v.dato === d && v.time === t && v.bane === bane));
      const uten = prev.filter(v => !(v.time === t && ukedag(v.dato) === ukedag(ds[0])));
      return alle ? uten : sorter([...uten, ...ds.map(d => ({ dato: d, time: t, bane }))]);
    });
  }

  if (kvittering) {
    return <Bekreftelse k={kvittering} onNy={() => { setKvittering(null); setValgt([]); setSteg('velg'); last(); }} />;
  }

  if (steg === 'skjema') {
    return (
      <Ramme>
        <Skjema valgt={valgt} sum={sum} onTilbake={() => setSteg('velg')}
          onFjern={ls => setValgt(p => p.filter(v => !ls.includes(v)))}
          onFerdig={setKvittering} onOpptatt={last} />
      </Ramme>
    );
  }

  const mandag = mandagI(dag);
  const uke = datoer(mandag, leggTilDager(mandag, 6));
  const forsteMandag = mandagI(iDag > SESONG.fra ? iDag : SESONG.fra);
  const sisteMandag = mandagI(SESONG.til);

  // Forslag for en uke der den faste tida er tatt: halv bane samme tid,
  // ellers nærmeste ledige time samme dag med samme banestørrelse.
  function alternativ(d: string, t: number, b: Bane): { time: number; bane: Bane } | null {
    if (b === 'hel' && kapasitet(d, t) >= 1) return { time: t, bane: 'halv' };
    for (const dt of [1, -1, 2, -2]) {
      const tt = t + dt;
      if (TIMER.includes(tt) && kapasitet(d, tt) >= halvdeler(b)) return { time: tt, bane: b };
    }
    return null;
  }

  function blaUke(delta: number) {
    setRetning(delta > 0 ? 'fwd' : 'back');
    const ny = datoer(leggTilDager(mandag, 7 * delta), leggTilDager(mandag, 7 * delta + 6))
      .filter(d => d >= iDag && d >= SESONG.fra && d <= SESONG.til);
    setDag(ny.find(d => antallLedige(d) > 0) ?? ny[0] ?? dag);
  }

  const grunn = (d: string) => (t: number) => {
    if (!belegg || !na) return '';
    const s = slot(d, t, belegg, na);
    return s.tilstand === 'stengt' ? s.tekst ?? 'Stengt' : '';
  };

  const fastDato = ALLE_DATOER.find(x => ukedag(x) === fastDag)!;
  const rader = visning === 'enkelt'
    ? byggRader(t => kapasitet(dag, t) > 0 || !!valgtPaa(dag, t), grunn(dag))
    : byggRader(t => faste.has(`${fastDag}|${t}`), () => '');

  return (
    <Ramme>
      {demo && <p className="melding">Demo: bestillinger lagres ikke permanent.</p>}
      {lastFeil && <p className="melding feil">{lastFeil} <button className="lenke" onClick={last}>Prøv igjen</button></p>}

      <div className="visning" role="tablist">
        <button role="tab" aria-selected={visning === 'enkelt'} className={visning === 'enkelt' ? 'aktiv' : ''} onClick={() => setVisning('enkelt')}>Enkelttimer</button>
        <button role="tab" aria-selected={visning === 'fast'} className={visning === 'fast' ? 'aktiv' : ''} onClick={() => setVisning('fast')}>Fast hver uke</button>
      </div>

      {!belegg ? (
        <p className="laster"><Loader2 className="spinn" size={18} /> Henter ledige tider</p>
      ) : (
        <>
          {visning === 'enkelt' ? (
            <>
              <div className="uke-nav">
                <button className="kal-nav" aria-label="Forrige uke" disabled={mandag <= forsteMandag} onClick={() => blaUke(-1)}>‹</button>
                <span className="uke-nav-tekst">Uke {ukenummer(mandag)}<small>{ukeTekst(mandag, iDag)}</small></span>
                <button className="kal-nav" aria-label="Neste uke" disabled={mandag >= sisteMandag} onClick={() => blaUke(1)}>›</button>
              </div>
              <div className={`dagstripe uke-${retning}`} key={mandag}>
                {uke.map(d => {
                  const b = brikke(d, iDag);
                  const ute = d < iDag || d < SESONG.fra || d > SESONG.til;
                  const n = ute ? 0 : antallLedige(d);
                  return (
                    <button key={d} className={`dagbrikke ${d === dag ? 'valgt' : ''} ${erHelg(d) ? 'helg' : ''}`}
                      disabled={ute || n === 0} onClick={() => setDag(d)}>
                      <span className="dagbrikke-tekst">{b.tekst}</span>
                      <span className="dagbrikke-dato">{b.dato}</span>
                      {valgt.some(v => v.dato === d) && <span className="prikk" />}
                    </button>
                  );
                })}
              </div>
              <h2 className="valgt-dag">{langDato(dag)}</h2>
            </>
          ) : (
            <>
              <div className="dagstripe">
                {DAGER.map((n, i) => {
                  const d = i + 1;
                  const har = TIMER.some(t => faste.has(`${d}|${t}`));
                  return (
                    <button key={n} className={`dagbrikke ${d === fastDag ? 'valgt' : ''} ${d >= 6 ? 'helg' : ''}`}
                      disabled={!har} onClick={() => setFastDag(d)}>
                      <span className="dagbrikke-dato">{n}</span>
                      {valgt.some(v => ukedag(v.dato) === d) && <span className="prikk" />}
                    </button>
                  );
                })}
              </div>
              <h2 className="valgt-dag">{stor(dagnavn(fastDato))}er resten av sesongen</h2>
            </>
          )}

          <div className="tidslinje">
            {rader.map(r => {
              if (r.type === 'opptatt') {
                return (
                  <div key={`o${r.fra}`} className="tl-opptatt">
                    <span className="tl-tid">{kl(r.fra, r.til)}</span>
                    {r.tekst && <span>{r.tekst}</span>}
                  </div>
                );
              }
              const t = r.time;
              if (visning === 'fast') {
                const f = faste.get(`${fastDag}|${t}`)!;
                const valgtBane = (['hel', 'halv'] as Bane[]).find(b => {
                  const ds = b === 'hel' ? f.hel : f.halv;
                  return ds.length > 0 && ds.every(x => valgtPaa(x, t)?.bane === b);
                });
                const tatt = valgtBane ? f.kommende.filter(x => !(valgtBane === 'hel' ? f.hel : f.halv).includes(x)) : [];
                return (
                  <Fragment key={t}>
                    <Tidsrad tid={kl(t)} under={f.hel.length >= 2 && f.hel.length < f.halv.length ? `hel ${f.hel.length}, halv ${f.halv.length} av ${f.kommende.length} uker` : `${f.halv.length} av ${f.kommende.length} uker`} dato={fastDato}
                      kanHel={f.hel.length >= 2} valgt={valgtBane}
                      onVelg={b => velgFast(b === 'hel' ? f.hel : f.halv, t, b)} />
                    {tatt.length > 0 && (
                      <div className="tl-avvik">
                        {tatt.map(x => {
                          const a = alternativ(x, t, valgtBane!);
                          const stengt = belegg && na ? slot(x, t, belegg, na).tilstand === 'stengt' : false;
                          const pa = a ? valgtPaa(x, a.time)?.bane === a.bane : false;
                          return (
                            <div key={x} className="avvik-rad">
                              <span>{dagOgManed(x, true)} {stengt ? 'stengt' : 'opptatt'}</span>
                              {a && !stengt ? (
                                <button className={pa ? 'pa' : ''} aria-pressed={pa} onClick={() => velg(x, a.time, a.bane)}>
                                  {pa && <Check size={13} />} {a.time === t ? 'Halv bane' : kl(a.time)}{a.time !== t && a.bane === 'halv' ? ' halv' : ''} <small>{kr(prisFor(a.bane, x))}</small>
                                </button>
                              ) : <span className="dempet-tekst">{stengt ? '' : 'ingen annen tid'}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Fragment>
                );
              }
              return (
                <Tidsrad key={t} tid={kl(t)} dato={dag} kanHel={kapasitet(dag, t) === 2 || valgtPaa(dag, t)?.bane === 'hel'}
                  valgt={valgtPaa(dag, t)?.bane} onVelg={b => velg(dag, t, b)} />
              );
            })}
          </div>
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

// Én ledig time: tid til venstre, valg av banestørrelse med pris til høyre.
function Tidsrad({ tid, under, dato, kanHel, valgt, onVelg }: {
  tid: string;
  under?: string;
  dato: string;
  kanHel: boolean;
  valgt?: Bane;
  onVelg: (b: Bane) => void;
}) {
  return (
    <div className={`tl-ledig ${valgt ? 'valgt' : ''}`}>
      <span className="tl-tid">{tid}{under && <small>{under}</small>}</span>
      <span className="tl-valg">
        {(['hel', 'halv'] as Bane[]).map(b => (b === 'hel' && !kanHel) ? null : (
          <button key={b} aria-pressed={valgt === b} className={valgt === b ? 'pa' : ''} onClick={() => onVelg(b)}>
            {valgt === b && <Check size={15} />}
            <span>{b === 'hel' ? 'Hel' : 'Halv'}</span>
            <small>{kr(prisFor(b, dato))}</small>
          </button>
        ))}
      </span>
    </div>
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
        <h1>{ARENA.navn}</h1>
        <p className="ingress">Vinteråpen {dagOgManed(SESONG.fra, true)} – {dagOgManed(SESONG.til, true)}</p>
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
        {oppsummer(valgt).map(l => (
          <li key={vKey(l.timer[0]) + l.timer.length}>
            <div>
              <strong>{l.tittel}</strong>
              <span>{l.under}</span>
            </div>
            <span className="pris">{kr(l.timer.reduce((s, v) => s + prisFor(v.bane, v.dato), 0))}</span>
            <button className="fjern" aria-label="Fjern" onClick={() => onFjern(l.timer)}><X size={16} /></button>
          </li>
        ))}
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
          {oppsummer(k.linjer).map(l => (
            <li key={vKey(l.timer[0]) + l.timer.length}>
              <div><strong>{l.tittel}</strong><span>{l.under}</span></div>
            </li>
          ))}
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
