# NEXUS OS

Een modulair, persoonlijk ecosysteem van Ethan (GitHub `nahte-28`): een webdesktop (PWA op
nexus-os-lime.vercel.app), een Windows- en Linux-app (Tauri), een Android-companion, een Wear
OS-horloge-app en een eigen Linux-distro. Alles werkt lokaal eerst en synct via Supabase.

- Schrijf in het Nederlands (antwoorden, interface, commits). Commits kort en in kleine letters.
- Elke PR die iets verandert voor wie NEXUS gebruikt, zet bovenaan `apps/web/src/about/changelog.ts` een regel bij (nieuwste eerst, datum van samenvoegen): die verschijnt onder "Wat is er nieuw" op de pagina Over NEXUS. Gevraagd door Ethan op 2026-11-07.

## Skills

Lees de skill die bij je taak hoort voor je begint. Overzicht, externe skills en conflicten:
[.claude/SKILLS.md](.claude/SKILLS.md).

| Skill | Wanneer |
|---|---|
| `nexus-architecture` | Elke wijziging over meer dan één bestand: lagen, stores, sync, platformen |
| `nexus-module-builder` | Nieuwe app of module, of nieuwe opgeslagen gegevens |
| `nexus-design-system` | Elke UI-wijziging (Werkbank-thema, tokens, Nederlandse teksten, toegankelijkheid) |
| `nexus-security` | SQL, RLS, auth, delen, versleuteling, `api/`, geheimen |
| `nexus-performance` | Opstart, afhankelijkheden, lange lijsten, timers, dashboard |
| `nexus-integration` | Externe diensten, desktop, gsm, horloge, updates |

## Technologie

npm workspaces. `apps/web`: React 19, TypeScript 7, Vite 8, Tailwind 4, vite-plugin-pwa, Vitest 5,
Testing Library, Playwright + axe. `packages/core`: pure TypeScript-logica met tests.
`api/`: Vercel-functies (Anthropic SDK 1.x, web-push 4). `supabase/`: Postgres-migraties + RLS-tests.
`apps/desktop`: Tauri 2 (Rust). `apps/android-companion`: Kotlin (gsm + `wear/`). `distro/`: Debian 13 ISO.

## Afspraken

- **Architectuur**: pure logica in `packages/core`, UI in `apps/web`; bestaande `DocStore`,
  storage, outbox en event bus gebruiken, geen nieuwe state-bibliotheek. Apps en Supabase laden
  lazy. Lokaal eerst: alles met een deadline werkt offline.
- **Code**: strikte TypeScript, geen `any` zonder reden, functies en bestanden zoals ernaast.
  Commentaar in het Engels, UI-teksten in het Nederlands (nl-BE, "je", zinshoofdletters).
- **Design**: alleen de `nx-*`-tokens uit `apps/web/src/index.css`, Focus en Pulse moeten
  allebei werken, geen UI-bibliotheek of nieuw palet.
- **Database**: elke migratie is herhaalbaar en heeft RLS (`to authenticated` + eigenaarscheck,
  `(select auth.uid())`), een test in `supabase/tests/` en een stap in `SCHEMA_STEPS`.
  Vermijd plpgsql `select … into` in publieke functies.
- **Beveiliging**: nooit Supabase-, VAPID-, push- of AI-geheimen in code, logs of chat; alleen de
  anon/publishable key en publieke client-ID's mogen in de bundel. Meldingsinhoud alleen
  end-to-end versleuteld. NEXUS AI doet niets zonder goedkeuring per actie, tenzij de
  gebruiker zelf "altijd toestaan" koos voor die actie (zijn verantwoordelijkheid; intrekbaar in AI-privacy).
- **Modules**: registreren in `core/modules.ts` (`MODULES`), `features.ts`, `windows.ts`,
  `apps/registry.tsx`, `apps/web/e2e/helpers.ts`; nieuwe documentsleutels ook in de back-up
  (`BACKUP_DOCS`). Zie `nexus-module-builder`.
- **Testen**: `npm run typecheck`, `npm test`, `npm run build`, en bij UI de Playwright-rooktest
  (`npm run e2e -w @nexus/web`, desktop + mobiel, met axe). Nieuwe core-logica krijgt unit-tests.

## SQL-werkwijze

1. Nieuwe migratie in `supabase/migrations/`, test in `supabase/tests/<naam>.sql`, opgenomen in
   `supabase/tests/run.sh`, stap in `SCHEMA_STEPS` (`packages/core/src/schemaCheck.ts`).
2. Kopieer de migratie naar `/mnt/project-files/supabase/` en maak `alles-in-een-keer.sql` daar
   opnieuw (alle migraties, gesorteerd).
3. Geef Ethan expliciete stappen: Supabase › SQL Editor › New query › plakken › Run (bij een
   waarschuwing: "Run without RLS" als hij dat vraagt). Hij mist die stap soms; herhaal ze kort.
4. Nooit zelf SQL op de productiedatabase uitvoeren of iets destructiefs doen zonder zijn akkoord.

## Werkwijze voor elke opdracht

1. Analyseer de vraag; bij meerdere lezingen kies de meest waarschijnlijke en zeg welke.
2. Bekijk de bestaande code van het gebied (`grep`, de dichtstbijzijnde gelijkaardige module).
3. Bepaal de afhankelijkheden en geraakte modules en platformen (web, desktop, gsm, horloge, SQL).
4. Maak een plan (superpowers:writing-plans bij meer dan een paar stappen).
5. Implementeer in kleine stappen, core eerst met tests.
6. Draai de passende tests (zie hierboven); bij falen alleen de falende opnieuw tot ze slagen.
7. Controleer beveiliging (`nexus-security`) en prestaties (`nexus-performance`).
8. Verifieer dat bestaande functies blijven werken (volledige `npm test`, rooktest).
9. Documenteer: changelog-regel als de gebruiker iets merkt, README bij nieuwe setup-stappen,
   en in de PR wat live getest is en wat Ethan nog moet doen.

## Grenzen

- Herschrijf geen werkende modules en verwijder geen functies zonder Ethans toestemming.
- Vervang het designsysteem niet door een template.
- Neem nooit aan dat een integratie werkt zonder ze te testen; zeg wat niet testbaar was.
- Eén PR per onderdeel. Vraag op een keuzekaart voor je opties bouwt die Ethan niet koos.
- Bouw geen bestaande apps na (bv. DartCounter). KlasHub is privé: alleen linken, nooit kopiëren.
- Vraag eerst bij destructieve database- of infrastructuurstappen.

## Tips voor de ontwikkelomgeving

- Nieuwe container: eerst `npm ci`.
- Vreemde Vitest-glob-fouten: verwijder `node_modules/.vitest-cache`.
- Playwright in de cloud-sandbox: browser staat in `/opt/pw-browsers/chromium`; ontbreekt hij,
  draai e2e met een tijdelijke config met `use.launchOptions.executablePath` daarop.
- Android (companion, horloge) bouwt alleen in CI (`android.yml`); de sandbox bereikt
  dl.google.com niet. Een wijziging aan het horloge vraagt een nieuwe watch-APK.
- De Windows-app krijgt webwijzigingen pas via een desktop-release (`desktop.yml`, ~4 min na een
  push op main).
