// Bekreftelse på e-post til kunden når Finns.Fairway har bekreftet bookingen. Sendes via Resend.
import { ARENA } from './config';
import { kr, langDato } from './dato';
import { lengdeAv, startAv, tidFor, varighet, type Bestilling } from './tilgjengelighet';

export const NETTSIDE = 'https://vinterbooking.finnsfairway.no';
export const FRA = process.env.EPOST_FRA || 'Finns.Fairway <booking@hugo.as>';
const SVAR_TIL = process.env.EPOST_SVAR_TIL || 'post@finnsfairway.no';

export type Utsending = { sendt: boolean; til: string; feil?: string };

export const epostErSattOpp = () => Boolean(process.env.RESEND_API_KEY);

export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function innhold(linjer: Bestilling[]) {
  const f = linjer[0];
  const sortert = [...linjer].sort((a, b) => a.dato.localeCompare(b.dato) || startAv(a) - startAv(b));
  const sum = sortert.reduce((s, l) => s + l.pris, 0);
  const min = sortert.reduce((s, l) => s + lengdeAv(l), 0);
  const fornavn = f.navn.trim().split(/\s+/)[0] || f.navn;
  const bane = (l: Bestilling) => (l.bane === 'hel' ? 'Hel bane' : 'Halv bane');
  const emne = `Bekreftet: ${f.ref} – ${ARENA.navn}`;

  const tekst = [
    `Hei ${fornavn},`,
    '',
    `Bookingen din på ${ARENA.navn} er bekreftet:`,
    '',
    ...sortert.map(l => `- ${langDato(l.dato)} ${tidFor(l)}, ${bane(l).toLowerCase()} (${kr(l.pris)})`),
    '',
    `Totalt ${varighet(min)}: ${kr(sum)}`,
    '',
    `Betal med Vipps og skriv ${f.ref} i meldingen, om du ikke allerede har betalt. Bookingen er bindende når betalingen er mottatt.`,
    '',
    `Spørsmål eller endringer? Svar på denne e-posten.`,
    '',
    'Hilsen Finns.Fairway',
    NETTSIDE,
  ].join('\n');

  const rader = sortert.map(l => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #EFE6D6;">
            <div style="font-weight:600;color:#005A4F;">${esc(langDato(l.dato))}</div>
            <div style="color:#5b6b67;font-size:14px;">${tidFor(l)} · ${bane(l)}</div>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #EFE6D6;text-align:right;white-space:nowrap;color:#005A4F;">${kr(l.pris)}</td>
        </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="no"><body style="margin:0;background:#FCF9F4;font-family:Helvetica,Arial,sans-serif;color:#1f2d2a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FCF9F4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#005A4F;padding:22px 28px;">
          <img src="${NETTSIDE}/logo-gul.png" alt="Finns.Fairway" height="34" style="display:block;height:34px;border:0;">
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#5b6b67;">${esc(ARENA.navn)}</p>
          <h1 style="margin:0 0 18px;font-size:24px;color:#005A4F;">Bookingen er bekreftet</h1>
          <p style="margin:0 0 18px;line-height:1.5;">Hei ${esc(fornavn)}, vi har bekreftet bookingen din. Her er timene:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rader}
            <tr>
              <td style="padding:14px 0 0;font-weight:600;">Totalt, ${varighet(min)}</td>
              <td style="padding:14px 0 0;text-align:right;font-weight:700;color:#005A4F;white-space:nowrap;">${kr(sum)}</td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:#FFFAC2;border-radius:12px;">
            <tr>
              <td style="padding:16px;width:112px;"><img src="${NETTSIDE}/vipps-qr.png" alt="Vipps QR-kode" width="96" height="96" style="display:block;border:0;"></td>
              <td style="padding:16px 16px 16px 0;line-height:1.5;">
                <strong style="color:#005A4F;">Betal med Vipps</strong><br>
                Skann koden og skriv <strong>${esc(f.ref)}</strong> i meldingen, om du ikke allerede har betalt. Bookingen er bindende når betalingen er mottatt.
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0;line-height:1.5;">Spørsmål eller endringer? Bare svar på denne e-posten.</p>
          <p style="margin:16px 0 0;">Hilsen<br><strong>Finns.Fairway</strong></p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#F5EAD8;font-size:13px;color:#5b6b67;">
          Referanse ${esc(f.ref)} · <a href="${NETTSIDE}" style="color:#005A4F;">vinterbooking.finnsfairway.no</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { emne, tekst, html };
}

// Send bekreftelse for én bestilling (alle linjene har samme ref). Kaster ikke: feil kommer tilbake i svaret.
export async function sendBekreftelse(linjer: Bestilling[]): Promise<Utsending> {
  const til = linjer[0]?.epost?.trim() ?? '';
  if (!linjer.length || !/^\S+@\S+\.\S+$/.test(til)) return { sendt: false, til, feil: 'mangler e-post' };
  const nokkel = process.env.RESEND_API_KEY;
  if (!nokkel) return { sendt: false, til, feil: 'e-post er ikke satt opp' };
  const { emne, tekst, html } = innhold(linjer);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      cache: 'no-store',
      headers: { authorization: `Bearer ${nokkel}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FRA, to: [til], reply_to: SVAR_TIL, subject: emne, text: tekst, html }),
    });
    if (!r.ok) return { sendt: false, til, feil: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { sendt: true, til };
  } catch (e) {
    return { sendt: false, til, feil: e instanceof Error ? e.message : 'ukjent feil' };
  }
}
