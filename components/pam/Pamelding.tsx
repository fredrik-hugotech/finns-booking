'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { PARTNERE, arskullFor, lagSlug, sjekkSvar, type Arrangement, type Felt } from '@/lib/pam/felter';

const fanenokkel = (a: Arrangement) => lagSlug(a.fane ?? a.slug);

export function Pamelding({ slug, arrangementer }: { slug: string; arrangementer: Arrangement[] }) {
  const [aktiv, setAktiv] = useState(arrangementer[0].id);
  useEffect(() => {
    const fra = () => {
      const a = arrangementer.find(x => fanenokkel(x) === location.hash.slice(1));
      if (a) setAktiv(a.id);
    };
    fra();
    window.addEventListener('hashchange', fra);
    return () => window.removeEventListener('hashchange', fra);
  }, [arrangementer]);

  const forste = arrangementer[0];
  const partner = forste.partner ? PARTNERE[forste.partner] : null;
  const a = arrangementer.find(x => x.id === aktiv) ?? forste;

  function velg(x: Arrangement) {
    setAktiv(x.id);
    history.replaceState(null, '', `#${fanenokkel(x)}`);
  }

  return (
    <>
      <header className="topp">
        <div className="innhold pam-topp">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-gul.png" alt="Finns.Fairway" className="logo" />
          {partner && (
            <>
              <span className="pam-x" aria-hidden="true">×</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={partner.logo} alt={partner.navn} className="pam-partner" />
            </>
          )}
        </div>
      </header>
      <main className="innhold smal">
        <h1>{forste.tittel}</h1>
        {arrangementer.length > 1 && (
          <div className="visning" role="tablist">
            {arrangementer.map(x => (
              <button key={x.id} role="tab" aria-selected={x.id === a.id} className={x.id === a.id ? 'aktiv' : ''} onClick={() => velg(x)}>
                {x.fane ?? x.tittel}
              </button>
            ))}
          </div>
        )}
        <Skjema key={a.id} slug={slug} a={a} />
      </main>
      <footer className="fot">Finns.Fairway{partner ? ` × ${partner.navn}` : ''} · For en trygg og aktiv oppvekst</footer>
    </>
  );
}

function Skjema({ slug, a }: { slug: string; a: Arrangement }) {
  const tom = () => Object.fromEntries(a.felter.map(f => [f.id, '']));
  const [verdier, setVerdier] = useState<Record<string, string>>(tom);
  const [feil, setFeil] = useState<Record<string, string>>({});
  const [melding, setMelding] = useState('');
  const [nettside, setNettside] = useState('');
  const [sender, setSender] = useState(false);
  const [ferdig, setFerdig] = useState<Record<string, string> | null>(null);

  if (!a.aapen) return <p className="melding">Påmeldingen er stengt.</p>;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setMelding('');
    const sjekk = sjekkSvar(a.felter, verdier);
    setFeil(sjekk.feil);
    if (Object.keys(sjekk.feil).length) {
      document.getElementById(`f-${Object.keys(sjekk.feil)[0]}`)?.focus();
      return;
    }
    setSender(true);
    const r = await fetch(`/api/p/${slug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arrangement: a.id, data: sjekk.data, nettside }),
    }).catch(() => null);
    setSender(false);
    if (r?.ok) {
      setFerdig(sjekk.data);
      return;
    }
    const svar = await r?.json().catch(() => ({}));
    if (svar?.felt) setFeil(svar.felt);
    setMelding(svar?.feil ?? 'Noe gikk galt. Sjekk nettet og prøv igjen.');
  }

  // «Meld på en til» beholder e-post og telefon, så søsken går fort.
  function enTil() {
    const behold = Object.fromEntries(a.felter.filter(f => f.type === 'epost' || f.type === 'telefon').map(f => [f.id, ferdig?.[f.id] ?? '']));
    setVerdier({ ...tom(), ...behold });
    setFerdig(null);
  }

  if (ferdig) {
    const navn = a.felter.find(f => f.type === 'tekst');
    return (
      <div className="pam-kort pam-ferdig">
        <div className="pam-hake"><Check size={32} /></div>
        <h2>Påmeldt!</h2>
        {navn && ferdig[navn.id] && <p>{ferdig[navn.id]} er påmeldt.</p>}
        <button className="knapp sekundar" onClick={enTil}>Meld på en til</button>
      </div>
    );
  }

  return (
    <form className="pam-kort skjema" onSubmit={send} noValidate>
      {a.info && <p className="pam-info">{a.info}</p>}
      {a.felter.map(f => (
        <FeltInput key={f.id} f={f} verdi={verdier[f.id] ?? ''} feil={feil[f.id]} onEndre={v => {
          setVerdier(x => ({ ...x, [f.id]: v }));
          setFeil(x => ({ ...x, [f.id]: '' }));
        }} />
      ))}
      <label className="pam-skjult" aria-hidden="true">
        Nettside<input tabIndex={-1} autoComplete="off" value={nettside} onChange={e => setNettside(e.target.value)} />
      </label>
      {melding && <p className="melding feil">{melding}</p>}
      <button className="knapp" disabled={sender}>{sender ? <><Loader2 size={16} className="spinn" /> Sender …</> : 'Meld på'}</button>
    </form>
  );
}

function FeltInput({ f, verdi, feil, onEndre }: { f: Felt; verdi: string; feil?: string; onEndre: (v: string) => void }) {
  const id = `f-${f.id}`;
  const felles = { id, value: verdi, 'aria-invalid': !!feil, className: feil ? 'ugyldig' : undefined };
  let input: React.ReactNode;
  if (f.type === 'arskull' || f.type === 'valg') {
    const valg = f.type === 'arskull' ? arskullFor(f).map(String) : f.valg ?? [];
    input = (
      <select {...felles} onChange={e => onEndre(e.target.value)}>
        <option value="" disabled>{f.type === 'arskull' ? 'Velg årskull' : 'Velg'}</option>
        {valg.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  } else if (f.type === 'langtekst') {
    input = <textarea {...felles} rows={4} onChange={e => onEndre(e.target.value)} />;
  } else {
    const type = f.type === 'epost' ? 'email' : f.type === 'telefon' ? 'tel' : 'text';
    const auto = f.type === 'epost' ? 'email' : f.type === 'telefon' ? 'tel' : 'off';
    input = <input {...felles} type={type} autoComplete={auto} inputMode={f.type === 'epost' ? 'email' : f.type === 'telefon' ? 'tel' : undefined} onChange={e => onEndre(e.target.value)} />;
  }
  return (
    <label htmlFor={id}>
      <span>{f.navn}{!f.pakrevd && <small> (valgfritt)</small>}</span>
      {input}
      {feil && <small className="pam-feil">{feil}</small>}
    </label>
  );
}
