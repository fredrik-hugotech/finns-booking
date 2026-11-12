import { NextResponse } from 'next/server';
import { ikkeInne, innlogget, kanSe } from '@/lib/pam/tilgang';
import { hentArrangementer, hentSvar, skrivLogg } from '@/lib/pam/lager';
import { navnPa, tilCsv } from '@/lib/pam/felter';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const meg = await innlogget();
  if (!meg) return ikkeInne();
  const id = new URL(req.url).searchParams.get('arrangement');
  const a = (await hentArrangementer()).find(x => x.id === id);
  if (!a || !kanSe(meg, a)) return NextResponse.json({ feil: 'Fant ikke påmeldingen.' }, { status: 404 });
  const svar = await hentSvar(a.id);
  await skrivLogg(meg, 'Lastet ned påmeldinger', `${navnPa(a)} · ${svar.length} stk.`);
  return new NextResponse(tilCsv(a.felter, svar), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${a.slug}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
