// «Du har fått plass»-e-post til påmeldte, sendt via Resend i bunker på inntil 100.
import { erDemo } from '../lager';
import { FRA, esc } from '../epost';
import { PARTNERE, navnPa, type Arrangement, type Svar } from './felter';

export type Melding = { emne: string; tekst: string };

// Navnet på deltakeren: navnefeltet, ellers første tekstfelt.
export function navnI(a: Arrangement, s: Svar): string {
  const felt = a.felter.find(f => f.id === 'navn') ?? a.felter.find(f => f.type === 'tekst');
  return (felt && s.data[felt.id]) || '';
}

export const mottakere = (a: Arrangement, s: Svar) =>
  [...new Set(a.felter.filter(f => f.type === 'epost').map(f => s.data[f.id]?.trim().toLowerCase()).filter(Boolean))];

export function standardMelding(a: Arrangement): Melding {
  const partner = a.partner ? PARTNERE[a.partner] : null;
  return {
    emne: `Du har fått plass: ${navnPa(a)}`,
    tekst: [
      'Hei!',
      '',
      `{navn} har fått plass på ${navnPa(a)}.`,
      '',
      'Vi gleder oss til å se dere!',
      '',
      `Hilsen Finns.Fairway${partner ? ` og ${partner.navn}` : ''}`,
    ].join('\n'),
  };
}

function html(a: Arrangement, tekst: string, nettside: string) {
  const partner = a.partner ? PARTNERE[a.partner] : null;
  const avsnitt = tekst.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;line-height:1.5;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!DOCTYPE html>
<html lang="no"><body style="margin:0;background:#FCF9F4;font-family:Helvetica,Arial,sans-serif;color:#1f2d2a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FCF9F4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#005A4F;padding:18px 28px;">
          <img src="${nettside}/logo-gul.png" alt="Finns.Fairway" height="34" style="display:inline-block;height:34px;border:0;vertical-align:middle;">
          ${partner ? `<span style="color:#FFFAC2;font-size:20px;margin:0 10px;vertical-align:middle;">×</span><img src="${nettside}${partner.logo}" alt="${esc(partner.navn)}" height="38" style="display:inline-block;height:38px;border:0;background:#fff;border-radius:8px;padding:2px 6px;vertical-align:middle;">` : ''}
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#5b6b67;">${esc(navnPa(a))}</p>
          <h1 style="margin:0 0 18px;font-size:24px;color:#005A4F;">Du har fått plass</h1>
          ${avsnitt}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export type Resultat = { sendt: Svar[]; uten: Svar[]; feil?: string };

// Sender én e-post per påmelding (til alle e-postfeltene i den) og gir tilbake hvilke som ble sendt.
// `nettside` er adressen bildene hentes fra (der appen kjører).
export async function sendPlass(a: Arrangement, svar: Svar[], m: Melding, svarTil: string, nettside: string): Promise<Resultat> {
  const uten = svar.filter(s => !mottakere(a, s).length);
  const med = svar.filter(s => mottakere(a, s).length);
  if (!med.length) return { sendt: [], uten };
  const nokkel = process.env.RESEND_API_KEY;
  if (!nokkel) return erDemo() ? { sendt: med, uten } : { sendt: [], uten, feil: 'E-post er ikke satt opp (RESEND_API_KEY mangler).' };

  const sendt: Svar[] = [];
  for (let i = 0; i < med.length; i += 100) {
    const bunke = med.slice(i, i + 100);
    const eposter = bunke.map(s => {
      const flett = (t: string) => t.replace(/\{navn\}/g, navnI(a, s) || 'Deltakeren');
      const tekst = flett(m.tekst);
      return { from: FRA, to: mottakere(a, s), reply_to: svarTil, subject: flett(m.emne), text: tekst, html: html(a, tekst, nettside) };
    });
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        cache: 'no-store',
        headers: { authorization: `Bearer ${nokkel}`, 'content-type': 'application/json' },
        body: JSON.stringify(eposter),
      });
      if (!r.ok) return { sendt, uten, feil: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
      sendt.push(...bunke);
    } catch (e) {
      return { sendt, uten, feil: e instanceof Error ? e.message : 'ukjent feil' };
    }
  }
  return { sendt, uten };
}
