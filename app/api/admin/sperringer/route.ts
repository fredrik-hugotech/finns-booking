import { NextResponse } from 'next/server';
import { erAdmin } from '@/lib/tilgang';
import { hentSperringer, lagreSperring, slettSperring } from '@/lib/lager';
import { erGyldigDato } from '@/lib/dato';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await erAdmin())) return NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
  return NextResponse.json({ sperringer: await hentSperringer() });
}

export async function POST(req: Request) {
  if (!(await erAdmin())) return NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const arsak = typeof b.arsak === 'string' ? b.arsak.trim().slice(0, 120) : '';
  if (!erGyldigDato(b.dato) || !Number.isInteger(b.fra_time) || !Number.isInteger(b.til_time) || b.til_time <= b.fra_time || !arsak) {
    return NextResponse.json({ feil: 'Fyll inn dato, fra, til og årsak.' }, { status: 400 });
  }
  await lagreSperring({ dato: b.dato, fra_time: b.fra_time, til_time: b.til_time, arsak });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await erAdmin())) return NextResponse.json({ feil: 'Ikke innlogget.' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ feil: 'Mangler id.' }, { status: 400 });
  await slettSperring(id);
  return NextResponse.json({ ok: true });
}
