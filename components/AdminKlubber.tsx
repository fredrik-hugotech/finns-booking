'use client';

import { useMemo, useState } from 'react';
import { Mail, MessageSquare, Pencil, Phone, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { FORSTE_TIME, SISTE_TIME, STENGTE_DAGER } from '@/lib/config';
import {
  klubbNavn, type Bane, type Bestilling, type Klubbtid, type Sperring,
} from '@/lib/tilgjengelighet';
import { dagOgManed, datoer, langDato, leggTilDager, minutter, naIOslo, ukedag } from '@/lib/dato';
import type { Api } from './AdminClient';

export const UKEDAGER = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const KLOKKESLETT = Array.from({ length: (SISTE_TIME + 1 - FORSTE_TIME) * 2 + 1 }, (_, i) => {
  const m = FORSTE_TIME * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`;
});
const tid = (k: Pick<Klubbtid, 'fra' | 'til'>) => `${k.fra}–${k.til}`;
const timerPerUke = (ks: Klubbtid[]) => ks.reduce((s, k) => s + (minutter(k.til) - minutter(k.fra)) / 60 * (k.bane === 'halv' ? 0.5 : 1), 0);
const tall = (n: number) => n.toLocaleString('nb-NO', { maximumFractionDigits: 1 });

// Fast farge per klubb, så de er lette å kjenne igjen i ukeoversikten.
const FARGER: Record<string, string> = {
  'IK Start': 'gul', 'Donn': 'bla', 'IK Gimletroll': 'lilla', 'Akademiet': 'turkis', 'Gatelag': 'rosa', 'Finns.Fairway': 'gronn', 'KKG': 'oransje',
};
const RESERVE = ['oliven', 'stein'];
export function klubbFarge(klubb: string) {
  if (FARGER[klubb]) return FARGER[klubb];
  let h = 0;
  for (const c of klubb) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return RESERVE[h % RESERVE.length];
}

export function KlubbKontakt({ k }: { k: Klubbtid }) {
  const tlf = (k.telefon ?? '').replace(/\s/g, '');
  const emne = `Treningstid ${UKEDAGER[k.dag - 1].toLowerCase()} ${tid(k)} – Sparebanken Norge Arena`;
  return (
    <span className="kontaktknapper">
      {tlf && <a href={`tel:${tlf}`} title={`Ring ${k.kontakt ?? k.telefon}`}><Phone size={15} /></a>}
      {tlf && <a href={`sms:${tlf}`} title="Send SMS"><MessageSquare size={15} /></a>}
      {k.epost && <a href={`mailto:${k.epost}?subject=${encodeURIComponent(emne)}`} title={`E-post til ${k.epost}`}><Mail size={15} /></a>}
    </span>
  );
}

// Klubbtid i dagsvisningen: hvem, nøyaktig tid, kontakt, og frigi for én dag.
export function Klubbrad({ k, dato, alle, api }: { k: Klubbtid; dato: string; alle: Klubbtid[]; api: Api }) {
  const [rediger, setRediger] = useState(false);
  const frigitt = k.unntak.includes(dato);
  const settUnntak = (unntak: string[], ok: string) => api('POST', '/api/admin/klubbtider', { ...k, unntak }, ok);
  return (
    <div className={`adm-rad klubbrad farge-${klubbFarge(k.klubb)} ${frigitt ? 'frigitt' : ''}`}>
      <div className="adm-rad-hode">
        <span className="adm-tid">{tid(k)}</span>
        {k.bane === 'halv' && <span className="merkelapp">Halv</span>}
        <span className="adm-navn">
          <strong>{k.klubb}{k.lag ? ` · ${k.lag}` : ''}</strong>
          {k.kontakt && <span className="dempet">{k.kontakt}{k.telefon ? ` · ${k.telefon}` : ''}</span>}
        </span>
        <span className="status klubb">{frigitt ? 'Frigitt' : 'Fast tid'}</span>
        <KlubbKontakt k={k} />
      </div>
      <div className="adm-handlinger">
        {frigitt ? (
          <button className="liten-knapp" onClick={() => settUnntak(k.unntak.filter(d => d !== dato), 'Gitt tilbake til klubben.')}>
            <RotateCcw size={14} /> Gi tilbake
          </button>
        ) : (
          <button className="liten-knapp" onClick={() => {
            if (window.confirm(`Frigi ${tid(k)} ${langDato(dato)} fra ${klubbNavn(k)}? Tida kan da bookes av andre.`)) {
              settUnntak([...k.unntak, dato], 'Frigitt. Tida kan bookes.');
            }
          }}>Frigi denne dagen</button>
        )}
        <button className="liten-knapp" onClick={() => setRediger(v => !v)}><Pencil size={14} /> {rediger ? 'Lukk' : 'Endre fast tid'}</button>
      </div>
      {rediger && <KlubbtidSkjema k={k} alle={alle} api={api} onFerdig={() => setRediger(false)} />}
    </div>
  );
}

type Utkast = Omit<Klubbtid, 'id'> & { id?: string };
const TOM: Utkast = { dag: 1, fra: '17:00', til: '18:30', bane: 'hel', klubb: '', lag: null, kontakt: null, telefon: null, epost: null, unntak: [] };

export function KlubbtidSkjema({ k, alle, api, onFerdig }: { k?: Klubbtid; alle: Klubbtid[]; api: Api; onFerdig: () => void }) {
  const [f, setF] = useState<Utkast>(k ?? TOM);
  const [kontaktForAlle, setKontaktForAlle] = useState(false);
  const [lagrer, setLagrer] = useState(false);
  const klubber = useMemo(() => [...new Set(alle.map(x => x.klubb))].sort(), [alle]);
  const sammeLag = alle.filter(x => x.id !== k?.id && x.klubb === f.klubb && (x.lag ?? '') === (f.lag ?? ''));

  async function lagre(e: React.FormEvent) {
    e.preventDefault();
    setLagrer(true);
    let ok = await api('POST', '/api/admin/klubbtider', f, k ? 'Klubbtida er endret.' : 'Klubbtida er lagt inn.');
    if (ok && kontaktForAlle) {
      for (const x of sammeLag) {
        if (!ok) break;
        ok = await api('POST', '/api/admin/klubbtider', { ...x, kontakt: f.kontakt, telefon: f.telefon, epost: f.epost }, 'Kontaktinfo oppdatert på alle tidene.');
      }
    }
    setLagrer(false);
    if (ok) onFerdig();
  }

  const felt = (n: 'klubb' | 'lag' | 'kontakt' | 'telefon' | 'epost') => ({
    value: f[n] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [n]: e.target.value || (n === 'klubb' ? '' : null) }),
  });

  return (
    <form className="adm-skjema" onSubmit={lagre}>
      <div className="adm-felter">
        <label>Klubb<input required list="klubbliste" {...felt('klubb')} /></label>
        <label>Lag<input placeholder="Valgfritt" {...felt('lag')} /></label>
        <label>Dag<select value={f.dag} onChange={e => setF({ ...f, dag: Number(e.target.value) })}>{UKEDAGER.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
        <label>Fra<select value={f.fra} onChange={e => setF({ ...f, fra: e.target.value })}>{KLOKKESLETT.slice(0, -1).map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Til<select value={f.til} onChange={e => setF({ ...f, til: e.target.value })}>{KLOKKESLETT.slice(1).map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Bane<select value={f.bane} onChange={e => setF({ ...f, bane: e.target.value as Bane })}><option value="hel">Hel</option><option value="halv">Halv</option></select></label>
      </div>
      <datalist id="klubbliste">{klubber.map(x => <option key={x} value={x} />)}</datalist>
      <div className="adm-felter">
        <label>Kontaktperson<input {...felt('kontakt')} /></label>
        <label>Telefon<input inputMode="tel" {...felt('telefon')} /></label>
        <label>E-post<input type="email" {...felt('epost')} /></label>
      </div>
      {sammeLag.length > 0 && (
        <label className="avkryss"><input type="checkbox" checked={kontaktForAlle} onChange={e => setKontaktForAlle(e.target.checked)} /> Samme kontaktperson på alle tidene til {klubbNavn(f)} ({sammeLag.length + 1})</label>
      )}
      {f.unntak.length > 0 && (
        <div className="frigitte">
          <span>Frigitte dager:</span>
          {f.unntak.map(d => (
            <button type="button" key={d} className="brikke" title="Gi tilbake til klubben" onClick={() => setF({ ...f, unntak: f.unntak.filter(x => x !== d) })}>
              {dagOgManed(d, true)} <X size={12} />
            </button>
          ))}
        </div>
      )}
      <div className="adm-handlinger">
        <button className="liten-knapp primar" disabled={lagrer}>{lagrer ? 'Lagrer …' : 'Lagre'}</button>
        <button type="button" className="liten-knapp" onClick={onFerdig}>Avbryt</button>
        {k && (
          <button type="button" className="liten-knapp fare" onClick={async () => {
            if (window.confirm(`Fjerne ${klubbNavn(k)} ${UKEDAGER[k.dag - 1].toLowerCase()} ${tid(k)} for hele sesongen?`)) {
              if (await api('DELETE', `/api/admin/klubbtider?id=${k.id}`, undefined, 'Klubbtida er fjernet.')) onFerdig();
            }
          }}><Trash2 size={14} /> Fjern</button>
        )}
      </div>
    </form>
  );
}

// Oversikt over alle klubbene: kontaktpersoner og faste tider per uke.
export function Klubber({ klubbtider, api }: { klubbtider: Klubbtid[]; api: Api }) {
  const [ny, setNy] = useState(false);
  const [redigerer, setRedigerer] = useState<string | null>(null);
  const grupper = useMemo(() => {
    const m = new Map<string, Klubbtid[]>();
    for (const k of klubbtider) m.set(k.klubb, [...(m.get(k.klubb) ?? []), k]);
    return [...m.entries()]
      .map(([klubb, ks]) => ({ klubb, ks: ks.sort((a, b) => a.dag - b.dag || a.fra.localeCompare(b.fra)) }))
      .sort((a, b) => timerPerUke(b.ks) - timerPerUke(a.ks));
  }, [klubbtider]);
  const totalt = timerPerUke(klubbtider);

  return (
    <>
      <div className="klubb-topp">
        <p className="dempet">{grupper.length} klubber · {tall(totalt)} timer i uka. Frigi enkeltdager fra kalenderen.</p>
        <button className="liten-knapp primar" onClick={() => setNy(v => !v)}><Plus size={14} /> Ny fast tid</button>
      </div>
      {ny && <div className="kort"><KlubbtidSkjema alle={klubbtider} api={api} onFerdig={() => setNy(false)} /></div>}
      {grupper.map(({ klubb, ks }) => {
        const kontakter = [...new Map(ks.filter(k => k.kontakt || k.telefon || k.epost).map(k => [`${k.kontakt}|${k.telefon}|${k.epost}`, k])).values()];
        return (
          <section key={klubb} className={`kort klubbkort farge-${klubbFarge(klubb)}`}>
            <div className="klubbkort-hode">
              <h2>{klubb}</h2>
              <span className="dempet">{tall(timerPerUke(ks))} t/uke</span>
            </div>
            {kontakter.map(k => (
              <div key={k.id} className="klubb-kontakt">
                <span><strong>{k.kontakt ?? 'Uten navn'}</strong>{k.lag && kontakter.length > 1 ? <span className="dempet"> · {[...new Set(ks.filter(x => x.kontakt === k.kontakt).map(x => x.lag).filter(Boolean))].join(', ')}</span> : null}</span>
                <span className="dempet">{[k.telefon, k.epost].filter(Boolean).join(' · ')}</span>
                <KlubbKontakt k={k} />
              </div>
            ))}
            <ul className="klubbtider">
              {ks.map(k => (
                <li key={k.id}>
                  <div className="klubbtid-linje">
                    <span className="klubbtid-dag">{UKEDAGER[k.dag - 1]}</span>
                    <span className="adm-tid">{tid(k)}</span>
                    <span className="klubbtid-lag">{k.lag ?? ''}{k.bane === 'halv' ? <span className="merkelapp">Halv</span> : null}</span>
                    {k.unntak.length > 0 && <span className="dempet">{k.unntak.length} frigitt</span>}
                    <button className="ikonknapp liten" aria-label="Endre" onClick={() => setRedigerer(redigerer === k.id ? null : k.id)}><Pencil size={14} /></button>
                  </div>
                  {redigerer === k.id && <KlubbtidSkjema k={k} alle={klubbtider} api={api} onFerdig={() => setRedigerer(null)} />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

// Ukeoversikt som regnearket: hvem som har banen hver halvtime, alle dager.
type Blokk = { fra: number; til: number; tekst: string; tittel: string; klasse: string; venstre: number; bredde: number };
const RAD = 13; // px per halvtime

export function UkeOversikt({ mandag, valgt, onVelg, bestillinger, sperringer, klubbtider }: {
  mandag: string; valgt: string; onVelg: (d: string) => void;
  bestillinger: Bestilling[]; sperringer: Sperring[]; klubbtider: Klubbtid[];
}) {
  const dager = datoer(mandag, leggTilDager(mandag, 6));
  const start = FORSTE_TIME * 60;
  const slutt = (SISTE_TIME + 1) * 60;
  const iDag = naIOslo().dato;

  function blokker(d: string): Blokk[] {
    if (STENGTE_DAGER[d]) return [{ fra: start, til: slutt, tekst: STENGTE_DAGER[d], tittel: STENGTE_DAGER[d], klasse: 'stengt', venstre: 0, bredde: 1 }];
    const ut: Blokk[] = [];
    for (const s of sperringer.filter(s => s.dato === d)) {
      ut.push({ fra: s.fra_time * 60, til: s.til_time * 60, tekst: s.arsak, tittel: `Sperret: ${s.arsak}`, klasse: 'sperret', venstre: 0, bredde: 1 });
    }
    // Halve baner legges i hver sin kolonne når de overlapper.
    const halve: Blokk[] = [];
    const plasser = (b: Omit<Blokk, 'venstre' | 'bredde'>, bane: Bane) => {
      if (bane === 'hel') return ut.push({ ...b, venstre: 0, bredde: 1 });
      const venstreOpptatt = halve.some(h => h.venstre === 0 && h.fra < b.til && h.til > b.fra);
      const blokk = { ...b, venstre: venstreOpptatt ? 0.5 : 0, bredde: 0.5 };
      halve.push(blokk);
      ut.push(blokk);
    };
    for (const k of klubbtider.filter(k => k.dag === ukedag(d) && !k.unntak.includes(d)).sort((a, b) => a.fra.localeCompare(b.fra))) {
      plasser({ fra: minutter(k.fra), til: minutter(k.til), tekst: k.lag ?? k.klubb, tittel: `${tid(k)} ${klubbNavn(k)}${k.kontakt ? ` (${k.kontakt})` : ''}`, klasse: `farge-${klubbFarge(k.klubb)}` }, k.bane);
    }
    for (const b of bestillinger.filter(b => b.dato === d).sort((a, b) => a.time - b.time)) {
      plasser({
        fra: b.time * 60, til: b.time * 60 + 60, tekst: b.klubb ? `${b.navn} · ${b.klubb}` : b.navn,
        tittel: `${String(b.time).padStart(2, '0')}–${String(b.time + 1).padStart(2, '0')} ${b.navn}${b.klubb ? ` (${b.klubb})` : ''}${b.status === 'forespurt' ? ' – venter' : ''}`,
        klasse: `kunde ${b.status}`,
      }, b.bane);
    }
    return ut;
  }

  return (
    <div className="uke-rutenett" style={{ '--rad': `${RAD}px` } as React.CSSProperties}>
      <div className="ur-tider">
        <span className="ur-hode" />
        <div className="ur-kropp" style={{ height: ((slutt - start) / 30) * RAD }}>
          {Array.from({ length: SISTE_TIME + 1 - FORSTE_TIME }, (_, i) => (
            <span key={i} className="ur-klokke" style={{ top: i * 2 * RAD }}>{String(FORSTE_TIME + i).padStart(2, '0')}</span>
          ))}
        </div>
      </div>
      {dager.map((d, i) => (
        <div key={d} className={`ur-dag ${d === valgt ? 'valgt' : ''} ${d < iDag ? 'passert' : ''}`} onClick={() => onVelg(d)}>
          <button className="ur-hode" onClick={() => onVelg(d)}>
            <span>{UKEDAGER[i].slice(0, 3)}</span> <strong>{Number(d.slice(8))}.</strong>
          </button>
          <div className="ur-kropp" style={{ height: ((slutt - start) / 30) * RAD }}>
            {blokker(d).map((b, j) => (
              <span key={j} className={`ur-blokk ${b.klasse}`} title={b.tittel}
                style={{ top: ((b.fra - start) / 30) * RAD, height: ((b.til - b.fra) / 30) * RAD - 1, left: `${b.venstre * 100}%`, width: `calc(${b.bredde * 100}% - 2px)` }}>
                {b.tekst}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

