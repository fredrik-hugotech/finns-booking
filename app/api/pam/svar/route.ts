import { NextResponse } from 'next/server';
import { ikkeInne, innlogget, kanSe } from '@/lib/pam/tilgang';
import { hentArrangementer, hentSvar, skrivLogg, slettSvar } from '@/lib/pam/lager';
import { navnPa } from '@/lib/pam/felter';

export const dynamic = 'force-dynamic';

async function medTilgang(req: Request) {
  const meg = await innlogget();
  if (!meg) return { feil: ikkeInne() };
  const id = new URL(req.url).searchParams.get('arrangement');
  const a = (await hentArrangementer()).find(x => x.id === id);
  if (!a || !kanSe(meg, a)) return { feil: NextResponse.json({ feil: 'Fant ikke påmeldingen.' }, { status: 404 }) };
  return { meg, a };
}

export async function GET(req: Request) {
  const t = await medTilgang(req);
  if (t.feil) return t.feil;
  return NextResponse.json({ svar: await hentSvar(t.a.id) });
}

export async function DELETE(req: Request) {
  const t = await medTilgang(req);
  if (t.feil) return t.feil;
  const id = new URL(req.url).searchParams.get('id');
  const s = (await hentSvar(t.a.id)).find(x => x.id === id);
  if (!s) return NextResponse.json({ feil: 'Fant ikke påmeldingen.' }, { status: 404 });
  await slettSvar(s.id);
  const hvem = s.data.navn || Object.values(s.data)[0] || '';
  await skrivLogg(t.meg, 'Slettet påmelding', `${navnPa(t.a)} · ${hvem}`);
  return NextResponse.json({ ok: true });
}
