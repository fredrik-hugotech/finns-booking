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
  fra: '2026-11-02',
  til: '2027-02-28',
};

// Bookbare timer: første time starter 08:00, siste time er 22:00–23:00.
export const FORSTE_TIME = 8;
export const SISTE_TIME = 22;

// Enkelttimer kan bookes så mange dager frem (fra sesongstart eller i dag).
// Faste ukentlige tider kan bookes for hele sesongen, så lagene får sikret
// seg fast tid før enkelttimer fyller opp ukene.
export const ENKELT_DAGER_FREM = 28;
// Så mange uker på samme ukedag og tid regnes som en fast tid.
export const MIN_FAST_UKER = 3;

// Pris per time. Helg = lørdag og søndag.
export const PRIS = {
  ukedag: { hel: 2000, halv: 1500 },
  helg: { hel: 2100, halv: 1600 },
};

// Dager arenaen er stengt for booking.
export const STENGTE_DAGER: Record<string, string> = {
  '2026-12-24': 'Julaften',
  '2026-12-25': 'Første juledag',
  '2026-12-26': 'Andre juledag',
  '2026-12-31': 'Nyttårsaften',
  '2027-01-01': 'Første nyttårsdag',
};
