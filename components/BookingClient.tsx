'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { ARENA, SESONG, STANDARD_PRIS, type Priser } from '@/lib/config';
import {
  TIMER, erHelg, halvdeler, halvslot, klokke, slot, startAv, varighet, type Bane, type Belegg,
} from '@/lib/tilgjengelighet';
import {
  dagOgManed, dagnavn, datoer, kr, langDato, leggTilDager, mandagI, ukedag, ukenummer,
} from '@/lib/dato';
import { Retningslinjer } from './Retningslinjer';
import { PrisKontekst, usePris } from './Priser';

// Et valg: hel time (minutt 0, 60 min) eller en halvtime (minutt 0/30, 30 min).
type Valgt = { dato: string; time: number; minutt: number; lengde: number; bane: Bane };
type Visning = 'enkelt' | 'fast';
type Na = { dato: string; time: number };
type Kvittering = { ref: string; antall: number; sum: number; linjer: Valgt[] };

const DAGER = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const ALLE_DATOER = datoer(SESONG.fra, SESONG.til);

// Id for denne nettleseren, så valgte timer kan holdes av til den.
function lagOkt(): string {
  const ny = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-okt`);
  try {
    const lagret = sessionStorage.getItem('snak_okt');
    if (lagret) return lagret;
    const id = ny();
    sessionStorage.setItem('snak_okt', id);
    return id;
  } catch {
    return ny();
  }
}

const vKey = (v: Valgt) => `${v.dato}|${String(startAv(v)).padStart(4, '0')}`;
const sorter = (l: Valgt[]) => [...l].sort((a, b) => vKey(a).localeCompare(vKey(b)));
const to = (t: number) => String(t).padStart(2, '0');
const kl = (fra: number, til = fra + 1) => `${to(fra)}–${to(til)}`;
// «13», «13:30»: hele timer uten minutter, så tidene er korte å lese.
const kort = (min: number) => (min % 60 ? klokke(min) : to(min / 60));
const tidKort = (fra: number, til: number) => `${kort(fra)}–${kort(til)}`;
const lagValg = (dato: string, start: number, lengde: number, bane: Bane): Valgt =>
  ({ dato, time: Math.floor(start / 60), minutt: start % 60, lengde, bane });
const overlapper = (a: Valgt, b: Valgt) =>
  a.dato === b.dato && startAv(a) < startAv(b) + b.lengde && startAv(b) < startAv(a) + a.lengde;
const totalMin = (l: Valgt[]) => l.reduce((n, v) => n + v.lengde, 0);
const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Sammenhengende tider samme dag og bane blir én blokk (20–21 + 21–21:30 = 20–21:30),
// og like blokker på samme ukedag blir én linje («Søndager kl. 17–19, 12 ganger»).
type Linje = { tittel: string; under: string; timer: Valgt[] };
function oppsummer(linjer: Valgt[]): Linje[] {
  const blokker: Valgt[][] = [];
  for (const v of sorter(linjer)) {
    const forrige = blokker[blokker.length - 1];
    const siste = forrige?.[forrige.length - 1];
    if (siste && siste.dato === v.dato && siste.bane === v.bane && startAv(siste) + siste.lengde === startAv(v)) forrige.push(v);
    else blokker.push([v]);
  }
  const grupper = new Map<string, Valgt[][]>();
  for (const b of blokker) {
    const k = `${ukedag(b[0].dato)}|${startAv(b[0])}|${totalMin(b)}|${b[0].bane}`;
    grupper.set(k, [...(grupper.get(k) ?? []), b]);
  }
  return [...grupper.values()]
    .sort((a, b) => vKey(a[0][0]).localeCompare(vKey(b[0][0])))
    .map(bs => {
      const f = bs[0][0];
      const tid = tidKort(startAv(f), startAv(f) + totalMin(bs[0]));
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

// Tidslinje for én dag: ledige timer og halvtimer enkeltvis, det som er
// opptatt slått sammen. Tider i minutter etter midnatt.
type Rad =
  | { type: 'ledig'; time: number }
  | { type: 'halv'; start: number }
  | { type: 'opptatt'; fra: number; til: number; tekst: string };

function leggOpptatt(rader: Rad[], fra: number, til: number, tekst: string) {
  const forrige = rader[rader.length - 1];
  if (forrige?.type === 'opptatt' && forrige.til === fra && forrige.tekst === tekst) forrige.til = til;
  else rader.push({ type: 'opptatt', fra, til, tekst });
}

function byggRader(erLedig: (t: number) => boolean, grunn: (t: number) => string): Rad[] {
  const rader: Rad[] = [];
  for (const t of TIMER) {
    if (erLedig(t)) rader.push({ type: 'ledig', time: t });
    else leggOpptatt(rader, t * 60, t * 60 + 60, grunn(t));
  }
  return rader;
}

export function BookingClient() {
  const [priser, setPriser] = useState(STANDARD_PRIS);
  return (
    <PrisKontekst.Provider value={priser}>
      <Booking onPriser={setPriser} />
    </PrisKontekst.Provider>
  );
}

function Booking({ onPriser }: { onPriser: (p: Priser) => void }) {
  const prisFor = usePris();
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
  const [okt] = useState(lagOkt);
  const [holdtTil, setHoldtTil] = useState<number | null>(null);
  const [tatt, setTatt] = useState<string | null>(null);
  const [, setTikk] = useState(0);

  async function last() {
    try {
      const r = await fetch(`/api/tilgjengelighet?okt=${encodeURIComponent(okt)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.feil);
      setBelegg(j.belegg);
      if (j.priser) onPriser(j.priser);
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
    // Hent på nytt jevnlig, så timer andre har tatt eller holder forsvinner.
    const t = setInterval(last, 30_000);
    return () => clearInterval(t);
  }, []);

  // Hold av valgte timer til denne nettleseren, så førstemann får dem mens
  // skjemaet fylles ut. Sendes når valget endres, og jevnlig i skjemaet.
  const holdNr = useRef(0);
  async function holdAv(linjer: Valgt[]) {
    const nr = ++holdNr.current;
    try {
      const r = await fetch('/api/hold', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ okt, linjer: linjer.map(({ dato, time, minutt, lengde, bane }) => ({ dato, time, minutt, lengde, bane })) }),
      });
      const j = await r.json();
      if (!r.ok || nr !== holdNr.current) return;
      const avvist: { dato: string; start: number }[] = j.avvist ?? [];
      const rammet = (v: Valgt) => avvist.some(a => a.dato === v.dato && startAv(v) <= a.start && a.start < startAv(v) + v.lengde);
      const tapt = linjer.filter(rammet);
      setHoldtTil(linjer.length - tapt.length > 0 ? Date.now() + j.minutter * 60_000 : null);
      if (tapt.length) {
        setValgt(p => p.filter(v => !rammet(v)));
        setTatt(`Noen andre rakk å velge ${tapt.map(v => `${dagOgManed(v.dato, true)} ${tidKort(startAv(v), startAv(v) + v.lengde)}`).join(', ')} akkurat nå.`);
        last();
      }
    } catch {
      // Nettfeil: bestillingen sjekkes uansett når den sendes.
    }
  }
  useEffect(() => {
    const t = setTimeout(() => holdAv(valgt), 250);
    return () => clearTimeout(t);
  }, [valgt]);
  useEffect(() => {
    if (steg !== 'skjema' || valgt.length === 0) return;
    const t = setInterval(() => holdAv(valgt), 2 * 60_000);
    return () => clearInterval(t);
  }, [steg, valgt]);
  useEffect(() => {
    // Slipp timene med en gang hvis siden lukkes.
    const slipp = () => navigator.sendBeacon?.('/api/hold', JSON.stringify({ okt, linjer: [] }));
    window.addEventListener('pagehide', slipp);
    const t = setInterval(() => setTikk(n => n + 1), 15_000);
    return () => { window.removeEventListener('pagehide', slipp); clearInterval(t); };
  }, []);
  const minutterIgjen = holdtTil && valgt.length ? Math.max(0, Math.ceil((holdtTil - Date.now()) / 60_000)) : null;

  const iDag = na?.dato ?? SESONG.fra;
  // Antall ledige halvdeler: 2 = hel bane ledig, 1 = bare halv bane.
  const kapasitet = (d: string, t: number) => (belegg && na ? slot(d, t, belegg, na).ledigeHalvdeler : 0);
  const halvKap = (d: string, start: number) => (belegg && na ? halvslot(d, start, belegg, na).ledigeHalvdeler : 0);
  const antallLedige = (d: string) => TIMER.filter(t => halvKap(d, t * 60) > 0 || halvKap(d, t * 60 + 30) > 0).length;
  // Timer der kunden har valgt å se halvtimene hver for seg.
  const [delt, setDelt] = useState<Set<string>>(new Set());

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

  const sum = valgt.reduce((s, v) => s + prisFor(v.bane, v.dato, v.lengde), 0);
  // Hel time valgt på dagen, og valg som starter på en bestemt halvtime.
  const valgtPaa = (d: string, t: number) => valgt.find(v => v.dato === d && v.time === t && v.minutt === 0 && v.lengde === 60);
  const valgtHalv = (d: string, start: number) => valgt.find(v => v.dato === d && startAv(v) === start && v.lengde === 30);

  // Samme knapp igjen fjerner tida, den andre banestørrelsen bytter.
  // Et nytt valg erstatter det som overlapper samme tid.
  function velg(d: string, start: number, lengde: number, bane: Bane) {
    setValgt(prev => {
      const ny = lagValg(d, start, lengde, bane);
      const lik = prev.find(v => v.dato === d && startAv(v) === start && v.lengde === lengde);
      const uten = prev.filter(v => !overlapper(v, ny));
      return lik?.bane === bane ? uten : sorter([...uten, ny]);
    });
  }

  function velgFast(ds: string[], t: number, bane: Bane) {
    setValgt(prev => {
      const alle = ds.every(d => prev.some(v => v.dato === d && v.time === t && v.lengde === 60 && v.bane === bane));
      const uten = prev.filter(v => !(v.time === t && ukedag(v.dato) === ukedag(ds[0])));
      return alle ? uten : sorter([...uten, ...ds.map(d => lagValg(d, t * 60, 60, bane))]);
    });
  }

  if (kvittering) {
    return <Bekreftelse k={kvittering} onNy={() => { setKvittering(null); last(); }} />;
  }

  if (steg === 'skjema') {
    return (
      <Ramme>
        <Skjema valgt={valgt} sum={sum} okt={okt} minutterIgjen={minutterIgjen} onTilbake={() => setSteg('velg')}
          onFjern={ls => setValgt(p => p.filter(v => !ls.includes(v)))}
          onFerdig={k => { setKvittering(k); setValgt([]); setSteg('velg'); }} onOpptatt={last} />
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

  // Enkelttimer: hel time når begge halvtimene er ledige; ellers den ledige
  // halvtimen alene. Kunden kan også dele en ledig time i to halvtimer.
  const halvGrunn = (d: string, start: number) => {
    if (!belegg || !na) return '';
    const s = halvslot(d, start, belegg, na);
    return s.tilstand === 'stengt' ? s.tekst ?? 'Stengt' : '';
  };
  function dagsRader(d: string): Rad[] {
    const rader: Rad[] = [];
    for (const t of TIMER) {
      const [a, b] = [t * 60, t * 60 + 30];
      const harHalv = valgtHalv(d, a) || valgtHalv(d, b);
      const hel = (halvKap(d, a) > 0 && halvKap(d, b) > 0) || !!valgtPaa(d, t);
      if (hel && !harHalv && !delt.has(`${d}|${t}`)) { rader.push({ type: 'ledig', time: t }); continue; }
      for (const s of [a, b]) {
        if (halvKap(d, s) > 0 || valgtHalv(d, s)) rader.push({ type: 'halv', start: s });
        else leggOpptatt(rader, s, s + 30, halvGrunn(d, s));
      }
    }
    return rader;
  }
  function delTime(d: string, t: number, del: boolean) {
    setDelt(prev => {
      const ny = new Set(prev);
      if (del) ny.add(`${d}|${t}`); else ny.delete(`${d}|${t}`);
      return ny;
    });
    // Valget for timen gjelder ikke lenger når den deles eller slås sammen.
    setValgt(prev => prev.filter(v => !(v.dato === d && v.time === t)));
  }

  const rader = visning === 'enkelt'
    ? dagsRader(dag)
    : byggRader(t => faste.has(`${fastDag}|${t}`), () => '');

  return (
    <Ramme>
      {demo && <p className="melding">Demo: bestillinger lagres ikke permanent.</p>}
      {lastFeil && <p className="melding feil">{lastFeil} <button className="lenke" onClick={last}>Prøv igjen</button></p>}
      {tatt && <p className="melding feil">{tatt} <button className="lenke" onClick={() => setTatt(null)}>OK</button></p>}

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
                    <span className="tl-tid">{tidKort(r.fra, r.til)}</span>
                    {r.tekst && <span>{r.tekst}</span>}
                  </div>
                );
              }
              if (r.type === 'halv') {
                const s = r.start;
                const t = Math.floor(s / 60);
                const iDelt = halvKap(dag, t * 60) > 0 && halvKap(dag, t * 60 + 30) > 0 && s % 60 === 0;
                return (
                  <Tidsrad key={`h${s}`} tid={tidKort(s, s + 30)} under={iDelt ? undefined : '30 min'} dato={dag} lengde={30}
                    kanHel={halvKap(dag, s) === 2 || valgtHalv(dag, s)?.bane === 'hel'}
                    valgt={valgtHalv(dag, s)?.bane} onVelg={b => velg(dag, s, 30, b)}
                    lenke={iDelt ? { tekst: 'Hele timen', onClick: () => delTime(dag, t, false) } : undefined} />
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
                                <button className={pa ? 'pa' : ''} aria-pressed={pa} onClick={() => velg(x, a.time * 60, 60, a.bane)}>
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
                <Tidsrad key={t} tid={kl(t)} dato={dag} lengde={60} kanHel={kapasitet(dag, t) === 2 || valgtPaa(dag, t)?.bane === 'hel'}
                  valgt={valgtPaa(dag, t)?.bane} onVelg={b => velg(dag, t * 60, 60, b)}
                  lenke={{ tekst: 'Del i halvtimer', onClick: () => delTime(dag, t, true) }} />
              );
            })}
          </div>
        </>
      )}

      {valgt.length > 0 && (
        <div className="bunn">
          <div className="bunn-innhold">
            <div>
              <strong>{varighet(totalMin(valgt))}</strong>
              <span>{kr(sum)}{minutterIgjen ? ` · holdt av til deg i ${minutterIgjen} min` : ''}</span>
            </div>
            <button className="lenke" onClick={() => setValgt([])}>Tøm</button>
            <button className="knapp" onClick={() => { setSteg('skjema'); window.scrollTo(0, 0); }}>Fortsett</button>
          </div>
        </div>
      )}
    </Ramme>
  );
}

// Én ledig time eller halvtime: tid til venstre, valg av banestørrelse med
// pris til høyre. `lenke` deler en time i halvtimer eller slår dem sammen.
function Tidsrad({ tid, under, dato, lengde = 60, kanHel, valgt, onVelg, lenke }: {
  tid: string;
  under?: string;
  dato: string;
  lengde?: number;
  kanHel: boolean;
  valgt?: Bane;
  onVelg: (b: Bane) => void;
  lenke?: { tekst: string; onClick: () => void };
}) {
  const prisFor = usePris();
  return (
    <div className={`tl-ledig ${valgt ? 'valgt' : ''}`}>
      <span className="tl-tid">
        {tid}
        {under && <small>{under}</small>}
        {lenke && <button type="button" className="tl-del" onClick={lenke.onClick}>{lenke.tekst}</button>}
      </span>
      <span className="tl-valg">
        {(['hel', 'halv'] as Bane[]).map(b => (b === 'hel' && !kanHel) ? null : (
          <button key={b} aria-pressed={valgt === b} className={valgt === b ? 'pa' : ''} onClick={() => onVelg(b)}>
            {valgt === b && <Check size={15} />}
            <span>{b === 'hel' ? 'Hel' : 'Halv'}</span>
            <small>{kr(prisFor(b, dato, lengde))}</small>
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
          <img src="/logo-gul.png" alt="Finns.Fairway" className="logo" />
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

function Skjema({ valgt, sum, okt, minutterIgjen, onTilbake, onFjern, onFerdig, onOpptatt }: {
  valgt: Valgt[];
  sum: number;
  okt: string;
  minutterIgjen: number | null;
  onTilbake: () => void;
  onFjern: (ls: Valgt[]) => void;
  onFerdig: (k: Kvittering) => void;
  onOpptatt: () => void;
}) {
  const prisFor = usePris();
  const [f, setF] = useState({ navn: '', telefon: '', epost: '', klubb: '', kommentar: '' });
  const [godtatt, setGodtatt] = useState(false);
  const [sender, setSender] = useState(false);
  const [feil, setFeil] = useState<{ tekst: string; opptatt?: string[] } | null>(null);
  const serie = new Set(valgt.map(v => `${startAv(v)}|${v.lengde}|${v.bane}`)).size < valgt.length;

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
        body: JSON.stringify({ ...f, okt, linjer: valgt, serie }),
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
      {minutterIgjen ? <p className="hjelp">Timene er holdt av til deg i {minutterIgjen} min, så ingen andre kan ta dem mens du fyller ut.</p> : null}
      <ul className="oppsummering">
        {oppsummer(valgt).map(l => (
          <li key={vKey(l.timer[0]) + l.timer.length}>
            <div>
              <strong>{l.tittel}</strong>
              <span>{l.under}</span>
            </div>
            <span className="pris">{kr(l.timer.reduce((s, v) => s + prisFor(v.bane, v.dato, v.lengde), 0))}</span>
            <button className="fjern" aria-label="Fjern" onClick={() => onFjern(l.timer)}><X size={16} /></button>
          </li>
        ))}
      </ul>
      <p className="total"><span>Totalt, {varighet(totalMin(valgt))}</span><strong>{kr(sum)}</strong></p>

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
        <p className="total"><span>Totalt, {varighet(totalMin(k.linjer))}</span><strong>{kr(k.sum)}</strong></p>

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
