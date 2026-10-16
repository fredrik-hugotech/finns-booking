// Henter logo og Vipps-QR fra fjorårets bookingside hvis de mangler i public/
// (skjer bare når appen deployes uten bildefilene).
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const KILDE = 'https://raw.githubusercontent.com/fredrik-hugotech/finns-booking/main/';
const BILDER = {
  'public/logo.png': 'ff-logo-gronn.png',
  'public/vipps-qr.png': 'ff-qr-kode-vipps.678504736bdb43.83557485.png',
};

mkdirSync('public', { recursive: true });
for (const [mal, fil] of Object.entries(BILDER)) {
  if (existsSync(mal)) continue;
  const r = await fetch(KILDE + fil);
  if (!r.ok) throw new Error(`Fant ikke ${fil} (${r.status})`);
  writeFileSync(mal, Buffer.from(await r.arrayBuffer()));
  console.log(`Hentet ${mal}`);
}
