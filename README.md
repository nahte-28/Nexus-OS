# NEXUS OS

Een modulair, persoonlijk ecosysteem voor web, Windows, Android en smartwatch. Zie het projectdocument (v0.3) voor visie en roadmap.

Deze repository bevat versie **0.2**: een webdesktop met vensterbeheer, een mobiele weergave voor de OnePlus 15R, een notities-app en de thema's **NEXUS Focus** en **NEXUS Pulse**. De app is als PWA installeerbaar en werkt offline.

## Structuur

```
apps/web         React + TypeScript + Vite + Tailwind webapp (PWA)
packages/core    Gedeelde types en logica: thema's, vensterbeheer, notities
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

Importeer de repository in Vercel. `vercel.json` regelt installatie, build en de outputmap, dus er hoeft niets ingesteld te worden. Elke pull request krijgt dan een preview-URL.

## Wat werkt in v0.2

- Bureaublad met startmenu (met zoeken), taakbalk, klok en app-iconen.
- Vensters verplaatsen, vergroten, minimaliseren, maximaliseren (dubbelklik op de titelbalk) en sluiten.
- Onder 768px breed: appgrid, apps op volledig scherm, onderste navigatie en de Android-terugknop.
- Notities, lokaal opgeslagen en gesynchroniseerd tussen tabbladen.
- Focus- en Pulse-thema als design tokens, direct wisselbaar en onthouden.
- PWA-manifest, iconen en service worker met offline fallback.

Accounts en synchronisatie tussen apparaten komen in v0.3.
