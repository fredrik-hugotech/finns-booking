'use client';

import { createContext, useContext } from 'react';
import { STANDARD_PRIS, type Priser } from '@/lib/config';
import { prisFor, type Bane } from '@/lib/tilgjengelighet';

// Prisene hentes fra serveren og deles med alle komponentene under.
export const PrisKontekst = createContext<Priser>(STANDARD_PRIS);

export function usePris() {
  const priser = useContext(PrisKontekst);
  return (bane: Bane, dato: string, lengde = 60) => prisFor(bane, dato, priser, lengde);
}
