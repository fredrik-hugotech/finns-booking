'use client';

import { Fragment, useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Repeat, X, Check, Clock, Sun, Moon, CalendarDays, Info, Loader2, ArrowLeft,
} from 'lucide-react';
import { ARENA, PRIS, SESONG } from '@/lib/config';
import {
  TIMER, halvdeler, nokkel, prisFor, slot, type Bane, type Belegg, type Slot,
} from '@/lib/tilgjengelighet';
import {
  dagOgManed, dagnavn, datoer, kr, langDato, leggTilDager, mandagI, tidsrom, ukenummer,
} from '@/lib/dato';
import { Retningslinjer } from './Retningslinjer';

type Valgt = { dato: string; time: number; bane: Bane };
type Filter = 'alle' | 'dag' | 'kveld';
type Kvittering = { ref: string; antall: number; sum: number; linjer: Valgt[] };

const vKey = (v: { dato: string; time: number }) => nokkel(v.dato, v.time);

export function BookingClient() {
  const [belegg, setBelegg] = useState<Belegg | null>(null);
  const [na, setNa] = useState<{ dato: string; time: number } | null>(null);
  const [demo, setDemo] = useState(false);
  const [lastFeil, setLastFeil] = useState<string | null>(null);

  const [dag, setDag] = useState<string>(SESONG.fra);
  const [filter, setFilter] = useState<Filter>('alle');
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
      return j.na as { dato: string; time: number };
    } catch {
      setLastFeil('Kunne ikke hente ledige tider. Sjekk nettet og prøv igjen.');
      return null;
    }
  }

  useEffect(() => {
    last().then(n => {
      if (n && n.dato > SESONG.fra && n.dato <= SESONG.til) setDag(n.dato);
    });
  }, []);

  const slotFor = (d: string, t: number): Slot =>
    belegg && na ? slot(d, t, belegg, na) : { dato: d, time: t, tilstand: 'utenfor', ledigeHalvdeler: 0 };

  const ledigeTimer = (d: string) => TIMER.filter(t => slotFor(d, t).ledigeHalvdeler > 0).length;

  const sum = valgt.reduce((s, v) => s + prisFor(v.bane, v.dato), 0);

  function velg(d: string, t: number, bane: Bane) {
    setValgt(prev => {
      const finnes = prev.find(v => v.dato === d && v.time === t);
      if (finnes?.bane === bane) return prev.filter(v => v !== finnes);
      const uten = prev.filter(v => v !== finnes);
      return [...uten, { dato: d, time: t, bane }].sort((a, b) => vKey(a).localeCompare(vKey(b)));
    });
  }

  // Legger til samme tid og banestørrelse alle kommende uker i sesongen der
  // det er ledig.
  function hverUke(v: Valgt) {
    if (!belegg || !na) return;
    const nye: Valgt[] = [];
    for (let d = leggTilDager(v.dato, 7); d <= SESONG.til; d = leggTilDager(d, 7)) {
      if (valgt.some(x => x.dato === d && x.time === v.time)) continue;
      if (slot(d, v.time, belegg, na).ledigeHalvdeler >= halvdeler(v.bane)) nye.push({ ...v, dato: d });
    }
    setValgt(prev => [...prev, ...nye].sort((a, b) => vKey(a).localeCompare(vKey(b))));
  }

  function ukerIgjen(v: Valgt) {
    let ledige = 0;
    let opptatt = 0;
    if (!belegg || !na) return { ledige, opptatt };
    for (let d = leggTilDager(v.dato, 7); d <= SESONG.til; d = leggTilDager(d, 7)) {
      if (valgt.some(x => x.dato === d && x.time === v.time)) continue;
      if (slot(d, v.time, belegg, na).ledigeHalvdeler >= halvdeler(v.bane)) ledige++;
      else opptatt++;
    }
    return { ledige, opptatt };
  }

  if (kvittering) {
    return <Bekreftelse k={kvittering} onNy={() => { setKvittering(null); setValgt([]); setSteg('velg'); last(); }} />;
  }

  const uke = datoer(mandagI(dag), leggTilDager(mandagI(dag), 6));
  const forrigeUke = leggTilDager(mandagI(dag), -7);
  const nesteUke = leggTilDager(mandagI(dag), 7);
  const timerVist = TIMER.filter(t => filter === 'alle' || (filter === 'dag' ? t < 17 : t >= 17));

  return (
    <div className="side">
      <Topp />

      {demo && (
        <div className="banner">
          <Info size={16} /> Demo-modus: bestillinger lagres bare midlertidig til databasen er koblet til.
        </div>
      )}
      {lastFeil && (
        <div className="banner feil">
          {lastFeil} <button className="lenke" onClick={() => last()}>Prøv igjen</button>
        </div>
      )}

      {steg === 'velg' ? (
        <div className="oppsett">
          <main className="hoved">
            <section className="kort">
              <div className="kort-topp">
                <h2><CalendarDays size={18} /> Sesongen på ett blikk</h2>
                <span className="dempet">Mørkere grønn = flere ledige timer</span>
              </div>
              <Sesongkart
                dagerMedLedig={belegg ? ledigeTimer : null}
                valgtDag={dag}
                naDato={na?.dato}
                onVelg={setDag}
              />
            </section>

            <section className="kort">
              <div className="ukevelger">
                <button className="ikonknapp" aria-label="Forrige uke" disabled={leggTilDager(forrigeUke, 6) < SESONG.fra}
                  onClick={() => setDag(forrigeUke < SESONG.fra ? SESONG.fra : forrigeUke)}>
                  <ChevronLeft size={20} />
                </button>
                <div className="uketittel">
                  <strong>Uke {ukenummer(dag)}</strong>
                  <span className="dempet">{dagOgManed(uke[0])} – {dagOgManed(uke[6])}</span>
                </div>
                <button className="ikonknapp" aria-label="Neste uke" disabled={nesteUke > SESONG.til}
                  onClick={() => setDag(nesteUke)}>
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="dagstripe">
                {uke.map(d => {
                  const utenfor = d < SESONG.fra || d > SESONG.til;
                  const n = belegg && !utenfor ? ledigeTimer(d) : 0;
                  const antallValgt = valgt.filter(v => v.dato === d).length;
                  return (
                    <button key={d} className={`dag ${d === dag ? 'aktiv' : ''}`} disabled={utenfor} onClick={() => setDag(d)}>
                      <span className="dag-navn">{dagnavn(d, true)}</span>
                      <span className="dag-nr">{Number(d.slice(8))}</span>
                      <span className={`dag-ledig ${n === 0 ? 'null' : ''}`}>{utenfor ? '–' : belegg ? `${n} ledig` : '…'}</span>
                      {antallValgt > 0 && <span className="prikk" aria-label={`${antallValgt} valgt`}>{antallValgt}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="dagtopp">
                <h2>{langDato(dag)}</h2>
                <div className="filter" role="group" aria-label="Tid på døgnet">
                  <button className={filter === 'alle' ? 'på' : ''} onClick={() => setFilter('alle')}><Clock size={14} /> Alle</button>
                  <button className={filter === 'dag' ? 'på' : ''} onClick={() => setFilter('dag')}><Sun size={14} /> Dag</button>
                  <button className={filter === 'kveld' ? 'på' : ''} onClick={() => setFilter('kveld')}><Moon size={14} /> Kveld</button>
                </div>
              </div>

              {!belegg ? (
                <div className="laster"><Loader2 className="spinn" size={20} /> Henter ledige tider …</div>
              ) : (
                <ul className="timeliste">
                  {timerVist.map(t => {
                    const s = slotFor(dag, t);
                    const mitt = valgt.find(v => v.dato === dag && v.time === t);
                    // Belegget teller ikke med eget valg, så hel/halv kan byttes fritt.
                    const kap = s.ledigeHalvdeler;
                    const kanVelge = kap > 0;
                    return (
                      <li key={t} className={`time ${s.tilstand} ${mitt ? 'valgt' : ''}`}>
                        <div className="time-tid">
                          {tidsrom(t)}
                          {s.tilstand === 'halv' && !mitt && <span className="merke">Halv bane ledig</span>}
                        </div>
                        {kanVelge ? (
                          <div className="time-valg">
                            <button className={`banevalg ${mitt?.bane === 'halv' ? 'på' : ''}`} onClick={() => velg(dag, t, 'halv')}>
                              {mitt?.bane === 'halv' && <Check size={14} />} Halv <span>{kr(prisFor('halv', dag))}</span>
                            </button>
                            <button className={`banevalg ${mitt?.bane === 'hel' ? 'på' : ''}`} disabled={kap < 2} onClick={() => velg(dag, t, 'hel')}>
                              {mitt?.bane === 'hel' && <Check size={14} />} Hel <span>{kr(prisFor('hel', dag))}</span>
                            </button>
                          </div>
                        ) : (
                          <div className="time-info">{beskrivelse(s)}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </main>

          <aside className="kurv kort">
            <Kurv valgt={valgt} sum={sum} onFjern={v => setValgt(p => p.filter(x => x !== v))} onHverUke={hverUke} ukerIgjen={ukerIgjen}
              onTom={() => setValgt([])} onVidere={() => setSteg('skjema')} />
          </aside>

          {valgt.length > 0 && (
            <div className="bunnlinje">
              <div>
                <strong>{valgt.length} {valgt.length === 1 ? 'time' : 'timer'}</strong>
                <span>{kr(sum)}</span>
              </div>
              <button className="knapp" onClick={() => setSteg('skjema')}>Gå videre</button>
            </div>
          )}
        </div>
      ) : (
        <Skjema valgt={valgt} sum={sum} onTilbake={() => setSteg('velg')}
          onFerdig={k => setKvittering(k)} onOpptatt={() => last()} />
      )}

      <footer className="fot">
        <p>{ARENA.arrangor} · {ARENA.navn}, {ARENA.sted} · {SESONG.navn}</p>
      </footer>
    </div>
  );
}

function beskrivelse(s: Slot): string {
  switch (s.tilstand) {
    case 'passert': return 'Passert';
    case 'stengt': return `Stengt${s.tekst ? ` · ${s.tekst}` : ''}`;
    case 'utenfor': return 'Utenfor sesongen';
    default: return s.tekst ?? 'Opptatt';
  }
}

function Topp() {
  return (
    <header className="topp">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Finns.Fairway" className="logo" />
      <div>
        <p className="overtittel">Vinteråpen arena</p>
        <h1>{ARENA.navn}</h1>
        <p className="dempet">Book ledige timer {dagOgManed(SESONG.fra)} – {dagOgManed(SESONG.til)} · 08–23</p>
      </div>
    </header>
  );
}

function Sesongkart({ dagerMedLedig, valgtDag, naDato, onVelg }: {
  dagerMedLedig: ((d: string) => number) | null;
  valgtDag: string;
  naDato?: string;
  onVelg: (d: string) => void;
}) {
  const uker: string[][] = [];
  for (let m = mandagI(SESONG.fra); m <= SESONG.til; m = leggTilDager(m, 7)) {
    uker.push(datoer(m, leggTilDager(m, 6)));
  }
  const maks = TIMER.length;
  const dagbokstav = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];
  return (
    <div className="sesongkart" style={{ gridTemplateColumns: `16px repeat(${uker.length}, minmax(14px, 1fr))` }}>
      <span />
      {uker.map(u => <span key={u[0]} className="sk-uke">{ukenummer(u[0])}</span>)}
      {dagbokstav.map((b, i) => (
        <Fragment key={i}>
          <span className="sk-dag">{b}</span>
          {uker.map(u => {
            const d = u[i];
            const ute = d < SESONG.fra || d > SESONG.til;
            const forbi = !!naDato && d < naDato;
            const n = dagerMedLedig && !ute ? dagerMedLedig(d) : 0;
            const niva = ute ? 'ute' : forbi ? 'forbi' : n === 0 ? 'n0' : `n${Math.ceil((n / maks) * 4)}`;
            return (
              <button
                key={d}
                className={`sk-celle ${niva} ${d === valgtDag ? 'aktiv' : ''}`}
                disabled={ute}
                title={ute ? undefined : `${langDato(d)}: ${n} ledige timer`}
                aria-label={ute ? undefined : `${langDato(d)}, ${n} ledige timer`}
                onClick={() => onVelg(d)}
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function Kurv({ valgt, sum, onFjern, onHverUke, ukerIgjen, onTom, onVidere }: {
  valgt: Valgt[];
  sum: number;
  onFjern: (v: Valgt) => void;
  onHverUke: (v: Valgt) => void;
  ukerIgjen: (v: Valgt) => { ledige: number; opptatt: number };
  onTom: () => void;
  onVidere: () => void;
}) {
  if (valgt.length === 0) {
    return (
      <div className="kurv-tom">
        <h2>Din bestilling</h2>
        <p className="dempet">Velg halv eller hel bane på en ledig time. Du kan velge flere timer og dager.</p>
        <ul className="prisliste">
          <li><span>Hel bane</span><strong>{kr(PRIS.ukedag.hel)} / {kr(PRIS.helg.hel)}</strong></li>
          <li><span>Halv bane</span><strong>{kr(PRIS.ukedag.halv)} / {kr(PRIS.helg.halv)}</strong></li>
        </ul>
        <p className="dempet prisnote">Per time, ukedag / helg.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="kort-topp">
        <h2>Din bestilling</h2>
        <button className="lenke" onClick={onTom}>Tøm</button>
      </div>
      <ul className="valgte">
        {valgt.map(v => {
          const { ledige, opptatt } = ukerIgjen(v);
          return (
            <li key={vKey(v)}>
              <div>
                <strong>{langDato(v.dato)}</strong>
                <span className="dempet">{tidsrom(v.time)} · {v.bane === 'hel' ? 'Hel bane' : 'Halv bane'} · {kr(prisFor(v.bane, v.dato))}</span>
                {ledige > 0 && (
                  <button className="hverUke" onClick={() => onHverUke(v)}>
                    <Repeat size={13} /> Samme tid hver uke ut sesongen (+{ledige}{opptatt ? `, ${opptatt} opptatt` : ''})
                  </button>
                )}
              </div>
              <button className="ikonknapp liten" aria-label="Fjern" onClick={() => onFjern(v)}><X size={16} /></button>
            </li>
          );
        })}
      </ul>
      <div className="sum">
        <span>{valgt.length} {valgt.length === 1 ? 'time' : 'timer'}</span>
        <strong>{kr(sum)}</strong>
      </div>
      <button className="knapp full" onClick={onVidere}>Gå videre</button>
    </div>
  );
}

function Skjema({ valgt, sum, onTilbake, onFerdig, onOpptatt }: {
  valgt: Valgt[];
  sum: number;
  onTilbake: () => void;
  onFerdig: (k: Kvittering) => void;
  onOpptatt: () => void;
}) {
  const [f, setF] = useState({ navn: '', telefon: '', epost: '', klubb: '', kommentar: '' });
  const [godtatt, setGodtatt] = useState(false);
  const [sender, setSender] = useState(false);
  const [feil, setFeil] = useState<{ tekst: string; opptatt?: string[] } | null>(null);
  const serie = new Set(valgt.map(v => `${v.time}|${v.bane}`)).size < valgt.length;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!godtatt) {
      setFeil({ tekst: 'Du må godta retningslinjene for bruk av arenaen.' });
      return;
    }
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
    <div className="oppsett smal">
      <form className="kort skjema" onSubmit={send}>
        <button type="button" className="lenke tilbake" onClick={onTilbake}><ArrowLeft size={16} /> Endre timer</button>
        <h2>Dine opplysninger</h2>
        <label>Navn<input required autoComplete="name" {...felt('navn')} /></label>
        <div className="to">
          <label>Telefon<input required type="tel" autoComplete="tel" inputMode="tel" {...felt('telefon')} /></label>
          <label>E-post<input required type="email" autoComplete="email" {...felt('epost')} /></label>
        </div>
        <label>Klubb eller lag <span className="dempet">(valgfritt)</span><input {...felt('klubb')} /></label>
        <label>Kommentar <span className="dempet">(valgfritt)</span><textarea rows={3} {...felt('kommentar')} /></label>

        <details className="regler">
          <summary>Retningslinjer for bruk av arenaen</summary>
          <Retningslinjer />
        </details>
        <label className="avkryss">
          <input type="checkbox" checked={godtatt} onChange={e => setGodtatt(e.target.checked)} />
          Jeg har lest og godtar retningslinjene
        </label>

        <div className="oppsummering">
          <div className="sum"><span>{valgt.length} {valgt.length === 1 ? 'time' : 'timer'}</span><strong>{kr(sum)}</strong></div>
          <p className="dempet">Bestillingen sendes som en forespørsel. Finns.Fairway bekrefter, og den blir bindende når betalingen er mottatt.</p>
        </div>

        {feil && (
          <div className="banner feil">
            <div>
              {feil.tekst}
              {feil.opptatt && <ul>{feil.opptatt.map(o => <li key={o}>{o}</li>)}</ul>}
            </div>
          </div>
        )}
        <button className="knapp full" disabled={sender}>
          {sender ? <><Loader2 className="spinn" size={16} /> Sender …</> : `Send bestilling · ${kr(sum)}`}
        </button>
      </form>
    </div>
  );
}

function Bekreftelse({ k, onNy }: { k: Kvittering; onNy: () => void }) {
  // Samme ukedag, tid og bane slås sammen, så en sesongbooking blir én linje.
  const grupper = new Map<string, Valgt[]>();
  for (const l of k.linjer) {
    const g = `${dagnavn(l.dato)}|${l.time}|${l.bane}`;
    grupper.set(g, [...(grupper.get(g) ?? []), l]);
  }
  return (
    <div className="side">
      <Topp />
      <div className="oppsett smal">
        <section className="kort kvittering">
          <div className="hake"><Check size={28} /></div>
          <h2>Takk! Forespørselen er sendt.</h2>
          <p>Referanse: <strong className="ref">{k.ref}</strong></p>
          <p className="dempet">Finns.Fairway går gjennom bestillingen og bekrefter den. Den blir bindende når betalingen er mottatt.</p>

          <ul className="valgte kompakt">
            {[...grupper.values()].map(ls => {
              const f = ls[0];
              const bane = f.bane === 'hel' ? 'hel bane' : 'halv bane';
              return (
                <li key={vKey(f)}>
                  <strong>
                    {ls.length === 1 ? langDato(f.dato) : `${dagnavn(f.dato).replace(/^./, c => c.toUpperCase())}er · ${ls.length} ganger`}
                  </strong>
                  <span className="dempet">
                    {tidsrom(f.time)} · {bane}
                    {ls.length > 1 && ` · ${dagOgManed(f.dato, true)} – ${dagOgManed(ls[ls.length - 1].dato, true)}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="sum"><span>{k.antall} {k.antall === 1 ? 'time' : 'timer'}</span><strong>{kr(k.sum)}</strong></div>

          <div className="vipps">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vipps-qr.png" alt="Vipps QR-kode til Finns.Fairway" width={140} height={140} />
            <div>
              <h3>Betal med Vipps</h3>
              <p className="dempet">Skann koden og merk betalingen med <strong>{k.ref}</strong>.</p>
            </div>
          </div>
          <button className="knapp full sekundar" onClick={onNy}>Book flere timer</button>
        </section>
      </div>
    </div>
  );
}
