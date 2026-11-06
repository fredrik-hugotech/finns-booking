// Sending av bekreftelse etter at admin har bekreftet, med logg.
import { hentBestillinger, skrivLogg, type Bruker } from './lager';
import { langDato } from './dato';
import { sendBekreftelse } from './epost';
import { tidFor, type Bestilling } from './tilgjengelighet';

// «SNAK-AB12C Ola Nordmann: tirsdag 1. desember 16:00–17:00 hel, …» for loggen.
export function beskriv(linjer: Pick<Bestilling, 'ref' | 'navn' | 'dato' | 'time' | 'minutt' | 'lengde' | 'bane'>[]) {
  const forste = linjer[0];
  const timer = linjer.slice(0, 6).map(l => `${langDato(l.dato)} ${tidFor(l)} ${l.bane}`).join(', ');
  return `${forste.ref} ${forste.navn}: ${timer}${linjer.length > 6 ? ` og ${linjer.length - 6} timer til` : ''}`;
}
// Send bekreftelse for hver ref, med alle bekreftede timer på den, og logg resultatet.
// Gir en kort tekst til admin om hva som ble sendt.
export async function sendBekreftelser(meg: Bruker, refer: string[]): Promise<string> {
  if (!refer.length) return '';
  const alle = await hentBestillinger();
  const deler: string[] = [];
  for (const ref of refer) {
    const linjer = alle.filter(b => b.ref === ref && b.status === 'bekreftet');
    if (!linjer.length) continue;
    const u = await sendBekreftelse(linjer);
    if (u.sendt) {
      await skrivLogg(meg, 'Sendte bekreftelse', `${beskriv(linjer)} · til ${u.til}`);
      deler.push(`E-post sendt til ${u.til}.`);
    } else {
      if (u.til) await skrivLogg(meg, 'Bekreftelse ikke sendt', `${beskriv(linjer)} · ${u.til}: ${u.feil}`);
      deler.push(u.til ? `Fikk ikke sendt e-post til ${u.til} (${u.feil}).` : `${linjer[0].navn} har ingen e-post, så ingen bekreftelse ble sendt.`);
    }
  }
  return deler.join(' ');
}

