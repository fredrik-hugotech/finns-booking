import type { Klubbtid } from './tilgjengelighet';

// Klubbenes faste treningstider fra «Treningstider SNAK 2026/2027 Vinteråpen
// arena», Ark 2 (tildelt). Dette er startoppsettet: i drift ligger tidene i
// databasen og endres i admin under Klubber. Demo-modus bruker listen direkte.
// Kontaktpersonene er hentet fra fjorårets bookinger.
//
// Ukedag: 1 = mandag … 7 = søndag. Mandag 16:30–17:30 deler Donn og Start 2
// banen, så de har hver sin halvdel.

type Ny = Omit<Klubbtid, 'id' | 'unntak'>;

const K = {
  oyvind: { kontakt: 'Øyvind Evjen', telefon: '98261107', epost: 'oyvind@ikstart.no' },
  johan: { kontakt: 'Johan Gjønnes Nilsen', telefon: '95138360', epost: 'johan@ikstart.no' },
  trond: { kontakt: 'Trond Magne Mæstad', telefon: '93435819', epost: 'trond@ikstartkvinner.no' },
  sebastian: { kontakt: 'Sebastian Nevstad', telefon: '95850611', epost: 'sebastian@ikstart.no' },
  donn: { kontakt: 'Hermann Witzøe', telefon: '97346816', epost: 'hermann@donn.no' },
  gimle: { kontakt: 'Chris Peter Grasaas-Albrecht', telefon: '91185407', epost: 'charlb@sshf.no' },
  ff: { kontakt: 'Mette Tønnessen', telefon: '90606253', epost: 'mette@hugo.as' },
};

const start = (lag: string, kontakt: typeof K.johan) => ({ klubb: 'IK Start', lag, ...kontakt });
const donn = { klubb: 'Donn', lag: null, ...K.donn };
const gimle = { klubb: 'IK Gimletroll', lag: null, ...K.gimle };
const akademiet = { klubb: 'Akademiet', lag: null, ...K.johan };
const gatelag = { klubb: 'Gatelag', lag: null, ...K.johan };
// KKG står som «Start 2/G17» i timeplanen, men er egne økter (6 halvtimer i oppsummeringen).
const kkg = { klubb: 'KKG', lag: null, kontakt: null, telefon: null, epost: null };
const aLag = start('A-lag', K.oyvind);

const t = (dag: number, fra: string, til: string, hvem: Omit<Ny, 'dag' | 'fra' | 'til' | 'bane'>, bane: 'hel' | 'halv' = 'hel'): Ny =>
  ({ dag, fra, til, bane, ...hvem });

export const KLUBBTIDER_START: Ny[] = [
  // Mandag
  t(1, '08:00', '09:00', akademiet),
  t(1, '10:30', '12:30', aLag),
  t(1, '16:00', '16:30', start('Start 2', K.johan)),
  t(1, '16:30', '17:30', donn, 'halv'),
  t(1, '16:30', '17:30', start('Start 2', K.johan), 'halv'),
  t(1, '17:30', '20:30', donn),
  t(1, '20:30', '22:00', gimle),
  // Tirsdag
  t(2, '08:00', '09:30', kkg),
  t(2, '10:30', '12:30', aLag),
  t(2, '16:00', '17:30', start('Kvinner 2', K.trond)),
  t(2, '17:30', '20:30', gimle),
  t(2, '20:30', '22:00', donn),
  // Onsdag
  t(3, '08:00', '09:00', akademiet),
  t(3, '09:00', '10:30', start('Kvinner', K.trond)),
  t(3, '10:30', '12:30', aLag),
  t(3, '12:30', '14:00', gatelag),
  t(3, '14:00', '16:00', start('Start 2', K.johan)),
  t(3, '16:00', '17:30', start('G17', K.johan)),
  t(3, '17:30', '19:00', start('G15 / Kvinner 2', K.johan)),
  t(3, '19:00', '20:30', donn),
  t(3, '20:30', '22:00', gimle),
  // Torsdag
  t(4, '08:00', '09:30', kkg),
  t(4, '10:30', '12:30', aLag),
  t(4, '16:00', '17:30', start('Kvinner', K.trond)),
  t(4, '17:30', '19:00', start('G17 / G14', K.johan)),
  t(4, '19:00', '20:30', gimle),
  t(4, '20:30', '22:00', donn),
  // Fredag
  t(5, '10:30', '12:30', aLag),
  t(5, '12:30', '14:00', gatelag),
  t(5, '14:30', '16:30', start('Kvinner / Matta', K.trond)),
  t(5, '16:30', '18:00', start('Start 2 / G17', K.johan)),
  t(5, '18:00', '19:30', start('G14 / G15', K.johan)),
  // Lørdag
  t(6, '09:00', '10:30', start('Kvinner', K.trond)),
  t(6, '10:30', '12:30', aLag),
  t(6, '12:30', '20:30', start('UA kamp', K.sebastian)),
  // Søndag
  t(7, '10:00', '13:00', gimle),
  t(7, '13:00', '14:30', start('Kvinner 2', K.trond)),
  t(7, '14:30', '15:30', { klubb: 'Finns.Fairway', lag: null, ...K.ff }),
];
