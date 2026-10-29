# NEXUS OS

Een modulair, persoonlijk ecosysteem voor web, Windows, Android en smartwatch. Zie het projectdocument (v0.3) voor visie en roadmap.

Deze repository bevat versie **0.7**: een webdesktop met vensterbeheer, een mobiele weergave voor de OnePlus 15R, notities die offline werken en via een account synchroniseren, de thema's **NEXUS Focus** en **NEXUS Pulse**, en **NEXUS Connect**: gekoppelde apparaten en end-to-end versleutelde meldingen van je gsm naar je pc en van NEXUS naar je gsm en horloge. De webapp is als PWA installeerbaar en er is een Windows-app. Sinds 0.7 is er ook **NEXUS AI**, een assistent die acties pas uitvoert na je toestemming, plus herinneringen en ontwikkelaarstools.

## Structuur

```
apps/web                React + TypeScript + Vite + Tailwind webapp (PWA)
apps/desktop            Windows-app (Tauri) rond dezelfde interface
apps/android-companion  Kotlin-app die gekozen Android-meldingen versleuteld doorstuurt, en in wear/ de horloge-app
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
5. **Database-check**: voer ook `20261029090000_schema_check.sql` uit. Daarna toont **Account** (als je aangemeld bent) welke SQL-stappen nog ontbreken, in de juiste volgorde, met per stap een knop **SQL kopiëren**. Zonder die stap kijkt NEXUS alleen na welke tabellen bestaan. Wie een nieuwe migratie toevoegt, zet ze ook in `SCHEMA_STEPS` in `packages/core/src/schemaCheck.ts` (een test controleert dat elk bestand bestaat).
6. Optioneel: zet onder Authentication > Sign In / Providers > Email "Confirm email" uit, dan kun je met een wachtwoord een account maken zonder bevestigingsmail. De ingebouwde mailservice van Supabase verstuurt maar een paar mails per uur.

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

### Horloge-app (Wear OS)

`apps/android-companion/wear` is een eigen app voor een Wear OS-horloge (Wear OS 4 of nieuwer, zoals de OnePlus Watch). GitHub Actions bouwt ze samen met de companion en zet `nexus-watch.apk` bij dezelfde [release](https://github.com/nahte-28/Nexus-OS/releases). Het horloge wordt een NEXUS Connect-apparaat van zichzelf, met een eigen sleutel in de keystore van het horloge: NEXUS stuurt het hetzelfde versleutelde vangnet als een gsm met de companion, en het horloge zet er zelf wekkers voor. Zo komen deadlines, herinneringen, afspraken, de Dagstart en flows met een melding naar de gsm ook op je pols als je gsm uit staat of ver weg is, zolang het horloge wifi of verbinding via de gsm heeft om het vangnet op te halen. Anders dan op de gsm wacht het horloge niet twee minuten op NEXUS: het toont een melding op het moment zelf, en de kopie die NEXUS daarna stuurt, verschijnt niet nog eens. Op het scherm zie je wat eraan komt.

De app staat niet in de Play Store. Installeren gaat met ADB vanaf je pc:

1. Zet op het horloge de ontwikkelaarsopties aan (Instellingen › Systeem › Over › tik zeven keer op het buildnummer) en zet daarin **ADB-foutopsporing** en **Draadloze foutopsporing** aan. Horloge en pc moeten op hetzelfde wifi zitten.
2. Installeer op de pc de [Android SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools) en download `nexus-watch.apk` van de release.
3. Gebruik niet de wifi van school: die laat toestellen niet met elkaar praten. De hotspot van je gsm (2,4 GHz) werkt wel, met Bluetooth op het horloge uit, zodat het echt via wifi verbindt. Open cmd in de map `platform-tools`. Tik bij Draadloze foutopsporing op **Koppelen met code** en typ op de pc `adb pair <ip>:<poort>` met het adres en de code van het horloge. Daarna `adb connect <ip>:<poort>` (het adres dat bovenaan Draadloze foutopsporing staat, met een andere poort dan bij het koppelen en zonder spatie na de dubbele punt) en `adb install -r nexus-watch.apk`.
4. Open NEXUS op het horloge, log in met je account en sta meldingen toe. In Apparaten op je pc staat het horloge dan met "(horloge)" achter de naam.

**Afvinken op het horloge**: onder een deadline of gewoonte in de lijst staat **✓ Afvinken**. Het horloge stuurt dat versleuteld naar elke NEXUS op een pc of in een browser (een `action`-bericht, `ActionPayload` in `packages/core/src/connect.ts`); de eerste die openstaat, zet de deadline op klaar of vinkt de gewoonte voor die dag af, en dat synct dan naar je andere apparaten. Twee keer afvinken verandert niets. Staat NEXUS nergens open, dan gebeurt het zodra je het opent (berichten blijven een dag op de server).

**Focus op het horloge**: in de app op het horloge start je onder **Focus** een focus-timer: 25 minuten focus en 5 minuten pauze, steeds opnieuw tot je op Stoppen tikt. Het horloge trilt en toont een melding bij elke wissel, ook met het scherm uit (een exacte wekker). Elke volle focusronde gaat versleuteld naar NEXUS (`action: 'focus'`) en telt mee in het focuslogboek van Studie en Inzichten op elk apparaat waar NEXUS openstaat.

**Tegel en complicatie**: veeg vanaf je wijzerplaat naar links en voeg de tegel **NEXUS** toe (houd een tegel ingedrukt › +). Je ziet dan de volgende drie meldingen met hun tijd, en met een tik open je de app. Op wijzerplaten die complicaties van andere apps toelaten, kies je bij een complicatie **NEXUS: wat eraan komt**: kort toont de tijd van de volgende melding, lang ook de titel. Niet elke wijzerplaat van OnePlus laat dat toe. Beide werken zichzelf bij als er een nieuw vangnet binnenkomt, en minstens elk kwartier.

Een nieuwe versie installeer je op dezelfde manier over de vorige heen; de app werkt zichzelf niet bij. Krijg je meldingen nu dubbel op je horloge (via Chrome of de companion op de gsm én via de horloge-app), zet dan in de OHealth-app de meldingen van Chrome of NEXUS Companion uit. Op de achtergrond haalt het horloge elk halfuur op wat NEXUS stuurde; met de app open is het live verbonden.

### Web-push (gsm zonder companion)

Kan de companion niet op je gsm (bijvoorbeeld door ouderlijk toezicht), open NEXUS dan in Chrome op de gsm, meld je aan en kies in Apparaten "Meldingen aanzetten". De pc versleutelt het vangnet dan per melding voor die browser en zet het in `push_schedule`; elke minuut stuurt Supabase (pg_cron + pg_net) wat aan de beurt is naar `/api/push`, dat de gsm via Chrome wekt. De service worker (`apps/web/public/push-sw.js`) ontsleutelt de melding met de sleutel van het toestel en toont ze, ook als NEXUS dicht is; Chrome geeft ze door aan het horloge. De server ziet alleen versleutelde inhoud en de `ref`. Meldingen komen tot een minuut na het tijdstip. Eenmalig instellen: Developer › Web-push maakt de sleutels voor Vercel (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_SECRET`) en de SQL-regel voor `nexus_private.push_config`, na de migratie `supabase/migrations/20261021100000_push.sql`.

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
- **Google Agenda**: plak het "Geheime adres in iCal-indeling" (Google Agenda op een computer, Instellingen, je agenda, "Agenda integreren"). De afspraken verschijnen in de Agenda en de Dagstart, en de Studieplanner plant eromheen. NEXUS leest alleen, haalt de agenda elke paar uur opnieuw op en herhaalt terugkerende afspraken zelf; hele dagen tellen niet mee. Het adres gaat mee met je profielen, dus geen SQL nodig.
- **Automatisch**: School Mode op een tijdschema (standaard ma–vr 08:30–18:00). Na het schema gaat NEXUS terug naar het profiel dat je ervoor koos, anders naar het standaardprofiel. Open vensters blijven altijd open.
- **Meldingen**: een stil profiel toont gsm-meldingen alleen in Meldingen; apps die je toevoegt bij "Altijd doorlaten" geven toch een pop-up. Herinneringen gaan altijd af.
- **Apparaten**: met een account gaan profielen mee naar je andere toestellen, of je houdt ze per toestel apart.

Instellen (eenmalig):

- Voer `supabase/migrations/20261020100000_settings.sql` uit in de SQL Editor van Supabase, voor het synchroniseren tussen toestellen.
- Voer ook `supabase/migrations/20261020140000_flows.sql` uit, voor Flow Studio op al je apparaten.
- Optioneel in Vercel: `NEXUS_CALENDAR_HOSTS` (standaard `apih.ap.be`), de adressen waarvan `api/calendar.ts` een agendalink mag ophalen. Het iCal-adres van Google Agenda (`calendar.google.com/calendar/ical/...`) mag altijd.

Beperkingen: NEXUS kan alleen zijn eigen meldingen stil zetten, niet die van andere apps op je gsm of horloge, en een webapp ziet niet welke andere apps er draaien. Wisselen op basis van een app of agenda-afspraak zit er daarom nog niet in. KlasHub opent in je browser (ook vanuit de Windows-app), omdat de site niet ingesloten mag worden.

## Flow Studio (beta)

Automatiseringen als **Wanneer → Alleen als → Doe dit**, in de app **Flow Studio** (aan of uit onder Instellingen › Beta):

- **Wanneer**: op een vast tijdstip (dagen en uur), een deadline komt eraan (je herinneringen), een gekoppeld apparaat is offline, er is een update van de Windows-app, in Financiën een budget raakt op (vanaf een percentage, één keer per budget per maand), een abonnement wordt binnenkort betaald, of je voegt zelf een uitgave vanaf een bedrag toe (imports uit je bank tellen niet), of met de hand.
- **Alleen als**: een profiel is actief, tussen twee uren, dit apparaat is online. Alle voorwaarden moeten kloppen.
- **Doe dit** (hoogstens 5): een profiel activeren (via Profiles), een melding sturen (hier of via NEXUS Connect ook op gsm en horloge), voorstellen om een app te openen, voorstellen om de update te installeren. Flows openen nooit zelf apps en installeren nooit zelf iets: een voorstel staat op het dashboard tot je kiest.
- Tabs: **Mijn flows** (aan/uit, uitvoeren, dupliceren, verwijderen met bevestiging), **Sjablonen** (School Start, Deadline eraan, Update-moment, Apparaat offline, Studiesessie, Budget bijna op, Grote uitgave), **Bouwer** (stappen met proefrun, ongedaan maken en opnieuw), **Runs** (wat elke run deed en waarom iets mislukte) en **Instellingen** (synchroniseren, alles pauzeren, stille uren).

Hoe het loopt: zolang NEXUS open is op het apparaat (de Windows-app in het systeemvak is het betrouwbaarst), elke 30 seconden en meteen na slaap of terugkeren naar het venster. Elke gebeurtenis loopt hoogstens één keer per flow, ook na herladen; een gemist tijdstip wordt tot een halfuur later nog ingehaald. Hoogstens 6 runs per flow per uur. Tijden volgen de tijdzone van het apparaat, ook rond de overgang naar zomer- en wintertijd.

Sync: met een account staan flows, pauzeren, stille uren en de runs op al je apparaten (tabellen `automation_flows` en `automation_runs` en de sleutel `flows` in `user_settings`, met RLS; voer daarvoor eenmalig `supabase/migrations/20261020140000_flows.sql` uit in de SQL-editor van Supabase). Per flow wint de nieuwste wijziging, ook een verwijdering. Elke gebeurtenis loopt op één apparaat: wie ze eerst in `automation_runs` zet, voert ze uit, de andere apparaten slaan ze over. Zonder verbinding voert het apparaat ze zelf uit, zodat een herinnering nooit op het netwerk wacht. Je account bewaart van een run alleen welke flow, het soort gebeurtenis en actie, het apparaat en de uitkomst, nooit de titel van een deadline of de tekst van een melding. Uitzetten per apparaat kan in Flow Studio › Instellingen.

Beperkingen: een gesloten browser of PWA voert niets uit; daarvoor is een server nodig, dat zit er nog niet in. "Op het apparaat dat de flow uitvoert" is het eerste apparaat dat het moment ziet, meestal de pc als die aanstaat.

## NEXUS Life

De app **Agenda** zet je lessen, deadlines, afspraken en projecten samen. **Overzicht** toont wat te laat is en daarna de komende zeven dagen: de lessen uit je lesrooster (of uit de agendalink van school, die dan voorgaat), je deadlines met een vinkje om ze af te werken, je afspraken en je herinneringen. In **Afspraken** plan je een afspraak met begin, einde, plaats en een melding vooraf. In **Deadlines** maak je een deadline met tijdstip, project, notities en wanneer je een melding wilt (1 week, 2 dagen, 1 dag, 3 uur of 1 uur ervoor, of op het moment zelf), alleen op dit apparaat of ook op gsm en horloge. **Projecten** groepeert deadlines, bv. per vak, met een kleur en de voortgang; een project verwijderen laat de deadlines staan.

Deadlines werken offline (IndexedDB) en syncen met een account zoals notities, in de tabel `life_items` met RLS. Voer daarvoor eenmalig `supabase/migrations/20261027090000_life.sql` en `20261027120000_life_appointments.sql` uit in de SQL Editor van Supabase. De meldingen gaan via hetzelfde vangnet als herinneringen: elk apparaat met NEXUS open stuurt ze, en de gsm krijgt ze vooraf (companion of web-push), zodat ze ook komen als de pc uit staat. Dezelfde `ref` zorgt dat je ze maar één keer ziet. Flow Studio en het Dashboard zien je deadlines ook.

## Studieplanner

De app **Studie** heeft een **focustimer** (pomodoro: standaard 25 minuten focus, 5 minuten pauze, na 4 rondes 15 minuten). De timer loopt door als je het venster sluit, toont hoeveel je vandaag en deze week gefocust hebt, en stuurt aan het einde van elke ronde een melding, als je wilt ook op gsm en horloge. **Planning** verdeelt de tijd die je nog nodig hebt voor je open deadlines over je vrije uren (standaard weekdagen 17–21 u en het weekend 10–17 u), buiten je lessen en afspraken en altijd voor de deadline. Met "In Agenda zetten" komen de blokken als afspraken in de Agenda; opnieuw plannen vervangt de vorige blokken. De timer, schattingen en uren blijven op het apparaat.

**Examens** (Examenplanner): per examen het vak (voorstellen uit Cijfers), datum en uur, duur, lokaal, hoeveel studietijd je nodig hebt en eventueel een stapel Leerkaarten. Elk examen komt als afspraak in de Agenda met herinneringen de dag ervoor en een uur ervoor (ook op gsm). Focustijd waarvan de taak de naam van het vak bevat, telt af van de studietijd; Planning spreidt wat overblijft over de dagen voor het examen (studeren stopt de avond ervoor). Examens syncen met een account (sleutel `exams` in `user_settings`); voer daarvoor eenmalig `supabase/migrations/20261028120000_exams_journal.sql` uit in de SQL Editor van Supabase.

**Groep** (Studiegroep): maak een groep en stuur de uitnodigingscode (bv. `ABCD-EF23`) naar je vrienden, of word lid met de code die je kreeg. Per deadline, examen of geplande studietijd vink je aan wat de groep mag zien; gewone afspraken, notities en je e-mailadres blijven privé (de groep ziet alleen de naam die je kiest). NEXUS houdt wat je deelt gelijk met je Agenda: verschuif of vink je iets af, dan ziet de groep dat; verwijder je het, dan verdwijnt het uit de groep. Een deadline van een vriend zet je met **In mijn Agenda** bij je eigen deadlines. Verlaat je een groep, dan gaat wat je er deelde mee. Hoogstens 30 leden per groep en 10 groepen die je zelf maakt. Dit staat niet end-to-end versleuteld in Supabase (tabellen `study_groups`, `study_group_members`, `study_group_items`, met RLS: alleen leden lezen een groep en ieder schrijft alleen zijn eigen rijen; lid worden kan alleen met de code). Voer eenmalig `supabase/migrations/20261028140000_study_groups.sql` uit in de SQL Editor van Supabase.

De studiegroep werkt **live** bij: wat een lid deelt, afvinkt of toevoegt, verschijnt meteen op de open apparaten van de anderen (Supabase Realtime, met dezelfde RLS; verwijderingen komen met de controle om de minuut). **Groepsdeadlines** zijn deadlines voor de hele groep, bv. een groepsopdracht: elk lid vinkt ze voor zichzelf af en je ziet "2 van 4 klaar" met de namen. Wie de groepsdeadline toevoegde, kan ze verwijderen; met **In mijn Agenda** zet je ze bij je eigen deadlines (met herinneringen). Hoogstens 100 groepsdeadlines per groep. Daarvoor is ook `supabase/migrations/20261029120000_study_groups_live.sql` nodig; de Database-check in Account toont of die al uitgevoerd is.

## Dagboek

De app **Dagboek** (in Persoonlijk, na Gewoontes): per dag je stemming (vijf gezichtjes) en een korte notitie. Je ziet hoeveel dagen op rij je schreef, je stemming per week (ook in **Inzichten**) en kunt eerdere dagen openen en doorzoeken. Een dag zonder stemming en notitie wordt gewist. Met een account synct het dagboek (sleutel `journal` in `user_settings`, met RLS); dezelfde migratie als de Examenplanner: `supabase/migrations/20261028120000_exams_journal.sql`. NEXUS AI krijgt het dagboek nooit.

## Bestanden en studiehulp

De app **Bestanden** heeft twee delen. **Mijn bestanden** bewaart je eigen bestanden (tot 10 MB per bestand) in NEXUS: offline op het apparaat en, met een account, in je eigen privéopslag in Supabase (bucket `nexus-files`, één map per gebruiker, met RLS), zodat ze op al je apparaten staan. **Op deze pc** opent mappen van je computer via de File System Access API (Chrome, Edge en de Windows-app); NEXUS leest alleen de mappen die je kiest en verandert er niets in. Op een gsm kies je losse bestanden.

Openen toont pdf's, afbeeldingen en tekst, en van Word (.docx) en PowerPoint (.pptx) de tekst zonder opmaak. Een gsm die geen pdf binnen een pagina kan tonen, opent hem in je pdf-app. Bij een pdf, Word-bestand (.docx) of tekstbestand maakt **AI-samenvatting** met NEXUS AI een eigen samenvatting om mee te studeren, met als je wilt aanvullingen en feedback op de samenvatting zelf. Het resultaat komt in Notities. Het bestand gaat alleen voor die vraag naar `/api/study` en Claude, en wordt daar niet bewaard; pdf's tot 3 MB (de grens van een aanvraag op Vercel). Eenmalig instellen: `supabase/migrations/20261027130000_files.sql` in de SQL Editor van Supabase.

## Cijfers

De app **Cijfers** houdt je punten per vak bij, zoals op AP Hogeschool: elk vak heeft studiepunten en onderdelen (examen, labo, project) die elk voor een deel meetellen. Punten zijn op 20 (een onderdeel mag ook op bv. 50 staan) en je bent geslaagd vanaf 10/20. Per vak zie je je punt tot nu toe en wat je gemiddeld nog nodig hebt op de rest om je doel te halen. Bovenaan staat je gemiddelde, gewogen met de studiepunten, en hoeveel studiepunten je al behaald hebt. Je cijfers werken offline en gaan met een account mee naar je andere apparaten. Eenmalig instellen: `supabase/migrations/20261027150000_grades_habits.sql` in de SQL Editor van Supabase (dat geldt ook voor Gewoontes).

## Gewoontes

De app **Gewoontes** is voor wat je op vaste dagen wilt doen, zoals 30 minuten studeren of sporten. Je vinkt het per dag af en ziet je reeks (dagen op rij, alleen de dagen waarop het moet) en je week. Wil je, dan krijg je op je gsm en horloge een herinnering op een uur dat je kiest, maar alleen als je het die dag nog niet hebt afgevinkt. Ook dat zit in het vangnet van je gsm, dus het werkt als NEXUS dicht is. Gewoontes gaan met een account mee naar je andere apparaten (zelfde SQL als Cijfers).

## Dagstart

Elke ochtend (standaard om 07:30, elke dag) krijg je één melding met je dag: je lessen (uit de agendalink van school of je lesrooster), afspraken, deadlines en herinneringen van die dag, en de open deadlines van de drie dagen erna. Je stelt het in de **Agenda** in, op het tabblad **Dagstart**: aan of uit, het uur, de dagen, of het naar je gsm en horloge gaat of alleen naar het apparaat waar NEXUS openstaat, en of een lege dag een melding krijgt. Daar zie je ook een voorbeeld en stuur je een proef. De instellingen gaan mee met je profielen naar al je apparaten, dus er is geen SQL nodig.

De melding staat in het vangnet van je gsm (companion en web-push), net als herinneringen en deadlines. Ze komt dus ook als NEXUS dicht is, zolang NEXUS in de drie dagen ervoor ergens openstond. Staat NEXUS die ochtend open, dan stuurt het de melding zelf; je gsm toont ze maar één keer.

## Leerkaarten

De app **Leerkaarten** is voor flashcards, in stapels per vak. Je maakt kaarten zelf, of NEXUS AI maakt ze uit een notitie of een bestand (pdf, Word of tekst): je kiest hoeveel, eventueel met een wens, en vinkt aan welke je houdt. Bij het oefenen zie je eerst de vraag, dan het antwoord, en zeg je hoe goed je het wist (Opnieuw, Moeilijk, Goed, Makkelijk; ook met spatie en 1 tot 4). Een kaart die je kent komt pas na 1, 3, 8, 20… dagen terug, een kaart die je vergeet nog in dezelfde ronde (spaced repetition). Je kaarten werken offline en gaan met een account mee naar je andere apparaten. Eenmalig instellen: `supabase/migrations/20261027160000_flashcards.sql` in de SQL Editor van Supabase. NEXUS AI gebruikt dezelfde toegang als de assistent.

## Inzichten

De app **Inzichten** toont hoe je laatste acht weken liepen: je focustijd met de Studie-timer, hoe vaak je je gewoontes deed en hoeveel deadlines je op tijd afwerkte, elk als staafjes per week (beweeg over een week voor het getal, of open de tabel). Bovenaan staan deze week en het verschil met vorige week, je sterkste gewoonte en je gemiddelde of je leerkaarten. Alles wordt op het apparaat berekend uit de andere apps; er is geen SQL nodig.

## Financiën

De app **Financiën** (in het profiel Persoonlijk) is je persoonlijke budgetbeheer, volgens het ontwerp "NEXUS Finance". Alles typ je zelf in: er is geen bankkoppeling en NEXUS betaalt of zegt niets op. De app heeft zeven tabs:

- **Overzicht**: per maand je uitgaven, inkomsten en het saldo van de maand, je budgetten, uitgaven per categorie, komende betalingen en spaardoelen.
- **Transacties**: uitgaven, inkomsten en terugbetalingen toevoegen, bewerken, zoeken, filteren op maand, soort en categorie, en exporteren als CSV. Een terugbetaling verlaagt de uitgaven van haar categorie. Met **Importeren uit CSV** lees je de CSV-export van je bank in (KBC, Belfius, BNP Paribas Fortis, ING, Argenta…): NEXUS zoekt zelf de kolommen voor datum, bedrag en omschrijving (je kunt ze wijzigen), raadt de categorie uit de omschrijving en toont alles eerst. Wat er al staat, is niet aangevinkt, en hetzelfde bestand twee keer importeren geeft geen dubbels. Het bestand blijft op het apparaat.
- **Budgetten**: een grens per maand voor al je uitgaven samen of per categorie. Je kiest bij welke drempel je de eerste melding krijgt (standaard 80%), en bij 100% krijg je de tweede. Elke melding komt één keer per maand, hier en op je gsm. Vink je aan dat het overschot doorschuift, dan komt wat aan het einde van de maand overblijft bij het budget van de volgende maand; meer uitgeven dan je budget wordt geen schuld.
- **Sparen**: spaardoelen met een doelbedrag en optioneel een datum. Je ziet hoeveel je per maand opzij moet zetten om op tijd te zijn.
- **Abonnementen**: vaste kosten met hun frequentie en volgende betaaldatum, en een herinnering om 09:00 (op de dag zelf of tot een week ervoor), ook als NEXUS dicht is via het gsm-vangnet. "Betaald" zet de betaling bij je transacties. Daaronder **Vaste bedragen**: loon, zakgeld of huur die elke keer hetzelfde zijn, komen op hun datum vanzelf bij je transacties (gemiste keren na een lange pauze hoogstens 12; een verwijderde komt niet terug, want elke keer heeft een vaste id per datum).
- **Inzichten**: inkomsten en uitgaven per maand over 6 of 12 maanden, per categorie, en deze maand tegenover vorige maand.
- **Instellingen**: meldingen aan of uit, bedragen verbergen op een apparaat, alles exporteren als JSON en alles verwijderen.

De kaart **Financiën** op het dashboard toont alleen percentages, nooit bedragen. In Zoeken overal (Ctrl+K) staan de acties "Transactie toevoegen", "Open budgetten", "Nieuw spaardoel" en "Abonnement toevoegen". NEXUS AI en het Weekoverzicht lezen je financiën niet. Bedragen worden bewaard in eurocenten.

Je financiën synchroniseren via Supabase als één rij per gebruiker in `user_settings` (sleutel `finance`), met dezelfde row level security als Cijfers en Gewoontes. Voer daarvoor `supabase/migrations/20261028100000_finance.sql` uit in de SQL Editor (New query, plak, Run). Zonder die stap blijft alles op het apparaat. Financiën vervangt de eerdere app Budget: wat daar stond (transacties en maandbudget, op het apparaat en in je account) neemt Financiën één keer over, het maandbudget als Totaalbudget.

Flow Studio kan starten op een budget dat opraakt, een abonnement dat betaald wordt en een nieuwe uitgave (zie Flow Studio). **Delen**: vrienden (alleen hun naam) en kosten die je met hen deelt, gelijk verdeeld. Je ziet per vriend wie wie hoeveel schuldig is (alleen tussen jou en elke vriend), met "Terugbetaald" om quitte te staan; jouw deel komt als uitgave in je transacties. In **Inzichten** staat ook **Advies van NEXUS AI**: tips voor deze of een van de twee vorige maanden, bewaard in Notities als "Geldadvies <maand>". Het gaat via `/api/review` (met `kind: "finance"`, dezelfde toegang als NEXUS AI) en de AI krijgt alleen totalen per categorie, budgetten, abonnementen, vaste bedragen, spaardoelen en gedeelde totalen, nooit omschrijvingen van transacties of namen van vrienden. Nog niet gebouwd: een bankkoppeling.

## Weekoverzicht

Op zondagavond (vanaf 19:00) kijkt NEXUS AI terug op je week en maakt het een plan voor volgende week: wat goed ging en wat bleef liggen, wat eraan komt en per dag één of twee concrete acties rond je lessen. Het komt in **Notities** als "Weekoverzicht week N", en je gsm krijgt een melding als het klaar is. Stond NEXUS zondag nergens open, dan gebeurt het maandagochtend nog. In de **Agenda**, op het tabblad **Week**, zie je welke feiten de AI krijgt (lessen, deadlines, afspraken, focustijd van de Studie-timer, gewoontes en cijfers; geen notities of bestanden), maak je het overzicht met de hand, met een wens erbij, en zet je de zondag uit. Het gebruikt dezelfde toegang als NEXUS AI (`ANTHROPIC_API_KEY` en `NEXUS_AI_ALLOWED_EMAILS`); er is geen SQL nodig.

## Snelle notitie

Met **Alt+N** (of de potloodknop naast Zoeken) typ je snel iets weg zonder een app te openen. NEXUS raadt of het een notitie, een deadline of een herinnering is en leest een Nederlandse datum en tijd uit de tekst: "Verslag labo indienen vrijdag" wordt een deadline tegen vrijdag 23:59, "Mama bellen morgen om 14u" een herinnering morgen om 14:00 op je gsm. Je kunt de soort en het tijdstip nog aanpassen voor je bewaart (Ctrl+Enter). Op je gsm, met NEXUS geïnstalleerd als app, houd je het icoon ingedrukt voor **Snelle notitie**, of deel je tekst of een link uit een andere app naar NEXUS. Er is geen SQL nodig.

**Spraaknotitie**: met de knop **Inspreken** in Snelle notitie zeg je je notitie in plaats van ze te typen ("mama bellen morgen om 14u"). Wat je zegt, verschijnt in het tekstvak en NEXUS raadt de soort zoals bij typen. Op je gsm houd je het NEXUS-icoon ingedrukt en kies je **Spraaknotitie**, dan luistert het meteen. De browser herkent de spraak zelf: in Chrome gaat het geluid daarvoor naar Google, dus het werkt alleen online, en NEXUS bewaart of verstuurt zelf geen geluid. In de Windows-app is er geen knop; daar klik je in het tekstvak en druk je op Windows+H.

## Zoeken overal

Met **Ctrl+K** (Cmd+K op een Mac), het vergrootglas in de taakbalk of rechtsboven op je gsm zoek je in één venster door je notities (titel en tekst), bestanden, deadlines, afspraken, projecten, herinneringen en apps. Hoofdletters en accenten tellen niet mee, en elk woord moet voorkomen. Met de pijltjes kies je, Enter opent het resultaat in zijn app; een notitie gaat meteen open in Notities. Zoeken gebeurt op het apparaat, er gaat niets naar een server.

## Rondleiding

Op een nieuw apparaat (nog niet aangemeld, nog geen notities of Agenda) opent NEXUS één keer een **rondleiding**: aanmelden, meldingen toestaan, gsm en horloge koppelen, lesrooster in Profielen. Elke stap heeft een knop en toont ✓ zodra hij in orde is. Bestaande installaties krijgen ze niet vanzelf; starten kan altijd in **Instellingen > Rondleiding**.

## Back-up

In **Instellingen > Back-up** maak je met **Back-up maken** één JSON-bestand met al je gegevens: notities, Agenda (deadlines, afspraken, projecten), herinneringen, bestanden (optioneel), Cijfers, Gewoontes, Leerkaarten, Financiën, Examens, Dagboek, Profielen, flows en het focuslogboek. Met **Back-up terugzetten…** zet je zo'n bestand terug, ook op een ander apparaat of account. Eerst toont NEXUS wat erin zit, dan voegt het samen: per item wint de nieuwste versie en wat alleen op het apparaat staat, blijft; Profielen nemen de instellingen uit de back-up over. Teruggezette items syncen daarna gewoon naar je account. De sleutels van NEXUS Connect en wat je in een studiegroep deelt, gaan er bewust niet in. Het bestand is niet versleuteld: bewaar het veilig. Formaat en controle: `packages/core/src/backup.ts`.

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
- Web-push: meldingen op een gsm met NEXUS in Chrome, ook als NEXUS daar gesloten is.
- NEXUS Life: agenda met lessen, deadlines, afspraken en projecten, offline en gesynct, met meldingen vooraf.
- Bestanden: eigen bestanden op al je apparaten, mappen van je pc, en AI-samenvattingen met feedback.
- Profielen wissel je in de app Profielen.
- Studieplanner: focustimer, examenplanner en studieblokken voor je deadlines en examens.

Nog niet klaar: een eigen Wear OS-app, en deadlines toevoegen via NEXUS AI.
