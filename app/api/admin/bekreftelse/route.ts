import { NextResponse } from 'next/server';
import { adminBruker } from '@/lib/tilgang';
import { sendBekreftelser } from '@/lib/bekreftelse';

export const dynamic = 'force-dynamic';

// Send bekreftelsen på nytt for én bestilling ({ ref }).
export async function POST(req: Request) {
  const meg = await adminBruker();
  if (!meg) return NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
  const { ref } = await req.json().catch(() => ({}));
  if (typeof ref !== 'string' || !ref) return NextResponse.json({ feil: 'Ugyldig forespørsel.' }, { status: 400 });
  const melding = await sendBekreftelser(meg, [ref]);
  if (!melding) return NextResponse.json({ feil: 'Bestillingen har ingen bekreftede timer.' }, { status: 400 });
  if (!melding.startsWith('E-post sendt')) return NextResponse.json({ feil: melding }, { status: 502 });
  return NextResponse.json({ ok: true, melding });
}
