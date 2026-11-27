# NEXUS OS: architectuur- en productanalyse

Stand van `main` op 25 november 2026 (commit 778cc5d). Alles hieronder is in de broncode
nagekeken. Wat in de README staat maar niet in de code, staat niet bij "werkt". Er is voor deze
analyse geen code gewijzigd.

Gebruikte skills: `nexus-architecture` (eigen), `desktop-gui-dev` en `tauri-rust` (Tauri-kant),
`web-pwa-offline-first` (opslag en sync). `kenlck/skills playwright-test-engineer` bestaat niet
(meer) in die repo; die repo heeft nu alleen `tdd`, `sdd`, `seo` en een paar andere skills.

## Correcties op docs/product-excellence.md

Twee voorstellen uit PR #203 bestaan al. Ik had ze toen niet in de code nagekeken:

- **P2-D (Ctrl+K-opdrachtstarter)** bestaat al: `search/SearchPalette.tsx` met tabbladen Recent,
  Vastgezet en Opdrachten, `launcher/commands.ts` met opdrachten (notitie, herinnering, deadline,
  profiel, focus, gaming) en `core/launcher.ts` met de lijst en de zoekscore.
- **P3-J (nl-BE-datums)** is al in orde: 140 keer `'nl-BE'`, nergens `toLocaleString()` zonder
  taal.

Wat P2-D wel nog mist, staat hieronder bij "Eén actieregister".

---

## 1. Geverifieerde inventaris

| Gebied | Wat er echt is (bron) | Wat ontbreekt |
|---|---|---|
| Vensterbeheer | Reducer in `core/windows.ts`: openen, focus, minimaliseren, maximaliseren, verplaatsen, rand-resize, vastklikken links/rechts/volledig met preview (`Window.tsx`), plaats per app onthouden (`windowPlaces.ts`), foutgrens per venster | Open vensters komen niet terug na herladen; één venster per app; geen toetsen voor vensters (Alt+Tab, Win+pijl); **minimaliseren ontkoppelt de app** (`if (win.minimized) return null`), dus ingetypte tekst en scrollpositie verdwijnen |
| Shell | Taakbalk, Start met ster, Favorieten en Meest gebruikt op het bureaublad, Ctrl+K, Alt+N / Ctrl+Shift+Spatie snel vastleggen, rondleiding, Spaces (vensterindeling bewaren en terugzetten) | Geen meldingencentrum in de shell zelf (Inbox is een app); geen virtuele bureaubladen naast Spaces |
| Gsm-weergave | `mobile/MobileShell.tsx`: één app tegelijk, terugknop via `history.pushState` | — |
| Lokale opslag | `DocStore` (21 documenten, localStorage, revisie per document); IndexedDB `nexus` v6 met notes, inbox, connect, reminders, life, files, folders, dartsPhotos; ongeveer 110 `nexus.*`-sleutels | Geen `navigator.storage.persist()`, geen quotacontrole; `writeStorage` slikt `QuotaExceededError` stil in |
| Sync | Drie mechanismen: `startDocSync` (user_settings, merge per document, 3 pogingen), `SyncEngine` voor notities (tombstones, conflictkopie), eigen `profiles/sync.ts`. Daarnaast eigen sync in teams, DM's, delen, Connect. Offline-centrum toont per kanaal wat wacht | Realtime alleen voor profielen; de andere 20 documenten synchroniseren pas bij terugkeren, online komen of elke 5 minuten |
| Wachtrij | `offline/outbox.ts` voor DM's en teamchat, `teams/taskQueue` voor teamtaken | Geen gezamenlijke wachtrij; andere online-acties falen zonder wachtrij |
| Server | `api/`: ai, calendar, agenda-feed, cards, darts, push, push-action, push-reply, review, study, weather. Push elke minuut via pg_cron (al versleuteld per gsm) | Flows en herinneringen op het bureaublad lopen alleen als NEXUS open is op dat apparaat (staat ook zo in `background.ts`) |
| NEXUS AI | `ai/session.ts` + `ai/tools.ts`: 11 acties (3 lezen, 8 schrijven), elke actie wacht op een goedkeuringskaart, per module aan/uit, logboek in AI-privacy, eigen sleutel of gedeelde sleutel met e-maillijst | Knop "altijd toestaan" per actie (ook voor `delete_reminder`), wat afwijkt van de regel "goedkeuring per actie" in CLAUDE.md |
| Flow Studio | `core/flows.ts`: 8 triggers, 3 voorwaarden, 5 acties (profiel, melding, app voorstellen, update, wachten), sjablonen, sync, uitvoering op één apparaat | Acties kunnen niets maken (geen notitie, herinnering of deadline), terwijl AI en Ctrl+K dat wel kunnen |
| Uitbreidingen | `core/extensions.ts`: widgets in een sandbox, codecontrole (geen eval/netwerk), toestemmingsdialoog, alleen lokaal | Geen manier om acties of triggers toe te voegen |
| Windows/Linux (Tauri) | 2 341 regels Rust: tray, één instantie, autostart, meldingen, eigen browser met tabs (meerdere webviews), wifi/geluid/scherm/bluetooth/updates/appwinkel op Linux, Discord-status, zelfupdate. Strakke CSP; browsertabs krijgen geen toegang tot NEXUS | Geen globale sneltoets (Alt+N werkt alleen met NEXUS in focus); geen `nexus://`-links; geen losse native vensters voor een tweede scherm; zelfupdate controleert geen handtekening, alleen het adres; ongeveer 40 keer `unwrap()`/`expect()`, vooral op mutexen in `browser.rs` |
| Android-companion | Kotlin zonder AndroidX: meldingen doorsturen (NotificationListener), Connect E2E (zelfde testvectoren als web, in CI vergeleken), veiligheidsplan met exacte alarmen, updater via GitHub, 8 testbestanden | `QUERY_ALL_PACKAGES` en eigen updater sluiten de Play Store uit (bewuste keuze, wel noteren) |
| Wear OS | `wear/`: app, tegel, complicatie, focus, samen studeren, darts, eigen internetverbinding via Connect | Geen gegevens via de gsm (Wearable Data Layer); zonder wifi of LTE op het horloge is het plan het enige |
| Distro | Debian 13 live-build, labwc-sessie, apt-repo, unattended-upgrades, ISO-rooktest | — |
| PWA | Precache van alle js/css/html, deeldoel `/snel`, snelkoppelingen, `autoUpdate` | `autoUpdate` herlaadt zonder te vragen; geen `file_handlers` of `protocol_handlers` |
| Tests | 98 core-tests, 132 webtests, 4 e2e-bestanden (alle apps + axe in Focus en Pulse, offline start, 3 scenario's), 28 SQL-tests op echte Postgres, Kotlin-unittests, ISO-rooktest | Geen test met twee apparaten tegen een echte Supabase; geen e2e voor AI-goedkeuring of flows; geen `cargo test` voor de Tauri-commando's |

## 2. Sterktes

1. **De lagen kloppen echt.** 101 pure modules in `packages/core` met 98 testbestanden;
   de web-app roept ze aan. Vensterbeheer, flows, launcher, merge en crypto zijn allemaal
   zonder browser te testen.
2. **Lokaal eerst is meer dan een slogan.** Notities met tombstones en conflictkopieën,
   `DocStore` met merge en drie herhaalpogingen, een offline-centrum dat per kanaal toont wat
   wacht, een e2e-test die zonder internet start.
3. **Beveiliging is overal meegenomen.** Connect, DM's en push zijn end-to-end versleuteld,
   met dezelfde testvectoren in TypeScript en Kotlin (CI vergelijkt ze). RLS-tests draaien elke
   migratie twee keer op Postgres. De Tauri-browser scheidt websites van NEXUS met aparte
   capabilities.
4. **AI met toestemming.** Elke actie toont een kaart, modules kunnen uit, en er is een logboek.
   Dat is strenger dan de meeste assistenten.
5. **Toegankelijkheid wordt afgedwongen.** axe draait op elke app in beide thema's; tabbladen
   hebben rollen en toetsen; foutgrenzen per venster.
6. **Weinig afhankelijkheden.** Runtime: React, supabase-js, Tauri-api en een lettertype. Geen
   state- of UI-bibliotheek.
7. **Echt cross-platform.** Eén webbuild voor browser, PWA, Windows en Linux; native extra's
   via smalle Tauri-commando's met een webterugval.

## 3. Kritieke zwaktes in de architectuur

Op volgorde van risico.

### Z1. Stil gegevensverlies als localStorage vol zit
`writeStorage` vangt elke fout op en doet niets. Bij `QuotaExceededError` (5 MB per origin,
gedeeld door 21 documenten zoals Financiën en Darts) toont de app de wijziging, maar ze wordt
niet bewaard. Na herladen is ze weg, en zonder account ook overal anders. Daarbovenop vraagt
NEXUS nooit `navigator.storage.persist()`, dus de browser mag alles opruimen bij plaatsgebrek
(Safari na 7 dagen zonder bezoek).

### Z2. Minimaliseren gooit de app weg
`Window.tsx` geeft `null` terug voor een geminimaliseerd venster, dus React ontkoppelt de app.
Een half getypt formulier, een scrollpositie of een lokale timer verdwijnt. Voor een
besturingssysteem is dat het tegenovergestelde van wat minimaliseren belooft.

### Z3. Drie (eigenlijk zes) sync-mechanismen
`startDocSync`, `SyncEngine` (notities) en `profiles/sync.ts` doen hetzelfde met elk eigen
debounce, poll, online- en zichtbaarheidslisteners. Teams, DM's, notitiedelen en Connect hebben
daarnaast elk een eigen realtimekanaal. Gevolgen:

- Realtime werkt alleen voor profielen. Een gewoonte die je op je gsm afvinkt, zie je op je
  laptop pas na terugkeren of na maximaal 5 minuten.
- Elke wijziging in `user_settings`, van welk document ook, start de profielsync.
- 21 aparte timers van 5 minuten; de pulls worden wel gebundeld (`PULL_BATCH_MS`).

### Z4. Elk nieuw document vraagt een SQL-stap van Ethan
`user_settings` heeft een `key_check`; 27 migraties breiden die lijst uit. Elk nieuw
gesynchroniseerd document werkt pas na "Supabase › SQL Editor › Run". Dat is precies de stap
die hij soms mist (CLAUDE.md zegt het zelf), en het maakt modules bouwen trager.

### Z5. Drie actieregisters naast elkaar
Hetzelfde "maak een herinnering" bestaat drie keer, met eigen validatie:
`ai/tools.ts` (AI), `launcher/commands.ts` (Ctrl+K) en `core/flows.ts` (Flow Studio, dat
het niet eens kan). Een nieuwe actie moet op drie plaatsen gebouwd worden, of komt maar op
één plaats.

### Z6. `background.ts` start alles meteen
Ongeveer 60 diensten worden bij elke start geïmporteerd, ook die van uitgeschakelde
modules (de schakelaar wordt pas daarna gecontroleerd). Dat weegt op de trage gsm-start uit de
vorige meting (LCP 5,5 s).

### Z7. Automatisaties hangen aan één open tabblad
Flows en de herinneringsplanner lopen in de browser. Push vanaf de server bestaat
(pg_cron), maar een flow "om 08:30 profiel School" gebeurt niet als NEXUS dicht is.

### Z8. Zelfupdate zonder handtekening
De Windows- en Linux-app downloadt een installer van een vast GitHub-adres en voert die uit.
Wie het GitHub-account of een release overneemt, kan code op elke pc zetten. De
updater-plugin van Tauri controleert een handtekening; die wordt niet gebruikt.

### Z9. Grote bestanden
Finance 1 733, Agenda 1 332, Darts 1 281, Dashboard 1 189, FlowStudio 1 003 en Profiles 1 002
regels. Moeilijk te reviewen en een nieuwe sessie leest ze traag in.

### Kleiner
- 25 winkels met een eigen `listeners`-set naast `DocStore`: hetzelfde patroon steeds opnieuw.
- `autoUpdate` van de service worker herlaadt de pagina zonder te vragen.
- `unwrap()` op mutexen in `browser.rs`: een paniek in één commando maakt de lock stuk.

## 4. Ontbrekende mogelijkheden (OS, geen nieuwe apps)

1. **Sessie herstellen**: open vensters, hun plaats en wat erin stond terug na herladen of
   herstart, net zoals een besturingssysteem dat doet.
2. **Vensters met het toetsenbord**: wisselen (Alt+\` of Ctrl+Tab in de taakbalk), vastklikken
   (Win+pijl of Ctrl+Alt+pijl), sluiten, en een overzicht van alle vensters.
3. **Eén actieregister** waar AI, Ctrl+K, Flow Studio, de deelknop, het horloge en later een
   MCP-server dezelfde acties uit halen, met één validatie en één goedkeuringsregel.
4. **Opslaggezondheid**: persistente opslag vragen, quota tonen in het Offline-centrum,
   waarschuwen voor het vol zit, en grote documenten naar IndexedDB.
5. **Eén sync-kanaal** met realtime voor alle documenten.
6. **Globale sneltoets en `nexus://`-links** in de desktop-app (snel vastleggen vanuit elke
   app; een link uit een mail opent het juiste venster).
7. **Server-side planning voor flows** met een tijdtrigger, via dezelfde pg_cron-route als push,
   zodat "om 08:30" ook gebeurt als NEXUS dicht is.
8. **Systeemmeldingencentrum in de shell**: een paneel met de laatste meldingen en "niet storen",
   naast de Inbox-app.
9. **Ondertekende updates** voor de desktop-app.

## 5. Aanbevolen Claude-skills

Al aanwezig en goed: `nexus-architecture`, `nexus-module-builder`, `nexus-design-system`,
`nexus-security`, `nexus-performance`, `nexus-integration`.

Nieuw voorstellen (eigen skills, in de stijl van de bestaande):

| Skill | Waarvoor | Waarom |
|---|---|---|
| `nexus-sync` | Elke wijziging aan DocStore, SyncEngine, outbox, IndexedDB, merge | Z1, Z3 en Z4 komen terug zolang er geen vaste regels zijn: één kanaal, quota, tombstones, migratie van opgeslagen vormen. Kan putten uit `web-pwa-offline-first` |
| `nexus-desktop-shell` | Vensterbeheer, taakbalk, sneltoetsen, sessieherstel | Houdt vast hoe vensters werken (niet ontkoppelen, toetsen, Spaces) |
| `nexus-actions` | Een actie toevoegen voor AI, Ctrl+K of flows | Eén plek, één validatie, goedkeuring verplicht (na stap R3) |
| `nexus-testing` | Wat elke soort wijziging aan tests vraagt, inclusief de twee-apparatentest | Vult het gat in e2e en Rust-tests |

Extern, nuttig als input (de nexus-skills winnen bij conflict):
`tauri-rust` en `desktop-gui-dev` voor de Rust-kant (getypte fouten, geen `unwrap`,
capabilities), `web-pwa-offline-first` voor opslag en sync. De standaardstack van
`desktop-gui-dev` (Zustand, SQLite, Recharts) niet volgen: NEXUS heeft al eigen keuzes.

## 6. Roadmap op prioriteit

Elke stap is één PR. Eerst wat gegevens beschermt, dan wat het als OS doet voelen, dan
uitbreidbaarheid.

| # | Stap | Waarom nu | Grootte |
|---|---|---|---|
| R1 | **Opslag beschermen**: `storage.persist()`, quotafout zichtbaar maken (melding + Offline-centrum), test | Z1, mogelijk gegevensverlies | Klein |
| R2 | **Minimaliseren zonder ontkoppelen** (verbergen in plaats van `null`) + e2e | Z2, verlies van invoer | Klein |
| R3 | **Bouwstenen afmaken** (P1-A, staat op `ui/bouwstenen`) | Al half klaar | Klein |
| R4 | **Snellere gsm-start**: `background.ts` per module lazy, alleen modules die aan staan (P1-B) | Z6 | Middel |
| R5 | **Eén sync-kanaal** met realtime voor alle `user_settings`-documenten; `profiles/sync` erop laten aansluiten | Z3 | Middel |
| R6 | **Generieke documentsleutel**: patroon (bv. `doc:<naam>`) toelaten in `key_check`, één laatste migratie | Z4, geen SQL-stap meer per module | Klein (SQL, met Ethans akkoord) |
| R7 | **Sessieherstel + venstertoetsen** | Grootste OS-gevoel per regel code | Middel |
| R8 | **Eén actieregister** in core; AI en Ctrl+K erop overzetten; flows krijgen de maak-acties | Z5 | Middel |
| R9 | **Ondertekende desktop-updates** (Tauri updater-plugin of eigen handtekeningcontrole) | Z8 | Middel |
| R10 | **Globale sneltoets + `nexus://`** in de desktop-app | Ontbrekend 6 | Klein |
| R11 | **Flows met tijdtrigger op de server**: bestond al (`20261030090000_flows_server.sql`, profiel kiezen op een vast tijdstip; meldingen via het vangnet). Notitie, deadline en herinnering op de server bewust niet gebouwd (Ethan, 2026-11-27) | Z7 | Klaar |
| R12 | **Twee-apparatentest** in CI tegen een lokale Supabase (job `sync`, `apps/web/src/sync/twoDevices.supabase.ts`) | Testgat sync | Middel |
| R13 | **Grote apps opsplitsen** (Finance, Agenda, Darts) wanneer je ze toch aanpast | Z9 | Doorlopend |
| R14 | **NEXUS MCP-server** bovenop het actieregister (P2-F): `/api/mcp`, OAuth via Supabase, lezen en aanmaken (Ethan, 2026-11-27) | Pas zinvol na R8 | Middel |

Vragen die Ethan eerst moet beslissen:

- "Altijd toestaan" bij NEXUS AI: houden (en dan CLAUDE.md aanpassen), of beperken tot
  leesacties, of weghalen? Weghalen verwijdert een functie, dus zijn keuze.
- `autoUpdate` naar "vraag eerst" omzetten?

## 7. Wat NIET bouwen

- **Nog meer apps.** Er zijn er 43; de winst zit in de shell, sync en acties.
- **Een eigen vensterbeheerder in Rust of native vensters per app.** De webvensters werken;
  maak die beter (R2, R7). Alleen een "losmaken naar tweede scherm" is later te overwegen.
- **CRDT's of versievectoren voor alle documenten.** Merge per document en conflictkopieën
  volstaan voor één gebruiker met een paar apparaten. Alleen bij samen live bewerken nodig.
- **Een state-, query- of UI-bibliotheek** (Zustand, React Query, shadcn): de eigen
  primitieven volstaan, en het designsysteem wint.
- **Overstappen naar SQLite in de desktop-app.** Dan heb je twee opslagmodellen; de webbuild is
  één codebasis voor alle platformen.
- **Een eigen app-winkel voor andere ontwikkelaars**, met code van derden die acties uitvoert.
  De widgetsandbox is genoeg; vreemde code met toegang tot je gegevens is een groot
  beveiligingsrisico.
- **AI die zonder kaart handelt**, ook niet voor "kleine" acties.
- **Play Store-versie van de companion** zolang meldingen doorsturen en de eigen updater nodig
  zijn.
- **Klonen van bestaande diensten** (DartCounter, KlasHub-inhoud), zoals al afgesproken.
