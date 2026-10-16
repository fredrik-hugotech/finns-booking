'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { X, Loader2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { ARENA, PRIS, SESONG } from '@/lib/config';
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

export function BookingClient() {
  const [belegg, setBelegg] = useState<Belegg | null>(null);
  const [na, setNa] = useState<Na | null>(null);
  const [demo, setDemo] = useState(false);
  const [lastFeil, setLastFeil] = useState<string | null>(null);

  const [visning, setVisning] = useState<Visning>('enkelt');
  const [bane, setBane] = useState<Bane>('hel');
  const [mandag, setMandag] = useState(mandagI(SESONG.fra));
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
      return j.na as Na;
    } catch {
      setLastFeil('Fikk ikke hentet ledige tider. Sjekk nettet og prøv igjen.');
      return null;
    }
  }
  useEffect(() => {
    last().then(n => { if (n && n.dato > SESONG.fra && n.dato <= SESONG.til) setMandag(mandagI(n.dato)); });
  }, []);

  const trengs = halvdeler(bane);
  const ledig = (d: string, t: number) => !!belegg && !!na && slot(d, t, belegg, na).ledigeHalvdeler >= trengs;

  // Faste tider: for hver ukedag og time, hvilke av de gjenværende ukene som er ledige.
  const faste = useMemo(() => {
    const ut = new Map<string, { ledige: string[]; uker: number }>();
    if (!belegg || !na) return ut;
    for (let dag = 1; dag <= 7; dag++) {
      const dagens = ALLE_DATOER.filter(d => ukedag(d) === dag);
      for (const t of TIMER) {
        const kommende = dagens.filter(d => slot(d, t, belegg, na).tilstand !== 'passert');
        const ledige = kommende.filter(d => slot(d, t, belegg, na).ledigeHalvdeler >= trengs);
        if (ledige.length >= 2) ut.set(`${dag}|${t}`, { ledige, uker: kommende.length });
      }
    }
    return ut;
  }, [belegg, na, trengs]);

  const sum = valgt.reduce((s, v) => s + prisFor(v.bane, v.dato), 0);
  const valgtPaa = (d: string, t: number) => valgt.find(v => v.dato === d && v.time === t);

  function velg(d: string, t: number) {
    setValgt(prev => {
      const finnes = prev.find(v => v.dato === d && v.time === t);
      return finnes ? prev.filter(v => v !== finnes) : sorter([...prev, { dato: d, time: t, bane }]);
    });
  }

  function velgFast(ds: string[], t: number) {
    setValgt(prev => {
      const alle = ds.every(d => prev.some(v => v.dato === d && v.time === t));
      const uten = prev.filter(v => !(v.time === t && ds.includes(v.dato)));
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

  const uke = datoer(mandag, leggTilDager(mandag, 6));
  const forste = mandagI(na && na.dato > SESONG.fra ? na.dato : SESONG.fra);
  const siste = mandagI(SESONG.til);
  const ledigeIUka = uke.reduce((n, d) => n + TIMER.filter(t => ledig(d, t)).length, 0);
  // Timer som er fulle hele uka (f.eks. A-lagets formiddag) tar bare plass.
  const synligeTimer = TIMER.filter(t => visning === 'fast'
    ? [1, 2, 3, 4, 5, 6, 7].some(dag => faste.has(`${dag}|${t}`))
    : uke.some(d => ledig(d, t) || valgtPaa(d, t)));

  return (
    <Ramme>
      {demo && <p className="melding">Demo: bestillinger lagres ikke permanent.</p>}
      {lastFeil && <p className="melding feil">{lastFeil} <button className="lenke" onClick={last}>Prøv igjen</button></p>}

      <div className="kontroller">
        <div className="visning" role="tablist">
          <button role="tab" aria-selected={visning === 'enkelt'} className={visning === 'enkelt' ? 'aktiv' : ''} onClick={() => setVisning('enkelt')}>Enkeltuker</button>
          <button role="tab" aria-selected={visning === 'fast'} className={visning === 'fast' ? 'aktiv' : ''} onClick={() => setVisning('fast')}>Fast tid hver uke</button>
        </div>
        <div className="segment" role="group" aria-label="Banestørrelse">
          {(['hel', 'halv'] as Bane[]).map(b => (
            <button key={b} aria-pressed={bane === b} className={bane === b ? 'pa' : ''} onClick={() => setBane(b)}>
              {b === 'hel' ? 'Hel bane' : 'Halv bane'}
            </button>
          ))}
        </div>
      </div>

      {visning === 'enkelt' ? (
        <div className="ukenav">
          <button aria-label="Forrige uke" disabled={mandag <= forste} onClick={() => setMandag(leggTilDager(mandag, -7))}><ChevronLeft size={20} /></button>
          <div>
            <strong>Uke {ukenummer(mandag)}</strong>
            <span>{dagOgManed(uke[0], true)} – {dagOgManed(uke[6], true)} · {belegg ? `${ledigeIUka} ledige` : '…'}</span>
          </div>
          <button aria-label="Neste uke" disabled={mandag >= siste} onClick={() => setMandag(leggTilDager(mandag, 7))}><ChevronRight size={20} /></button>
        </div>
      ) : (
        <p className="hjelp">Trykk på en tid for å ta den alle ukene den er ledig resten av sesongen. Tallet er antall uker.</p>
      )}

      {!belegg ? (
        <p className="laster"><Loader2 className="spinn" size={18} /> Henter ledige tider</p>
      ) : synligeTimer.length === 0 ? (
        <p className="tomt">Ingen ledige timer {visning === 'enkelt' ? 'denne uka' : 'flere uker på rad'} for {bane} bane.</p>
      ) : (
        <div className="rutenett" role="grid" aria-label={visning === 'enkelt' ? `Uke ${ukenummer(mandag)}` : 'Faste ukentlige tider'}>
          <span />
          {uke.map((d, i) => (
            <span key={d} className={`kolonne ${erHelg(d) ? 'helg' : ''}`}>
              {DAGER[i]}{visning === 'enkelt' && <b>{Number(d.slice(8))}</b>}
            </span>
          ))}
          {synligeTimer.map(t => (
            <Fragment key={t}>
              <span className="klokke">{to(t)}</span>
              {uke.map((d, i) => {
                if (visning === 'fast') {
                  const f = faste.get(`${i + 1}|${t}`);
                  if (!f) return <span key={d} className="rute tom" />;
                  const pa = f.ledige.every(x => valgtPaa(x, t));
                  return (
                    <button key={d} className={`rute ledig ${pa ? 'pa' : ''}`} aria-pressed={pa}
                      aria-label={`${stor(dagnavn(d))}er kl. ${kl(t)}, ledig ${f.ledige.length} av ${f.uker} uker`}
                      onClick={() => velgFast(f.ledige, t)}>
                      {pa ? <Check size={16} /> : f.ledige.length}
                    </button>
                  );
                }
                const v = valgtPaa(d, t);
                if (!v && !ledig(d, t)) return <span key={d} className="rute tom" />;
                return (
                  <button key={d} className={`rute ledig ${v ? 'pa' : ''}`} aria-pressed={!!v}
                    aria-label={`${langDato(d)} kl. ${kl(t)}${v ? ', valgt' : ', ledig'}`}
                    onClick={() => velg(d, t)}>
                    {v && (v.bane === 'halv' ? '½' : <Check size={16} />)}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}

      <p className="tegnforklaring">
        <span className="rute ledig" /> Ledig <span className="rute pa"><Check size={12} /></span> Valgt <span className="rute tom" /> Opptatt
        <span className="pris-info">
          {bane === 'hel' ? 'Hel' : 'Halv'} bane {kr(PRIS.ukedag[bane])} per time, helg {kr(PRIS.helg[bane])}
        </span>
      </p>

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
        <h1>Book tid på {ARENA.navn}</h1>
        <p className="ingress">
          Vinteråpen arena {dagOgManed(SESONG.fra)} – {dagOgManed(SESONG.til)}. Trykk på de grønne rutene for å velge timer.
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
