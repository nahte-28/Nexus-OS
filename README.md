# NEXUS OS

Een modulair, persoonlijk ecosysteem voor web, Windows, Android en smartwatch. Zie het projectdocument (v0.3) voor visie en roadmap.

Deze repository bevat versie **0.5**: een webdesktop met vensterbeheer, een mobiele weergave voor de OnePlus 15R, notities die offline werken en via een account synchroniseren, de thema's **NEXUS Focus** en **NEXUS Pulse**, en **NEXUS Connect**: gekoppelde apparaten en end-to-end versleutelde meldingen van je gsm naar je pc. De webapp is als PWA installeerbaar en er is een Windows-app.

## Structuur

```
apps/web                React + TypeScript + Vite + Tailwind webapp (PWA)
apps/desktop            Windows-app (Tauri) rond dezelfde interface
apps/android-companion  Kotlin-app die gekozen Android-meldingen versleuteld doorstuurt
packages/core           Gedeelde types en logica: thema's, vensterbeheer, notities, sync, Connect
supabase                Databaseschema (migraties) voor accounts, sync en Connect
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
2. Open de SQL Editor en voer de bestanden in `supabase/migrations` in volgorde uit: eerst `20261019000000_notes.sql` (notities), dan `20261019120000_connect.sql` (apparaten en meldingen). Dat maakt de tabellen, de toegangsregels (row-level security) en realtime aan.
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

Lokaal bouwen kan met Android Studio of `./gradlew assembleDebug` in `apps/android-companion` (JDK 17 en de Android SDK nodig).

## Windows-app

`apps/desktop` verpakt dezelfde interface als de webapp in een Windows-app met [Tauri](https://tauri.app). GitHub Actions bouwt bij elke wijziging op `main` een installer en zet `nexus-os-setup.exe` bij de [releases](https://github.com/nahte-28/Nexus-OS/releases).

- Sluit je het venster, dan blijft NEXUS in het systeemvak draaien en krijg je Windows-meldingen van je gsm. Afsluiten doe je via het icoon in het systeemvak.
- In Instellingen kun je NEXUS laten starten met Windows; het start dan stil in het systeemvak.
- Inloggen gaat met e-mail en wachtwoord (een inloglink zou in de browser openen).
- De installer is nog niet digitaal ondertekend. Windows SmartScreen waarschuwt daarom; kies "Meer informatie" en "Toch uitvoeren".

Lokaal bouwen: installeer Rust en de [Tauri-vereisten](https://tauri.app/start/prerequisites/), zet de Supabase-waarden in `apps/web/.env.local` en voer `npm run dev -w @nexus/desktop` (ontwikkelen) of `npm run build -w @nexus/desktop` (installer) uit.

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

Nog niet klaar: Web Push in de browser (meldingen terwijl NEXUS helemaal gesloten is) en meldingen van NEXUS naar je gsm. Volgende stap is v0.6: meldingen op je horloge.
