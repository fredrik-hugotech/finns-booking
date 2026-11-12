import { NextResponse } from 'next/server';
import { PAM_COOKIE, hashPassord, ikkeInne, innlogget, lagOkt, oktValg, riktigPassord } from '@/lib/pam/tilgang';
import { hentBruker, lagreBruker, skrivLogg } from '@/lib/pam/lager';

export const dynamic = 'force-dynamic';

export async function GET() {
  const b = await innlogget();
  if (!b) return ikkeInne();
  return NextResponse.json({ bruker: b });
}

// Bytt eget passord. Andre økter logges ut, denne fortsetter.
export async function PATCH(req: Request) {
  const meg = await innlogget();
  if (!meg) return ikkeInne();
  const { gammelt, nytt } = await req.json().catch(() => ({}));
  const full = await hentBruker({ id: meg.id });
  if (!full || typeof gammelt !== 'string' || !riktigPassord(gammelt, full.passord_hash)) {
    return NextResponse.json({ feil: 'Nåværende passord er feil.' }, { status: 400 });
  }
  if (typeof nytt !== 'string' || nytt.length < 8) {
    return NextResponse.json({ feil: 'Nytt passord må ha minst 8 tegn.' }, { status: 400 });
  }
  const passord_hash = hashPassord(nytt);
  await lagreBruker({ id: meg.id, passord_hash });
  await skrivLogg(meg, 'Byttet eget passord');
  const { verdi, maxAge } = lagOkt(meg.id, passord_hash);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PAM_COOKIE, verdi, oktValg(maxAge));
  return res;
}
