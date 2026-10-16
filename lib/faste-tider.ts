// Faste treningstider for klubbene, hentet fra «Treningstider SNAK 2026/2027
// Vinteråpen arena» (Ark 2, tildelt). Disse gjentas hver uke i sesongen og
// sperrer hele banen. Ukedag: 1 = mandag … 7 = søndag. Tider i «HH:MM».

export type FastTid = {
  dag: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  fra: string;
  til: string;
  klubb: string;
  lag?: string;
};

export const FASTE_TIDER: FastTid[] = [
  // Mandag
  { dag: 1, fra: '08:00', til: '09:00', klubb: 'Akademiet' },
  { dag: 1, fra: '10:30', til: '12:30', klubb: 'IK Start', lag: 'A-lag' },
  { dag: 1, fra: '16:00', til: '16:30', klubb: 'IK Start', lag: 'Start 2' },
  { dag: 1, fra: '16:30', til: '17:30', klubb: 'Donn / IK Start', lag: 'Donn og Start 2' },
  { dag: 1, fra: '17:30', til: '20:30', klubb: 'Donn' },
  { dag: 1, fra: '20:30', til: '22:00', klubb: 'IK Gimletroll' },
  // Tirsdag
  { dag: 2, fra: '08:00', til: '09:30', klubb: 'IK Start', lag: 'Start 2 / G17' },
  { dag: 2, fra: '10:30', til: '12:30', klubb: 'IK Start', lag: 'A-lag' },
  { dag: 2, fra: '16:00', til: '17:30', klubb: 'IK Start', lag: 'Kvinner 2' },
  { dag: 2, fra: '17:30', til: '20:30', klubb: 'IK Gimletroll' },
  { dag: 2, fra: '20:30', til: '22:00', klubb: 'Donn' },
  // Onsdag
  { dag: 3, fra: '08:00', til: '09:00', klubb: 'Akademiet' },
  { dag: 3, fra: '09:00', til: '10:30', klubb: 'IK Start', lag: 'Kvinner' },
  { dag: 3, fra: '10:30', til: '12:30', klubb: 'IK Start', lag: 'A-lag' },
  { dag: 3, fra: '12:30', til: '14:00', klubb: 'Gatelag' },
  { dag: 3, fra: '14:00', til: '16:00', klubb: 'IK Start', lag: 'Start 2' },
  { dag: 3, fra: '16:00', til: '17:30', klubb: 'IK Start', lag: 'G17' },
  { dag: 3, fra: '17:30', til: '19:00', klubb: 'IK Start', lag: 'G15 / Kvinner 2' },
  { dag: 3, fra: '19:00', til: '20:30', klubb: 'Donn' },
  { dag: 3, fra: '20:30', til: '22:00', klubb: 'IK Gimletroll' },
  // Torsdag
  { dag: 4, fra: '08:00', til: '09:30', klubb: 'IK Start', lag: 'Start 2 / G17' },
  { dag: 4, fra: '10:30', til: '12:30', klubb: 'IK Start', lag: 'A-lag' },
  { dag: 4, fra: '16:00', til: '17:30', klubb: 'IK Start', lag: 'Kvinner' },
  { dag: 4, fra: '17:30', til: '19:00', klubb: 'IK Start', lag: 'G17 / G14' },
  { dag: 4, fra: '19:00', til: '20:30', klubb: 'IK Gimletroll' },
  { dag: 4, fra: '20:30', til: '22:00', klubb: 'Donn' },
  // Fredag
  { dag: 5, fra: '10:30', til: '12:30', klubb: 'IK Start', lag: 'A-lag' },
  { dag: 5, fra: '12:30', til: '14:00', klubb: 'Gatelag' },
  { dag: 5, fra: '14:30', til: '16:30', klubb: 'IK Start', lag: 'Kvinner / Matta' },
  { dag: 5, fra: '16:30', til: '18:00', klubb: 'IK Start', lag: 'Start 2 / G17' },
  { dag: 5, fra: '18:00', til: '19:30', klubb: 'IK Start', lag: 'G14 / G15' },
  // Lørdag
  { dag: 6, fra: '09:00', til: '10:30', klubb: 'IK Start', lag: 'Kvinner' },
  { dag: 6, fra: '10:30', til: '12:30', klubb: 'IK Start', lag: 'A-lag' },
  { dag: 6, fra: '12:30', til: '20:30', klubb: 'IK Start', lag: 'UA kamp' },
  // Søndag
  { dag: 7, fra: '10:00', til: '13:00', klubb: 'IK Gimletroll' },
  { dag: 7, fra: '13:00', til: '14:30', klubb: 'IK Start', lag: 'Kvinner 2' },
  { dag: 7, fra: '14:30', til: '15:30', klubb: 'Finns.Fairway' },
];
