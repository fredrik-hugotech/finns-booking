import { NextResponse } from 'next/server';
import { hentForSide, nyttSvar, StengtFeil } from '@/lib/pam/lager';
import { sjekkSvar } from '@/lib/pam/felter';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const b = await req.json().catch(() => ({}));
  const a = (await hentForSide(params.slug)).find(x => x.id === b.arrangement);
  if (!a) return NextResponse.json({ feil: 'Fant ikke påmeldingen.' }, { status: 404 });
  if (!a.aapen) return NextResponse.json({ feil: 'Påmeldingen er stengt.' }, { status: 409 });
  // Skjult felt som bare roboter fyller ut. Svar som om alt gikk bra.
  if (typeof b.nettside === 'string' && b.nettside) return NextResponse.json({ ok: true });

  const { data, feil } = sjekkSvar(a.felter, typeof b.data === 'object' && b.data ? b.data : {});
  if (Object.keys(feil).length) return NextResponse.json({ feil: Object.values(feil)[0], felt: feil }, { status: 400 });
  try {
    await nyttSvar(a.id, data);
  } catch (e) {
    if (e instanceof StengtFeil) return NextResponse.json({ feil: 'Påmeldingen er stengt.' }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
