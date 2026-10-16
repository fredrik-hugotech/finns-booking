import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, riktigPassord, token } from '@/lib/admin';

export async function POST(req: Request) {
  const { passord } = await req.json().catch(() => ({}));
  if (!riktigPassord(passord)) {
    return NextResponse.json({ feil: 'Feil passord.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token(passord), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
