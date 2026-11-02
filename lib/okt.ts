// Id for en nettleser-økt på bookingsiden: tilfeldig, 16–64 tegn.
export const gyldigOkt = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(v);
