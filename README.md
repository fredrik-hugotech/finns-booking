# Finns.Fairway – vinteråpen Sparebanken Norge Arena

Bookingsystem for ledige timer på Sparebanken Norge Arena (SNAK) i Kristiansand,
høst/vinter 2026/27. Klubbenes faste treningstider er sperret automatisk, og
alt som er ledig kan bookes som halv eller hel bane, én time om gangen fra
08:00 til siste time 22:00–23:00.

## For de som booker

- Velg hel eller halv bane øverst, og filtrer på ukedager og før/etter kl. 17.
- **Enkelttimer**: én linje per dag med de ledige timene som knapper. Trykk på
  så mange du vil; valgte timer samles i bunnlinjen.
- **Fast tid hver uke**: én linje per ukedag. Knappen viser hvor mange uker
  tiden er ledig (f.eks. 14/17), og ett trykk tar alle de ukene.
- Oppsummeringen slår sammen sammenhengende timer (kl. 20–22) og like timer
  hver uke («Søndager kl. 17–19, 17 ganger»).
- Bestillingen sendes som en forespørsel med referanse (SNAK-XXXXX) og blir
  bindende når betalingen er mottatt med Vipps.

## For Finns.Fairway (`/admin`)

- Forespørsler gruppert per bestilling, med «bekreft alle», «avslå» eller avlys enkelttimer.
- Ukeplan med faste klubbtider, bekreftede og ventende bookinger og sperret tid.
- Sperr tid for kampdager, vedlikehold og arrangementer.
- Nøkkeltall: ventende forespørsler, bekreftede timer, omsetning og ledige timer igjen.

## Endre sesong, priser og faste tider

| Hva | Fil |
|---|---|
| Sesongstart og -slutt, åpningstid, priser, stengte dager | `lib/config.ts` |
| Klubbenes faste treningstider (fra regnearket «Treningstider SNAK 2026/2027») | `lib/faste-tider.ts` |

## Kjøre lokalt

```bash
npm install
npm run dev
```

Uten miljøvariabler kjører appen i **demo-modus** med minnelagring, og
admin-passordet er `demo`.

## Produksjon

Kjører på Vercel med Supabase-prosjektet `finns_booking` (samme prosjekt som
fjorårets side; de gamle `bookings`-dataene er urørt).

1. `supabase/schema.sql` er kjørt i databasen. En trigger hindrer overbooking,
   også når to personer bestiller samtidig.
2. Miljøvariablene fra `.env.example` er satt i Vercel.

Tabellene er stengt for alle. API-rutene på serveren går gjennom
databasefunksjoner som krever `SNAK_API_NOKKEL`. Nettleseren får bare vite
hvilke timer som er tatt, aldri hvem som har booket.
