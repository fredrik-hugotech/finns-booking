import { NextResponse } from 'next/server';
import { erAdmin } from '@/lib/admin';
import { hentBestillinger, OpptattFeil, settStatus } from '@/lib/lager';
import type { Status } from '@/lib/tilgjengelighet';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!erAdmin()) return NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
  return NextResponse.json({ bestillinger: await hentBestillinger() });
}

export async function PATCH(req: Request) {
  if (!erAdmin()) return NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
  const { ider, status } = await req.json().catch(() => ({}));
  const gyldig: Status[] = ['forespurt', 'bekreftet', 'avlyst'];
  if (!Array.isArray(ider) || ider.length === 0 || !ider.every(i => typeof i === 'string') || !gyldig.includes(status)) {
    return NextResponse.json({ feil: 'Ugyldig forespørsel.' }, { status: 400 });
  }
  try {
    await settStatus(ider, status);
  } catch (e) {
    if (e instanceof OpptattFeil) return NextResponse.json({ feil: 'Timen er booket av noen andre i mellomtiden.' }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
