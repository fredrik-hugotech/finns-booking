// Alt som endres fra sesong til sesong ligger her.

export const ARENA = {
  navn: 'Sparebanken Norge Arena',
  kortnavn: 'SNAK',
  sted: 'Kristiansand',
  arrangor: 'Finns.Fairway',
};

export const SESONG = {
  navn: 'Vinteråpen arena 2026/27',
  // Første og siste dag det kan bookes (begge inklusive), YYYY-MM-DD.
  fra: '2026-12-01',
  til: '2027-03-31',
};

// Bookbare timer: første time starter 08:00, siste time er 22:00–23:00.
export const FORSTE_TIME = 8;
export const SISTE_TIME = 22;

// Pris per time. Helg = lørdag og søndag. Prisene settes i admin (lagres i
// databasen); dette er bare utgangspunktet og det som brukes i demo-modus.
export type Priser = { ukedag: { hel: number; halv: number }; helg: { hel: number; halv: number } };
export const STANDARD_PRIS: Priser = {
  ukedag: { hel: 1990, halv: 1490 },
  helg: { hel: 1990, halv: 1490 },
};

// Dager arenaen er stengt for booking.
export const STENGTE_DAGER: Record<string, string> = {
  '2026-12-24': 'Julaften',
  '2026-12-25': 'Første juledag',
  '2026-12-26': 'Andre juledag',
  '2026-12-31': 'Nyttårsaften',
  '2027-01-01': 'Første nyttårsdag',
};
