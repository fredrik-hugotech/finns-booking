import { NextResponse } from 'next/server';
import { PAM_COOKIE, innlogget, lagOkt, loggInn, oktValg } from '@/lib/pam/tilgang';
import { markerInne, skrivLogg } from '@/lib/pam/lager';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { epost, passord } = await req.json().catch(() => ({}));
  const b = typeof epost === 'string' && typeof passord === 'string' ? await loggInn(epost, passord) : null;
  if (!b) {
    await skrivLogg({ navn: typeof epost === 'string' ? epost.trim().toLowerCase().slice(0, 160) || 'ukjent' : 'ukjent' }, 'Mislykket innlogging');
    await new Promise(r => setTimeout(r, 600));
    return NextResponse.json({ feil: 'Feil e-post eller passord.' }, { status: 401 });
  }
  await markerInne(b.id).catch(() => {});
  await skrivLogg(b, 'Logget inn');
  const { verdi, maxAge } = lagOkt(b.id, b.passord_hash);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PAM_COOKIE, verdi, oktValg(maxAge));
  return res;
}

export async function DELETE() {
  const meg = await innlogget();
  if (meg) await skrivLogg(meg, 'Logget ut');
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PAM_COOKIE);
  return res;
}
