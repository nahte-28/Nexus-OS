# NEXUS OS: Product Excellence, analyse en prioriteiten

Stand van 25 november 2026 (main na PR #201). Doel van het initiatief: elke functie moet aanvoelen
als deel van één samenhangend besturingssysteem, niet als een verzameling losse webapps. Dit
document meet eerst, benoemt wat werkt en wat zwak is, en stelt verbeteringen voor met een
prioriteit. Er is nog niets van gebouwd: Ethan kiest wat eerst komt (zie "Volgende stap").

Gebruikte skills: impeccable (critique, polish, delight, animate), web-quality-audit,
performance, core-web-vitals, accessibility, best-practices, extract-design-system,
micro-interaction, charting, i18n en mcp-builder, getoetst aan de `nexus-*`-skills en CLAUDE.md.

## 1. Metingen

Gemeten op de productiebuild, lokaal geserveerd (`vite preview`, **zonder** brotli-compressie;
Vercel comprimeert wel, dus echte cijfers op de gsm liggen iets beter). Lighthouse 12.

| | Gsm (gesimuleerd traag 4G) | Computer |
|---|---|---|
| Prestaties | **63** | 96 |
| Toegankelijkheid | 100 | 100 |
| Best practices | 100 | 100 |
| First Contentful Paint | 3,8 s | 0,8 s |
| Largest Contentful Paint | **5,5 s** (doel < 2,5 s) | 1,2 s |
| Total Blocking Time | 320 ms | 0 ms |
| Layoutverschuiving (CLS) | 0,004 | 0 |
| Totale grootte eerste lading | 480 KiB | 480 KiB |

- **Eerste lading: ~45 JavaScript-bestanden** (40 `modulepreload`s in `index.html`), de meeste
  1 à 6 KiB: kleine stores die elk een eigen netwerkverzoek kosten.
- **Het grootste element (LCP) is tekst die React tekent.** Tot alle JavaScript geladen en
  uitgevoerd is, ziet de gsm een leeg scherm.
- Ongebruikte JavaScript bij het opstarten: ~120 KiB, waarvan 52 KiB Supabase (bewust na het
  eerste scherm geladen, maar ook als er geen Supabase ingesteld is).
- Lettertype: één variabel woff2-bestand van 46 KiB, binnen budget.
- Geen enkele JavaScript-fout in de console bij het openen van alle 43 apps (gemeten).
- Tests: typecheck, ~990 unit-tests, databasetests, Playwright-rooktest met axe op desktop en gsm.

## 2. Wat al sterk is

- **Eén designsysteem** (Werkbank, `nx-*`-tokens, Focus en Pulse) dat alle apps volgen; de
  kleuren en het lettertype kloppen overal.
- **Toegankelijkheid 100** en axe-controle in elke PR.
- **Lokaal eerst**: alles werkt offline, sync via een wachtrij; end-to-end versleuteling voor
  Connect, Bridge en berichten; NEXUS AI vraagt toestemming per actie.
- **Desktop is snel** (96) en het lazy laden van apps werkt: een app kost pas iets als je hem opent.
- Een sterke basis voor een OS: vensterbeheer, profielen met schema, favorieten, Spaces,
  Time Machine, Flow Studio, zoeken met Ctrl+K.

## 3. Zwaktes

De beelden van alle 43 apps, gemaximaliseerd in Focus: [1](analyse/apps-1.jpg) ·
[2](analyse/apps-2.jpg) · [3](analyse/apps-3.jpg) · [4](analyse/apps-4.jpg).

### Samenhang (het belangrijkste)
1. **43 apps die elkaar overlappen.** Studie en Study Lab, Leerkaarten en Study Lab, Notities en
   Kennis en Snel vastleggen, Dagbriefing en "Mijn dag" op het dashboard, Inbox en Meldingen,
   Doelen en Inzichten, Instellingen en Control Center en Profielen. Wie NEXUS opent, moet weten
   welke app wat doet. Dit is het "uit de hand gelopen" gevoel.
2. **Geen gedeelde bouwstenen voor een app.** 33 bestanden bouwen elk hun eigen tabbladen (er is
   geen `Tabs`-component), met minstens twee stijlen (gevulde pillen en omrande knoppen, zie Klok,
   Contacten en Darts). Een gedeelde app-kop, lege toestand of formulierbreedte bestaat ook niet.
3. **Dubbele titels.** Gewoontes, Herinneringen, Inzichten, Doelen, Apparaten, Account en
   NEXUS AI herhalen hun naam als kop in het venster, onder de titelbalk die al hetzelfde zegt.
   Agenda en Cijfers doen dat niet.
4. **Formulieren rekken mee met het venster.** Gemaximaliseerd op een breed scherm worden velden
   tot 1900 px breed (Herinneringen, Gaming Companion, Darts, Kennis). Slechts 10 van de 93
   app-bestanden begrenzen hun breedte.
5. **Doodlopende lege toestanden.** Teams en Vrienden tonen alleen "werkt met een account" zonder
   knop naar Account; Apparaten en Bridge idem. Lege lijsten zijn overal losse zinnen in een
   andere stijl.
6. **Taal door elkaar.** De interface is Nederlands, maar veel apps hebben een Engelse naam
   (Study Lab, Project Hub, Sentinel, Intelligence, Flow Studio, Spaces, Time Machine, Bridge,
   Inbox, Control Center, Marketplace, Gaming Companion). Bewust als merknaam of niet: dat moet
   één regel worden.
7. **Versienummer**: Over NEXUS zegt 1.0.0, de README 0.7.

### Snelheid op de gsm
8. LCP 5,5 s en FCP 3,8 s gesimuleerd: een leeg scherm tot alle JavaScript klaar is, en ~45
   kleine verzoeken bij het opstarten.

### Kleiner
9. Grafieken in Inzichten tonen lege assen zonder uitleg als er nog geen gegevens zijn.
10. Knoppen hebben geen drukfeedback; toevoegen en verwijderen in lijsten springt.
11. Datum- en tijdvelden volgen de taal van de browser (op een Engelse browser "11/25/2026,
    10:45 AM"), niet nl-BE.

## 4. Voorstellen, met prioriteit

| # | Voorstel | Lost op | Werk | Risico |
|---|---|---|---|---|
| **P1-A** | **App-bouwstenen**: `AppLayout` (inhoud met maximale breedte, geen dubbele titel), `Tabs`, `EmptyState` (met actie, bv. "Naar Account"), `Field`/`FormRow`. Eerst in `nexus-design-system` vastleggen, dan app per app overzetten (5 à 8 apps per PR). | 2, 3, 4, 5 | groot, in stappen | laag: alleen uiterlijk |
| **P1-B** | **Snellere start op de gsm**: een statisch app-skelet in `index.html` (logo en lege kaarten in de Werkbank-kleuren) dat meteen tekent; de kleine opstart-stores samen in één chunk; Supabase niet laden zonder configuratie. Meten voor en na. Doel: LCP < 2,5 s gesimuleerd. | 8 | middel | laag |
| **P1-C** | **Indeling van de apps** (geen code): een voorstel dat de 43 apps in een handvol duidelijke plekken onderbrengt (bv. Studie met Study Lab, Leerkaarten, Cijfers en Doelen als tabbladen; één Notities met Kennis; één Meldingencentrum met Inbox). Niets wordt verwijderd zonder Ethans akkoord; een app kan blijven bestaan als snelkoppeling naar een tabblad. | 1 | klein (plan), groot (bouwen) | middel: gewoontes van gebruikers |
| P2-D | **Universele launcher**: Ctrl+K wordt ook een opdrachtenbalk ("deadline toevoegen", "focus starten", "profiel Gaming", "nieuwe notitie") en vervangt het zoeken in Start. | samenhang | middel | laag |
| P2-E | **Taalregel**: kiezen tussen Engelse merknamen of Nederlandse namen, vastleggen in `nexus-design-system`, toepassen. | 6 | klein | laag |
| P2-F | **NEXUS MCP-server** (mcp-builder): Claude (en andere assistenten) mogen met jouw toestemming je deadlines, notities en lesrooster lezen. Contextbewuste AI over al je apparaten. | intelligentie | groot | hoog: beveiliging eerst (`nexus-security`) |
| P2-G | **Slimme meldingen**: Inbox en Meldingen samen, met prioriteit per profiel en stille uren. | 1 | middel | middel |
| P3-H | Grafieken in Inzichten volgens de charting-skill, met lege toestand. | 9 | klein | laag |
| P3-I | Micro-interacties: drukfeedback op knoppen (scale 0,97), lijsten die zacht toevoegen en verwijderen. | 10 | klein | laag |
| P3-J | Eigen nl-BE-weergave voor datum en tijd waar het telt. | 11 | klein | laag |
| P3-K | Eén versienummer (README, Over NEXUS, Windows-app). | 7 | klein | laag |

## 5. Architectuurbeslissingen om vast te leggen

- **ADR-1, app-bouwstenen**: elke app gebruikt `AppLayout`, `Tabs` en `EmptyState` uit één map
  (bv. `apps/web/src/ui/`); geen UI-bibliotheek, alleen `nx-*`-tokens.
- **ADR-2, opstartbudget**: eerste lading op de gsm ≤ 150 KiB gecomprimeerde JavaScript en ≤ 15
  verzoeken; LCP < 2,5 s in de Lighthouse-simulatie; gemeten in CI.
- **ADR-3, app of tabblad**: een nieuwe functie wordt een tabblad in een bestaande app, tenzij ze
  een eigen venster nodig heeft; nieuwe apps alleen met akkoord.
- **ADR-4, taal**: nl-BE in de interface; regel voor app-namen (zie P2-E).

## 6. Volgende stap

Ethan kiest welke voorstellen eerst komen. Per voorstel volgt één PR (of een reeks kleine PR's
bij P1-A), met metingen voor en na en de bestaande tests en rooktest groen.
