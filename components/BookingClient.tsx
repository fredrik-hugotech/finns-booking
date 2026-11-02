'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { ARENA, SESONG, STANDARD_PRIS, type Priser } from '@/lib/config';
import {
  HALVTIMER, TIMER, erHelg, halvdeler, halvslot, klokke, ledigIntervall, slot, startAv, varighet, type Bane, type Belegg,
} from '@/lib/tilgjengelighet';
import {
  dagOgManed, dagnavn, datoer, kr, langDato, leggTilDager, mandagI, minutter, ukedag, ukenummer,
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

// Tidslinje: ledige tider enkeltvis, det som er opptatt slått sammen.
// Tider i minutter etter midnatt.
type Rad =
  | { type: 'ledig'; start: number; lengde: number }
  | { type: 'opptatt'; fra: number; til: number; tekst: string };
type Fast = { start: number; lengde: number; hel: string[]; halv: string[]; kommende: string[] };

function leggOpptatt(rader: Rad[], fra: number, til: number, tekst: string) {
  const forrige = rader[rader.length - 1];
  if (forrige?.type === 'opptatt' && forrige.til === fra && forrige.tekst === tekst) forrige.til = til;
  else rader.push({ type: 'opptatt', fra, til, tekst });
}

// Minste booking er 1 time. En halvtime kan bare legges til en time rett før
// eller etter (1,5 timer, 2,5 timer …). Valg som bryter regelen ryddes bort:
// sammenhengende tider samme dag må til sammen bli minst 60 minutter.
function ryddHalvtimer(valg: Valgt[]): Valgt[] {
  const ut: Valgt[] = [];
  let blokk: Valgt[] = [];
  const lukk = () => {
    if (blokk.reduce((n, v) => n + v.lengde, 0) >= 60) ut.push(...blokk);
    else ut.push(...blokk.filter(v => v.lengde >= 60));
    blokk = [];
  };
  for (const v of sorter(valg)) {
    const siste = blokk[blokk.length - 1];
    if (siste && (siste.dato !== v.dato || startAv(siste) + siste.lengde !== startAv(v))) lukk();
    blokk.push(v);
  }
  lukk();
  return ut;
}

// Del dagen i rader. Hvert sammenhengende ledige tidsrom deles i hele timer.
// Går det opp, deles det fra starten (09:30–10:30). Blir det en halvtime til
// overs, legges den der resten treffer hele klokketimer: 20:30–23 blir
// 20:30–21, 21–22, 22–23, og 08–10:30 blir 08–09, 09–10, 10–10:30.
// En halvtime med opptatt tid på begge sider kan ikke bookes. Tider kunden
// alt har valgt, vises med den lengden de ble valgt med.
function delInn(kap: (s: number) => number, grunn: (s: number) => string, valgtLengde?: (s: number) => number | undefined, valgtDekker?: (s: number) => boolean): Rad[] {
  const rader: Rad[] = [];
  const H = HALVTIMER;
  for (let i = 0; i < H.length;) {
    const valgt = valgtLengde?.(H[i]);
    if (valgt) {
      rader.push({ type: 'ledig', start: H[i], lengde: valgt });
      i += valgt / 30;
      continue;
    }
    if (kap(H[i]) <= 0) {
      leggOpptatt(rader, H[i], H[i] + 30, grunn(H[i]));
      i++;
      continue;
    }
    // Finn slutten på det ledige tidsrommet (stopper ved en valgt tid).
    let j = i + 1;
    while (j < H.length && kap(H[j]) > 0 && !valgtLengde?.(H[j])) j++;
    const n = j - i;
    const slutt = H[i] + n * 30;
    if (n === 1 && !valgtDekker?.(H[i] - 30) && !valgtDekker?.(slutt)) {
      leggOpptatt(rader, H[i], slutt, 'Bare 30 min ledig');
      i = j;
      continue;
    }
    let s = H[i];
    if (n % 2 === 1 && s % 60 === 30) { rader.push({ type: 'ledig', start: s, lengde: 30 }); s += 30; }
    for (; s + 60 <= slutt; s += 60) rader.push({ type: 'ledig', start: s, lengde: 60 });
    if (s < slutt) rader.push({ type: 'ledig', start: s, lengde: 30 });
    i = j;
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
  // Ledige halvdeler per halvtime: 2 = hel bane ledig, 1 = bare halv bane.
  const halvKap = (d: string, start: number) => (belegg && na ? halvslot(d, start, belegg, na).ledigeHalvdeler : 0);
  const intervallKap = (d: string, start: number, lengde: number) => (belegg && na ? ledigIntervall(d, start, lengde, belegg, na) : 0);
  const antallLedige = (d: string) => HALVTIMER.filter(s => halvKap(d, s) > 0).length;

  // Faste tider. Ukemønsteret (klubbtidene, uten enkeltdager som er frigitt)
  // gir de ledige tidsrommene for hver ukedag, delt inn på samme måte som en
  // enkeltdag. For hvert tidsrom telles ukene der hel og halv bane er ledig.
  // Bare tider som er ledige minst halvparten av ukene, er faste tider; resten
  // finnes under Enkelttimer.
  const faste = useMemo(() => {
    const ut = new Map<number, { rader: Rad[]; data: Map<number, Fast> }>();
    if (!belegg || !na) return ut;
    for (let d = 1; d <= 7; d++) {
      const monster = (s: number) => 2 - Math.min(2, belegg.klubbtider
        .filter(k => k.dag === d && minutter(k.fra) <= s && minutter(k.til) > s)
        .reduce((n, k) => n + halvdeler(k.bane), 0));
      const dager = ALLE_DATOER.filter(x => ukedag(x) === d);
      const rader: Rad[] = [];
      const data = new Map<number, Fast>();
      for (const r of delInn(monster, () => 'Opptatt')) {
        if (r.type === 'opptatt') { leggOpptatt(rader, r.fra, r.til, r.tekst); continue; }
        const kommende = dager.filter(x => !['passert', 'utenfor'].includes(halvslot(x, r.start, belegg, na).tilstand));
        const halv = kommende.filter(x => ledigIntervall(x, r.start, r.lengde, belegg, na) >= 1);
        const hel = kommende.filter(x => ledigIntervall(x, r.start, r.lengde, belegg, na) === 2);
        if (halv.length >= 2 && halv.length * 2 >= kommende.length) {
          rader.push(r);
          data.set(r.start, { start: r.start, lengde: r.lengde, hel, halv, kommende });
        } else {
          leggOpptatt(rader, r.start, r.start + r.lengde, 'Ikke ledig hver uke');
        }
      }
      ut.set(d, { rader, data });
    }
    return ut;
  }, [belegg, na]);

  const sum = valgt.reduce((s, v) => s + prisFor(v.bane, v.dato, v.lengde), 0);
  const valgtPaa = (d: string, start: number, lengde: number) =>
    valgt.find(v => v.dato === d && startAv(v) === start && v.lengde === lengde);

  // Samme knapp igjen fjerner tida, den andre banestørrelsen bytter.
  // Et nytt valg erstatter det som overlapper samme tid.
  function velg(d: string, start: number, lengde: number, bane: Bane) {
    setValgt(prev => {
      const ny = lagValg(d, start, lengde, bane);
      const lik = prev.find(v => v.dato === d && startAv(v) === start && v.lengde === lengde);
      const uten = prev.filter(v => !overlapper(v, ny));
      return ryddHalvtimer(lik?.bane === bane ? uten : [...uten, ny]);
    });
  }

  function velgFast(ds: string[], start: number, lengde: number, bane: Bane) {
    setValgt(prev => {
      const alle = ds.every(d => prev.some(v => v.dato === d && startAv(v) === start && v.lengde === lengde && v.bane === bane));
      const dag = ukedag(ds[0]);
      const uten = prev.filter(v => !(ukedag(v.dato) === dag && startAv(v) < start + lengde && start < startAv(v) + v.lengde));
      return ryddHalvtimer(alle ? uten : [...uten, ...ds.map(d => lagValg(d, start, lengde, bane))]);
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
  // ellers nærmeste ledige tid samme dag med samme lengde og banestørrelse.
  function alternativ(d: string, start: number, lengde: number, b: Bane): { start: number; bane: Bane } | null {
    if (b === 'hel' && intervallKap(d, start, lengde) >= 1) return { start, bane: 'halv' };
    for (const dt of [60, -60, 30, -30, 120, -120]) {
      const s = start + dt;
      if (HALVTIMER.includes(s) && s + lengde <= HALVTIMER[HALVTIMER.length - 1] + 30 && intervallKap(d, s, lengde) >= halvdeler(b)) {
        return { start: s, bane: b };
      }
    }
    return null;
  }

  function blaUke(delta: number) {
    setRetning(delta > 0 ? 'fwd' : 'back');
    const ny = datoer(leggTilDager(mandag, 7 * delta), leggTilDager(mandag, 7 * delta + 6))
      .filter(d => d >= iDag && d >= SESONG.fra && d <= SESONG.til);
    setDag(ny.find(d => antallLedige(d) > 0) ?? ny[0] ?? dag);
  }

  const fastDato = ALLE_DATOER.find(x => ukedag(x) === fastDag)!;
  const fastDag_ = faste.get(fastDag);

  // Enkelttimer: ledig tid delt i timer fra der den starter, og en halvtime
  // til slutt hvis det er det som er igjen. Valgte tider beholder sin lengde.
  const grunn = (d: string) => (s: number) => {
    if (!belegg || !na) return 'Opptatt';
    const h = halvslot(d, s, belegg, na);
    return h.tilstand === 'stengt' ? h.tekst ?? 'Stengt' : h.tilstand === 'passert' ? 'Passert' : 'Opptatt';
  };
  const rader = visning === 'enkelt'
    ? delInn(s => halvKap(dag, s), grunn(dag), s => valgt.find(v => v.dato === dag && startAv(v) === s)?.lengde,
      s => valgt.some(v => v.dato === dag && startAv(v) <= s && s < startAv(v) + v.lengde))
    : fastDag_?.rader ?? [];

  return (
    <Ramme>
      {demo && <p className="melding">Demo: bestillinger lagres ikke permanent.</p>}
      {lastFeil && <p className="melding feil">{lastFeil} <button className="lenke" onClick={last}>Prøv igjen</button></p>}
      {tatt && <p className="melding feil">{tatt} <button className="lenke" onClick={() => setTatt(null)}>OK</button></p>}

      <div className="visning" role="tablist">
        <button role="tab" aria-selected={visning === 'enkelt'} className={visning === 'enkelt' ? 'aktiv' : ''} onClick={() => setVisning('enkelt')}>Enkelttimer</button>
        <button role="tab" aria-selected={visning === 'fast'} className={visning === 'fast' ? 'aktiv' : ''} onClick={() => setVisning('fast')}>Fast hver uke</button>
      </div>
      <p className="hjelp">
        {visning === 'enkelt'
          ? 'Velg dag og tid. Minst 1 time; en halvtime kan legges til rett før eller etter.'
          : 'Samme tid hver uke ut sesongen. Uker der tida er opptatt, får du forslag til en annen tid.'}
      </p>

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
            </>
          ) : (
            <div className="dagstripe">
              {DAGER.map((n, i) => {
                const d = i + 1;
                const har = (faste.get(d)?.data.size ?? 0) > 0;
                return (
                  <button key={n} className={`dagbrikke ${d === fastDag ? 'valgt' : ''} ${d >= 6 ? 'helg' : ''}`}
                    disabled={!har} onClick={() => setFastDag(d)}>
                    <span className="dagbrikke-dato">{n}</span>
                    {valgt.some(v => ukedag(v.dato) === d) && <span className="prikk" />}
                  </button>
                );
              })}
            </div>
          )}

          <h2 className="valgt-dag">{visning === 'enkelt' ? langDato(dag) : `${stor(dagnavn(fastDato))}er resten av sesongen`}</h2>

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
              const { start, lengde } = r;
              // En halvtime kan bare velges når tida rett før eller etter er valgt.
              const vedSiden = (datoer: string[]) => valgt.some(v => datoer.includes(v.dato)
                && (startAv(v) + v.lengde === start || startAv(v) === start + lengde));
              const under = lengde === 30 ? 'Bare som tillegg til en time' : undefined;
              if (visning === 'fast') {
                const f = fastDag_!.data.get(start)!;
                const valgtBane = (['hel', 'halv'] as Bane[]).find(b => {
                  const ds = b === 'hel' ? f.hel : f.halv;
                  return ds.length > 0 && ds.every(x => valgtPaa(x, start, lengde)?.bane === b);
                });
                const ikke = valgtBane ? f.kommende.filter(x => !(valgtBane === 'hel' ? f.hel : f.halv).includes(x)) : [];
                // Forleng den faste tida med en halvtime de ukene halvtimen er ledig.
                const valgteUker = valgtBane ? (valgtBane === 'hel' ? f.hel : f.halv) : [];
                const forlengFast = (s: number) => valgteUker.filter(x => intervallKap(x, s, 30) >= halvdeler(valgtBane!)
                  && !valgt.some(v => v.dato === x && startAv(v) <= s && s < startAv(v) + v.lengde));
                const for_ = lengde === 60 && valgtBane ? forlengFast(start - 30) : [];
                const etter = lengde === 60 && valgtBane ? forlengFast(start + 60) : [];
                // Halvtimer som alt er lagt til, vises på raden og kan tas bort igjen.
                const lagtTil = (s: number) => {
                  const uker = valgteUker.filter(x => valgtPaa(x, s, 30));
                  return uker.length * 2 >= valgteUker.length ? uker : [];
                };
                const harFor = lagtTil(start - 30);
                const harEtter = lagtTil(start + 60);
                const lenker = [
                  ...(harFor.length ? [{ tekst: '− 30 min før', onClick: () => velgFast(harFor, start - 30, 30, valgtBane!) }]
                    : for_.length > 0 && for_.length * 2 >= valgteUker.length ? [{ tekst: '+30 min før', onClick: () => velgFast(for_, start - 30, 30, valgtBane!) }] : []),
                  ...(harEtter.length ? [{ tekst: '− 30 min etter', onClick: () => velgFast(harEtter, start + 60, 30, valgtBane!) }]
                    : etter.length > 0 && etter.length * 2 >= valgteUker.length ? [{ tekst: '+30 min etter', onClick: () => velgFast(etter, start + 60, 30, valgtBane!) }] : []),
                ];
                const visFra = harFor.length ? start - 30 : start;
                const visTil = start + lengde + (harEtter.length ? 30 : 0);
                const uker = `Ledig ${f.halv.length} av ${f.kommende.length} uker`;
                return (
                  <Fragment key={start}>
                    <Tidsrad tid={tidKort(visFra, visTil)} dato={fastDato} lengde={lengde} lenker={lenker}
                      under={[under, f.hel.length >= 2 && f.hel.length < f.halv.length ? `${uker} · hel bane ${f.hel.length}` : uker].filter(Boolean).join(' · ')}
                      lukket={lengde === 30 && !valgtBane && !vedSiden(f.kommende)}
                      kanHel={f.hel.length >= 2} valgt={valgtBane}
                      onVelg={b => velgFast(b === 'hel' ? f.hel : f.halv, start, lengde, b)} />
                    {ikke.length > 0 && (
                      <div className="tl-avvik">
                        {ikke.map(x => {
                          const a = alternativ(x, start, lengde, valgtBane!);
                          const stengt = belegg && na ? halvslot(x, start, belegg, na).tilstand === 'stengt' : false;
                          const pa = a ? valgtPaa(x, a.start, lengde)?.bane === a.bane : false;
                          return (
                            <div key={x} className="avvik-rad">
                              <span>{dagOgManed(x, true)} {stengt ? 'stengt' : 'opptatt'}</span>
                              {a && !stengt ? (
                                <button className={pa ? 'pa' : ''} aria-pressed={pa} onClick={() => velg(x, a.start, lengde, a.bane)}>
                                  {pa && <Check size={13} />} {a.start === start ? 'Halv bane' : tidKort(a.start, a.start + lengde)}{a.start !== start && a.bane === 'halv' ? ' halv' : ''} <small>{kr(prisFor(a.bane, x, lengde))}</small>
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
              const mitt = valgtPaa(dag, start, lengde);
              // En valgt time kan forlenges med en halvtime før eller etter, når den er ledig.
              const forleng = (d: string, s: number, bane: Bane) =>
                halvKap(d, s) >= halvdeler(bane) && !valgt.some(v => v.dato === d && startAv(v) <= s && s < startAv(v) + v.lengde);
              const lenker = mitt && lengde === 60 ? [
                ...(forleng(dag, start - 30, mitt.bane) ? [{ tekst: '+30 min før', onClick: () => velg(dag, start - 30, 30, mitt.bane) }] : []),
                ...(forleng(dag, start + 60, mitt.bane) ? [{ tekst: '+30 min etter', onClick: () => velg(dag, start + 60, 30, mitt.bane) }] : []),
              ] : [];
              return (
                <Tidsrad key={start} tid={tidKort(start, start + lengde)} under={under} dato={dag} lengde={lengde} lenker={lenker}
                  lukket={lengde === 30 && !mitt && !vedSiden([dag])}
                  kanHel={intervallKap(dag, start, lengde) === 2 || mitt?.bane === 'hel'}
                  valgt={mitt?.bane} onVelg={b => velg(dag, start, lengde, b)} />
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
// pris til høyre. `lenker` er små valg under tida, som «+30 min etter».
function Tidsrad({ tid, under, dato, lengde = 60, kanHel, valgt, onVelg, lenker = [], lukket }: {
  tid: string;
  under?: string;
  dato: string;
  lengde?: number;
  lukket?: boolean;
  kanHel: boolean;
  valgt?: Bane;
  onVelg: (b: Bane) => void;
  lenker?: { tekst: string; onClick: () => void }[];
}) {
  const prisFor = usePris();
  return (
    <div className={`tl-ledig ${valgt ? 'valgt' : ''} ${lukket ? 'lukket' : ''}`}>
      <span className="tl-tid">
        {tid}
        {under && <small>{under}</small>}
        {lenker.length > 0 && (
          <span className="tl-lenker">
            {lenker.map(l => <button key={l.tekst} type="button" className="tl-del" onClick={l.onClick}>{l.tekst}</button>)}
          </span>
        )}
      </span>
      <span className="tl-valg">
        {(['hel', 'halv'] as Bane[]).map(b => (b === 'hel' && !kanHel) ? null : (
          <button key={b} aria-pressed={valgt === b} disabled={lukket} className={valgt === b ? 'pa' : ''} onClick={() => onVelg(b)}>
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
