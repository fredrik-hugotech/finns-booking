import { createHash, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { erDemo } from './lager';

export const ADMIN_COOKIE = 'snak_admin';

// I demo-modus er passordet «demo». Med ekte database må ADMIN_PASSWORD være
// satt, ellers er admin stengt.
function passord(): string | null {
  return process.env.ADMIN_PASSWORD || (erDemo() ? 'demo' : null);
}

export function token(pw: string): string {
  return createHash('sha256').update(`snak-admin:${pw}`).digest('hex');
}

function likt(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function riktigPassord(pw: unknown): boolean {
  const fasit = passord();
  return !!fasit && typeof pw === 'string' && likt(token(pw), token(fasit));
}

export function erAdmin(): boolean {
  const fasit = passord();
  const c = cookies().get(ADMIN_COOKIE)?.value;
  return !!fasit && !!c && likt(c, token(fasit));
}
