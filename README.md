# Finns.Fairway – vinteråpen Sparebanken Norge Arena

Bookingsystem for ledige timer på Sparebanken Norge Arena (SNAK) i Kristiansand,
høst/vinter 2026/27. Klubbenes faste treningstider er sperret automatisk, og
alt som er ledig kan bookes som halv eller hel bane, én time om gangen fra
08:00 til siste time 22:00–23:00.

## For de som booker

Kalenderen følger samme mønster som mer.golf:

- **Ukenavigasjon** med piler og **dagbrikker** for uka. Dager uten ledig tid
  er grået ut, og en prikk viser dager der du har valgt timer.
- **Tidslinje** for valgt dag. Hver ledig time har to knapper: «Hel» og
  «Halv» med pris. Trykk for å velge, trykk igjen for å fjerne, eller trykk
  den andre for å bytte. Er bare halv bane ledig, vises bare den knappen.
  Opptatte timer står i grått.
- **Fast hver uke**: brikker for mandag–søndag og samme rader, med hvor mange
  uker tiden er ledig. Ett trykk tar alle de ukene. Uker som allerede er tatt
  vises under raden med et forslag (halv bane samme tid, ellers nærmeste
  ledige time samme dag) som kan legges til med ett trykk.
- Alt du velger samles i bunnlinjen. Oppsummeringen slår sammen
  sammenhengende og ukentlige timer.
- Bestillingen sendes som en forespørsel med referanse (SNAK-XXXXX) og blir
  bindende når betalingen er mottatt med Vipps.

### Halvtimer

Alt kan bookes i hele timer eller halvtimer. En halvtime koster halvparten av
timeprisen (hel bane 995 kr, halv bane 745 kr med dagens priser). Halvtimer
rundt klubbtidene, som 12:00–12:30 før en klubb starter 12:30, vises og kan
bookes for seg. En helt ledig time kan deles i to halvtimer med «Del i
halvtimer». I backoffice velges start (hel eller halv time) og lengde
(30 min eller 1 time) når en booking legges inn eller endres.

### Førstemann til mølla

Timene du velger holdes av til deg i 10 minutter, og andre ser dem som
opptatt. Hvis to velger samme time nesten samtidig, avgjør databasen hvem
som var først, og den andre får beskjed med en gang. Mens skjemaet fylles
ut, fornyes holdet. Når bestillingen sendes, blir de holdte timene en
booking i samme operasjon, så ingen kan snike seg imellom. Lukkes siden,
slippes timene med en gang.

## Backoffice (`/admin`)

Hver person logger inn med egen e-post og passord, og har én av to tilganger:

- **Admin**: alt under, inkludert brukere og priser.
- **Innsyn**: ser hvem som har banen, dag for dag og uke for uke (klubb,
  lag, navn og kontaktinfo med knapper for å ringe, sende SMS og e-post).
  Ingen priser og ingen endringer.

Admin legger til brukere under **Innstillinger → Brukere**. Systemet lager et
passord som vises én gang, og som admin gir videre. Der kan admin også lage
nytt passord, bytte tilgang og stenge brukere. Alle kan bytte sitt eget
passord. En stengt bruker eller en bruker med nytt passord blir logget ut med
en gang.

**Logg** (bare admin) viser alt som skjer i backoffice, nyeste først, med
hvem som gjorde det: innlogging (også mislykkede forsøk), bookinger som
bekreftes, endres, legges inn eller fjernes, klubbtider, sperringer, priser
og brukere. Nye forespørsler fra nettsiden kommer også med. Loggen kan søkes
i og filtreres på person, og kan ikke endres eller slettes.

Admin er bygget som admin i mer.golf: sidemeny på PC, fanelinje nederst på mobil.

- **Kalender**: ukeoversikt som regnearket, der hver halvtime viser hvem som
  har banen (klubbene i hver sin farge, kunder med navn, venter i oransje).
  Under: valgt dag med nøyaktige klubbtider og kontaktperson, bookinger og
  ledige timer med «+». En klubbtid kan frigis for én dag og gis tilbake.
- **Handlinger på hver booking**: Bekreft, Rediger (flytt dato/tid, bytt
  hel/halv med ny pris, endre navn og kontaktinfo for hele bestillingen),
  Fjern, og Ring / SMS / E-post med ferdig utfylt tekst.
- **Forespørsler**: alt som venter, med Bekreft alle og Avslå.
- **Bookinger**: kommende bookinger dag for dag, med nøkkeltall.
- **Klubber**: klubbenes faste tider og kontaktpersoner. Legg til, endre og
  fjern faste tider. Overlapper en ny tid med en booking, sier systemet fra.
- **Kunder**: alle som har booket, med antall timer, sum, neste booking og søk.
- **Sperringer**: sperr tid for kampdager, vedlikehold og arrangementer.
- **Priser**: pris per time for hel og halv bane, ukedag og helg. Gjelder nye
  bookinger; timer som allerede er booket beholder prisen sin.

## Endre sesong, priser og faste tider

| Hva | Fil |
|---|---|
| Priser | Admin → Priser (standard 1990/1490 i `lib/config.ts`) |
| Sesongstart og -slutt, åpningstid, stengte dager | `lib/config.ts` |
| Klubbenes faste treningstider | Admin → Klubber (startoppsett fra Ark 2 i `lib/klubbtider-start.ts`) |

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
