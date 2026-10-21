# NEXUS OS

Een modulair, persoonlijk ecosysteem voor web, Windows, Android en smartwatch. Zie het projectdocument (v0.3) voor visie en roadmap.

Deze repository bevat versie **0.7**: een webdesktop met vensterbeheer, een mobiele weergave voor de OnePlus 15R, notities die offline werken en via een account synchroniseren, de thema's **NEXUS Focus** en **NEXUS Pulse**, en **NEXUS Connect**: gekoppelde apparaten en end-to-end versleutelde meldingen van je gsm naar je pc en van NEXUS naar je gsm en horloge. De webapp is als PWA installeerbaar en er is een Windows-app. Sinds 0.7 is er ook **NEXUS AI**, een assistent die acties pas uitvoert na je toestemming, plus herinneringen en ontwikkelaarstools.

## Structuur

```
apps/web                React + TypeScript + Vite + Tailwind webapp (PWA)
apps/desktop            Windows-app (Tauri) rond dezelfde interface
apps/android-companion  Kotlin-app die gekozen Android-meldingen versleuteld doorstuurt
packages/core           Gedeelde types en logica: thema's, vensterbeheer, notities, sync, Connect
supabase                Databaseschema (migraties) voor accounts, sync en Connect
api                     Vercel-functies op de server, nu alleen NEXUS AI (api/ai.ts)
```

Later volgen `packages/ui` en `packages/api-client`.

## Aan de slag

Vereist Node 20 of nieuwer.

```bash
npm install
npm run dev        # ontwikkelserver op http://localhost:5173
npm test           # unit- en componenttests
npm run typecheck
npm run build      # productiebuild in apps/web/dist
```

## Deployen op Vercel

Importeer de repository in Vercel. `vercel.json` regelt installatie, build en de outputmap. Elke pull request krijgt dan een preview-URL.

Zonder Supabase werkt de app volledig lokaal. Voor synchronisatie zet je in Vercel (Settings > Environment Variables) de waarden uit `.env.example`. Lokaal kopieer je `.env.example` naar `apps/web/.env.local`.

## Supabase instellen

1. Maak een project op supabase.com.
2. Open de SQL Editor en voer de bestanden in `supabase/migrations` in volgorde uit: eerst `20261019000000_notes.sql` (notities), dan `20261019120000_connect.sql` (apparaten en meldingen) en `20261020100000_settings.sql` (profielen op al je toestellen). Dat maakt de tabellen, de toegangsregels (row-level security) en realtime aan.
3. Zet onder Authentication > URL Configuration de **Site URL** op je Vercel-adres en voeg `http://localhost:5173` en je preview-URL's (bijvoorbeeld `https://*-jouwnaam.vercel.app/**`) toe bij **Redirect URLs**. De inloglink in de mail komt anders niet terug in de app.
4. Kopieer onder Project Settings > API de project-URL en de anon/publishable key naar de omgevingsvariabelen.
5. Optioneel: zet onder Authentication > Sign In / Providers > Email "Confirm email" uit, dan kun je met een wachtwoord een account maken zonder bevestigingsmail. De ingebouwde mailservice van Supabase verstuurt maar een paar mails per uur.

## Hoe synchronisatie werkt

Elk apparaat bewaart al je notities in een lokale database (IndexedDB) en werkt dus volledig offline. Wijzigingen komen in een wachtrij en gaan naar Supabase zodra je online bent, bij het openen van de app, elke minuut en meteen wanneer een ander apparaat iets wijzigt. Bij een conflict wint de laatste wijziging; verwijderde notities worden als "tombstone" bewaard zodat de verwijdering ook andere apparaten bereikt. Row-level security zorgt dat elk account alleen zijn eigen data kan lezen of wijzigen.

## NEXUS Connect

Elk apparaat (een browser, later de Windows-app, de Android companion) maakt bij het koppelen een eigen sleutelpaar. De private sleutel verlaat het apparaat nooit: in de browser staat hij niet-exporteerbaar in IndexedDB, op Android in de keystore. Een melding wordt per ontvanger versleuteld (ECDH P-256, HKDF-SHA256, AES-256-GCM; zie `packages/core/src/connectCrypto.ts`). Supabase ziet dus alleen publieke sleutels en onleesbare gegevens. De ontvanger haalt een melding op, bewaart ze lokaal en verwijdert ze van de server; wat niet wordt opgehaald, verdwijnt na een dag.

Elk apparaat toont een code van 12 tekens (bv. `E1E3-C193-16C7`). Vergelijk die op beide schermen voor je een apparaat vertrouwt. In **Apparaten** zie je alles wat gekoppeld is en kun je een apparaat intrekken; afmelden trekt het huidige apparaat in.

### Android companion

GitHub Actions bouwt de app bij elke wijziging op `main` en zet `nexus-companion.apk` bij de [releases](https://github.com/nahte-28/Nexus-OS/releases).

1. Download de APK op je gsm en installeer hem (sta installeren uit je browser of bestanden-app toe).
2. Open NEXUS Companion, controleer het adres van je NEXUS-webapp (standaard `nexus-os-lime.vercel.app`) en log in met hetzelfde account. De app haalt de Supabase-instellingen op via `/nexus-config.json` van die webapp.
3. Tik op **Meldingstoegang openen** en zet NEXUS Companion aan. Is de schakelaar grijs? Android blokkeert dat voor zelf geïnstalleerde apps: open **App-info**, tik op ⋮ en kies **Beperkte instellingen toestaan**.
4. Vink bij **Naar deze apparaten** je pc aan (vergelijk de code) en kies per app wat je deelt: uit, alleen titel, of titel en inhoud. Elke app staat standaard uit en codes in inlogberichten worden gemaskeerd.
5. Voor meldingen van NEXUS naar je gsm en horloge: sta meldingen van de companion toe en zet batterijoptimalisatie uit (knop in de app), zodat OxygenOS de live verbinding niet verbreekt. Zet in de OHealth-app de meldingen van NEXUS Companion aan om ze op je horloge te krijgen.

**Vangnet**: zolang NEXUS ergens open is, krijgt de gsm versleuteld de meldingen van de komende drie dagen die naar hem gaan: herinneringen met "ook op gsm" en flows met een melding naar de gsm die op een vast tijdstip of bij een deadline starten (alleen flows zonder voorwaarden, of met alleen "tussen twee uren", want een actief profiel of netwerk kun je niet vooraf weten). De gsm zet er wekkers voor. Komt de melding van NEXUS niet binnen twee minuten na het moment, dan toont de gsm ze zelf, met "vangnet" erbij. Komt ze later toch nog van NEXUS (de pc ging weer aan), dan verschijnt ze niet nog eens: de melding en het geplande item delen een `ref`. De companion houdt hoogstens 50 items; ze blijven na een herstart van de gsm staan.

Lokaal bouwen kan met Android Studio of `./gradlew assembleDebug` in `apps/android-companion` (JDK 17 en de Android SDK nodig).

## Windows-app

`apps/desktop` verpakt dezelfde interface als de webapp in een Windows-app met [Tauri](https://tauri.app). GitHub Actions bouwt bij elke wijziging op `main` een installer en zet `nexus-os-setup.exe` bij de [releases](https://github.com/nahte-28/Nexus-OS/releases).

- Sluit je het venster, dan blijft NEXUS in het systeemvak draaien en krijg je Windows-meldingen van je gsm. Afsluiten doe je via het icoon in het systeemvak.
- In Instellingen kun je NEXUS laten starten met Windows; het start dan stil in het systeemvak.
- Inloggen gaat met e-mail en wachtwoord (een inloglink zou in de browser openen).
- De installer is nog niet digitaal ondertekend. Windows SmartScreen waarschuwt daarom; kies "Meer informatie" en "Toch uitvoeren".

Lokaal bouwen: installeer Rust en de [Tauri-vereisten](https://tauri.app/start/prerequisites/), zet de Supabase-waarden in `apps/web/.env.local` en voer `npm run dev -w @nexus/desktop` (ontwikkelen) of `npm run build -w @nexus/desktop` (installer) uit.

## NEXUS AI

De app **NEXUS AI** praat met Claude via de serverfunctie `api/ai.ts` op Vercel. De sleutel blijft op de server; de app stuurt je login mee en de server laat alleen de accounts in `NEXUS_AI_ALLOWED_EMAILS` toe.

Claude kan acties voorstellen: notities zoeken of maken, herinneringen plannen of verwijderen, een melding naar je gsm sturen en het thema wisselen. Elke actie verschijnt als kaart en loopt pas als je op **Toestaan** tikt (of als je die actie eerder "altijd" toestond; dat kun je in de Ontwikkelaar-app weer vergeten). De acties zelf draaien in NEXUS op je apparaat, niet op de server.

Instellen (eenmalig), in Vercel bij Settings > Environment Variables:

- `ANTHROPIC_API_KEY`: een API-sleutel van [console.anthropic.com](https://console.anthropic.com). Zet daar ook een maandlimiet, want de aanvragen kosten geld.
- `NEXUS_AI_ALLOWED_EMAILS`: je eigen e-mailadres (meerdere gescheiden door komma's).
- Optioneel `NEXUS_AI_MODEL` (standaard `claude-opus-5-5`).

Daarna opnieuw deployen. De Windows-app gebruikt dezelfde functie op `nexus-os-lime.vercel.app`. Lokaal draait `/api/ai` alleen met `vercel dev`.

## Herinneringen en ontwikkelaarstools

**Herinneringen** zijn de eerste automatisering: een melding op een tijdstip, eenmalig, elke dag of elke week, alleen op dit apparaat of ook op je gsm en horloge (versleuteld via NEXUS Connect). Ze staan lokaal in IndexedDB en werken dus offline; ze gaan af zolang NEXUS open is op dat apparaat, en wat gemist werd gaat af bij de volgende start. De Windows-app in het systeemvak is daarom de beste plek. Ook NEXUS AI kan herinneringen plannen.

Zet in Instellingen de **ontwikkelaarsmodus** aan voor de app **Ontwikkelaar**: systeeminfo (versie, sync, Connect, apparaat), een logboek van wat NEXUS deed (zonder inhoud) en het AI-verbruik in tokens.

## NEXUS Profiles

Profielen (School, Persoonlijk, Gaming, Developer) bepalen het thema en de accentkleur, welke apps in de zijbalk staan en in welke volgorde, welke blokken op het dashboard staan en of gsm-meldingen een pop-up geven. Alles staat in de app **Profielen**:

- **Overzicht**: wisselen met de hand, voor een uur, tot het einde van de dag, tot het schema wisselt of tot je zelf terugschakelt.
- **Lesrooster**: lessen met de hand, of automatisch via de link van "Koppel agenda" op het AP-intranet (dezelfde die KlasHub gebruikt). Ook de KlasHub-link staat hier.
- **Automatisch**: School Mode op een tijdschema (standaard ma–vr 08:30–18:00). Na het schema gaat NEXUS terug naar het profiel dat je ervoor koos, anders naar het standaardprofiel. Open vensters blijven altijd open.
- **Meldingen**: een stil profiel toont gsm-meldingen alleen in Meldingen; apps die je toevoegt bij "Altijd doorlaten" geven toch een pop-up. Herinneringen gaan altijd af.
- **Apparaten**: met een account gaan profielen mee naar je andere toestellen, of je houdt ze per toestel apart.

Instellen (eenmalig):

- Voer `supabase/migrations/20261020100000_settings.sql` uit in de SQL Editor van Supabase, voor het synchroniseren tussen toestellen.
- Voer ook `supabase/migrations/20261020140000_flows.sql` uit, voor Flow Studio op al je apparaten.
- Optioneel in Vercel: `NEXUS_CALENDAR_HOSTS` (standaard `apih.ap.be`), de adressen waarvan `api/calendar.ts` een agendalink mag ophalen.

Beperkingen: NEXUS kan alleen zijn eigen meldingen stil zetten, niet die van andere apps op je gsm of horloge, en een webapp ziet niet welke andere apps er draaien. Wisselen op basis van een app of agenda-afspraak zit er daarom nog niet in. KlasHub opent in je browser (ook vanuit de Windows-app), omdat de site niet ingesloten mag worden.

## Flow Studio (beta)

Automatiseringen als **Wanneer → Alleen als → Doe dit**, in de app **Flow Studio** (aan of uit onder Instellingen › Beta):

- **Wanneer**: op een vast tijdstip (dagen en uur), een deadline komt eraan (je herinneringen), een gekoppeld apparaat is offline, er is een update van de Windows-app, of met de hand.
- **Alleen als**: een profiel is actief, tussen twee uren, dit apparaat is online. Alle voorwaarden moeten kloppen.
- **Doe dit** (hoogstens 5): een profiel activeren (via Profiles), een melding sturen (hier of via NEXUS Connect ook op gsm en horloge), voorstellen om een app te openen, voorstellen om de update te installeren. Flows openen nooit zelf apps en installeren nooit zelf iets: een voorstel staat op het dashboard tot je kiest.
- Tabs: **Mijn flows** (aan/uit, uitvoeren, dupliceren, verwijderen met bevestiging), **Sjablonen** (School Start, Deadline eraan, Update-moment, Apparaat offline, Studiesessie), **Bouwer** (stappen met proefrun, ongedaan maken en opnieuw), **Runs** (wat elke run deed en waarom iets mislukte) en **Instellingen** (synchroniseren, alles pauzeren, stille uren).

Hoe het loopt: zolang NEXUS open is op het apparaat (de Windows-app in het systeemvak is het betrouwbaarst), elke 30 seconden en meteen na slaap of terugkeren naar het venster. Elke gebeurtenis loopt hoogstens één keer per flow, ook na herladen; een gemist tijdstip wordt tot een halfuur later nog ingehaald. Hoogstens 6 runs per flow per uur. Tijden volgen de tijdzone van het apparaat, ook rond de overgang naar zomer- en wintertijd.

Sync: met een account staan flows, pauzeren, stille uren en de runs op al je apparaten (tabellen `automation_flows` en `automation_runs` en de sleutel `flows` in `user_settings`, met RLS; voer daarvoor eenmalig `supabase/migrations/20261020140000_flows.sql` uit in de SQL-editor van Supabase). Per flow wint de nieuwste wijziging, ook een verwijdering. Elke gebeurtenis loopt op één apparaat: wie ze eerst in `automation_runs` zet, voert ze uit, de andere apparaten slaan ze over. Zonder verbinding voert het apparaat ze zelf uit, zodat een herinnering nooit op het netwerk wacht. Je account bewaart van een run alleen welke flow, het soort gebeurtenis en actie, het apparaat en de uitkomst, nooit de titel van een deadline of de tekst van een melding. Uitzetten per apparaat kan in Flow Studio › Instellingen.

Beperkingen: een gesloten browser of PWA voert niets uit; daarvoor is een server nodig, dat zit er nog niet in. "Op het apparaat dat de flow uitvoert" is het eerste apparaat dat het moment ziet, meestal de pc als die aanstaat.

## Wat werkt

- Bureaublad met startmenu (met zoeken), taakbalk, klok en app-iconen.
- Vensters verplaatsen, vergroten, minimaliseren, maximaliseren (dubbelklik op de titelbalk) en sluiten.
- Onder 768px breed: appgrid, apps op volledig scherm, onderste navigatie en de Android-terugknop.
- Notities in een lokale database, offline bruikbaar, gesynchroniseerd tussen tabbladen en (met een account) tussen apparaten.
- Aanmelden met e-mail en wachtwoord of met een inloglink per e-mail, sync-status in de taakbalk en de Account-app.
- Apparaten: gekoppelde apparaten met code, testmelding, naam wijzigen en intrekken.
- Meldingen: wat je gsm doorstuurt, met filter per app, zoeken en een systeemmelding als NEXUS op de achtergrond staat.
- Android companion: meldingstoegang, keuze per app, pauzeknop en een logboek zonder inhoud.
- Focus- en Pulse-thema als design tokens, direct wisselbaar en onthouden.
- PWA-manifest, iconen en service worker met offline fallback.

- Windows-app met systeemvak, Windows-meldingen en starten met Windows.
- Van NEXUS naar gsm en horloge: in Apparaten stuur je een melding naar je gsm. De companion houdt een live verbinding open zolang hij meldingstoegang heeft, toont de melding als Android-melding, en de horloge-app (OHealth) zet ze door naar je OnePlus Watch.

- NEXUS AI met acties die je toestemming vragen, herinneringen naar pc, gsm en horloge, en een ontwikkelaarsmodus.

Nog niet klaar: Web Push in de browser (meldingen terwijl NEXUS helemaal gesloten is), een eigen Wear OS-app en herinneringen die ook afgaan als NEXUS nergens open is.
