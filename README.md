# NEXUS OS

Een modulair, persoonlijk ecosysteem voor web, Windows, Android en smartwatch. Zie het projectdocument (v0.3) voor visie en roadmap.

Deze repository bevat versie **0.3**: een webdesktop met vensterbeheer, een mobiele weergave voor de OnePlus 15R, notities die offline werken en via een account synchroniseren, en de thema's **NEXUS Focus** en **NEXUS Pulse**. De app is als PWA installeerbaar.

## Structuur

```
apps/web         React + TypeScript + Vite + Tailwind webapp (PWA)
packages/core    Gedeelde types en logica: thema's, vensterbeheer, notities, sync
supabase         Databaseschema (migraties) voor accounts en synchronisatie
```

Later volgen `apps/desktop` (Tauri), `apps/android-companion` (Kotlin), `packages/ui` en `packages/api-client`.

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
2. Open de SQL Editor en voer `supabase/migrations/20261019000000_notes.sql` uit. Dat maakt de tabel, de toegangsregels (row-level security) en realtime aan.
3. Zet onder Authentication > URL Configuration de **Site URL** op je Vercel-adres en voeg `http://localhost:5173` en je preview-URL's (bijvoorbeeld `https://*-jouwnaam.vercel.app/**`) toe bij **Redirect URLs**. De inloglink in de mail komt anders niet terug in de app.
4. Kopieer onder Project Settings > API de project-URL en de anon/publishable key naar de omgevingsvariabelen.

## Hoe synchronisatie werkt

Elk apparaat bewaart al je notities in een lokale database (IndexedDB) en werkt dus volledig offline. Wijzigingen komen in een wachtrij en gaan naar Supabase zodra je online bent, bij het openen van de app, elke minuut en meteen wanneer een ander apparaat iets wijzigt. Bij een conflict wint de laatste wijziging; verwijderde notities worden als "tombstone" bewaard zodat de verwijdering ook andere apparaten bereikt. Row-level security zorgt dat elk account alleen zijn eigen data kan lezen of wijzigen.

## Wat werkt

- Bureaublad met startmenu (met zoeken), taakbalk, klok en app-iconen.
- Vensters verplaatsen, vergroten, minimaliseren, maximaliseren (dubbelklik op de titelbalk) en sluiten.
- Onder 768px breed: appgrid, apps op volledig scherm, onderste navigatie en de Android-terugknop.
- Notities in een lokale database, offline bruikbaar, gesynchroniseerd tussen tabbladen en (met een account) tussen apparaten.
- Aanmelden met een inloglink per e-mail, sync-status in de taakbalk en de Account-app.
- Focus- en Pulse-thema als design tokens, direct wisselbaar en onthouden.
- PWA-manifest, iconen en service worker met offline fallback.

Volgende stap is v0.4: Device Center, pushmeldingen en de Android companion, met end-to-end versleutelde meldingen.
