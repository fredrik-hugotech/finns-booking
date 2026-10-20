import { NextResponse } from 'next/server';
import { OKT_COOKIE, lagOkt, loggInn, oktValg } from '@/lib/tilgang';
import { markerInne } from '@/lib/lager';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { epost, passord } = await req.json().catch(() => ({}));
  const b = typeof epost === 'string' && typeof passord === 'string' ? await loggInn(epost, passord) : null;
  if (!b) {
    // Litt ventetid gjør gjetting av passord tregere.
    await new Promise(r => setTimeout(r, 600));
    return NextResponse.json({ feil: 'Feil e-post eller passord.' }, { status: 401 });
  }
  await markerInne(b.id).catch(() => {});
  const { verdi, maxAge } = lagOkt(b.id, b.passord_hash);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OKT_COOKIE, verdi, oktValg(maxAge));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(OKT_COOKIE);
  return res;
}
