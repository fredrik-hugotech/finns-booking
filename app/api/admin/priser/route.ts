import { NextResponse } from 'next/server';
import { adminBruker, erAdmin } from '@/lib/tilgang';
import { hentPriser, lagrePriser, skrivLogg } from '@/lib/lager';
import type { Priser } from '@/lib/config';

export const dynamic = 'force-dynamic';

const nekt = () => NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
const belop = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100000 ? (v as number) : null);

export async function GET() {
  if (!(await erAdmin())) return nekt();
  return NextResponse.json({ priser: await hentPriser() });
}

// Nye priser gjelder nye bookinger. Timer som allerede er booket beholder prisen sin.
export async function PUT(req: Request) {
  const meg = await adminBruker();
  if (!meg) return nekt();
  const b = await req.json().catch(() => ({}));
  const priser: Priser = {
    ukedag: { hel: belop(b?.ukedag?.hel)!, halv: belop(b?.ukedag?.halv)! },
    helg: { hel: belop(b?.helg?.hel)!, halv: belop(b?.helg?.halv)! },
  };
  if ([priser.ukedag.hel, priser.ukedag.halv, priser.helg.hel, priser.helg.halv].some(v => v === null)) {
    return NextResponse.json({ feil: 'Skriv inn hele kroner.' }, { status: 400 });
  }
  const gamle = await hentPriser();
  await lagrePriser(priser);
  const endret = (['ukedag', 'helg'] as const).flatMap(d => (['hel', 'halv'] as const)
    .filter(b => gamle[d][b] !== priser[d][b])
    .map(b => `${d === 'ukedag' ? 'Ukedag' : 'Helg'} ${b} bane ${gamle[d][b]} → ${priser[d][b]} kr`));
  if (endret.length) await skrivLogg(meg, 'Endret priser', endret.join(', '));
  return NextResponse.json({ ok: true });
}
