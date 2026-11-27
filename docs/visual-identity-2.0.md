**NEXUS OS**

Visual Identity 2.0

**MASTERPLAN • DESIGN AUDIT • VERBETERINGEN • CLAUDE-PROMPTS**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>CENTRALE VISIE<br />
</strong>Verfijn de bestaande NEXUS-identiteit. Behoud Werkbank, het donkere groen, koper, Focus en Pulse. Introduceer NEXUS Circuit Flow als een subtiel levende printplaatachtergrond. Maak desktop, taskbar, dashboard en Startmenu consistenter en premiumer zonder de bestaande architectuur of functionaliteit te beschadigen.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

*Werkdocument voor Claude Design en het NEXUS OS-project*

# Inhoud

- 1\. Samenvatting en vastgelegde keuzes

- 2\. Eerste designaudit en aandachtspunten

- 3\. Visual Identity 2.0: kleuren en ontwerpprincipes

- 4\. NEXUS Circuit Flow

- 5\. Desktop Experience: vensters, taskbar en Startmenu

- 6\. Dashboard 2.0

- 7\. Mobiele ervaring

- 8\. Werkbank Design System 2.0

- 9\. Technische richtlijnen, toegankelijkheid en prestaties

- 10\. Gefaseerde implementatie en acceptatiecriteria

- 11\. Prompt voor Claude Design

- 12\. Masterprompt voor Claude in het NEXUS OS-project

- 13\. Onafhankelijke auditprompt

- 14\. Definition of Done

# 1. Samenvatting en vastgelegde keuzes

Dit document bundelt de besproken designaudit, de gewenste verbeteringen, de gekozen richting voor Circuit Flow en de prompts om het werk gecontroleerd door Claude te laten ontwerpen, implementeren en controleren.

- De bestaande Werkbank-identiteit blijft de basis. Geen complete redesign.

- Donkergroen blijft de dominante basiskleur; koper blijft het herkenbare accent.

- Focus en Pulse blijven bestaan en krijgen elk hun eigen circuitaccent en animatie-intensiteit.

- Circuitlijnen blijven permanent subtiel zichtbaar, met bewegende lichtpulsen.

- Circuit Flow bestrijkt de volledige desktopachtergrond, niet elk afzonderlijk appvenster.

- De lijnen volgen de bestaande raster-/puntstructuur en gebruiken beheerste technische routes.

- Taskbar, dashboard, venstersysteem en Startmenu worden verfijnd, niet vervangen.

- Desktop en mobiel behouden dezelfde identiteit, met aangepaste layout en animatie-intensiteit.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>ONTWERPPRINCIPE<br />
</strong>Eigen identiteit eerst. Visuele verfijning daarna. NEXUS moet herkenbaar blijven als NEXUS, niet veranderen in een generieke AI-dashboardtemplate.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 2. Eerste designaudit en aandachtspunten

De eerste audit was gebaseerd op beschikbare broncode en ontwerpstructuur. De live Vercel-interface kon toen niet betrouwbaar worden geladen. De scores zijn dus voorlopige code-/structuurinschattingen, geen pixelnauwkeurige visuele beoordeling.

| **Onderdeel**           | **Voorlopige score** | **Observatie**                                                                  |
|-------------------------|----------------------|---------------------------------------------------------------------------------|
| **Designidentiteit**    | 8/10                 | Werkbank, rastermotief en groen/koper geven NEXUS een eigen karakter.           |
| **Kleuren en thema’s**  | 7,5/10               | Sterke basis; accentgebruik en themaconsistentie verfijnen.                     |
| **Dashboardstructuur**  | 7/10                 | Goede configureerbaarheid; hiërarchie en verticale drukte verdienen aandacht.   |
| **Vensterarchitectuur** | 8/10                 | Sterke functionele basis; visuele diepte en actieve/inactieve states verfijnen. |
| **Taskbar**             | 6/10                 | Veel functies op één strook; groepering en adaptief gedrag verbeteren.          |
| **Startmenu**           | 6,5/10               | Functionele basis; sterkere NEXUS-presentatie en zoekervaring.                  |
| **Responsive aanpak**   | 7/10                 | Goede basisstructuur; visuele samenhang en mobiele prestaties valideren.        |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>BEPERKING<br />
</strong>De audit bevestigt geen exacte visuele problemen op de live site. Risico’s die alleen uit code zijn afgeleid, zoals een mogelijk drukke taskbar op smallere breedtes, moeten eerst in de echte interface worden gecontroleerd.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 2.1 Taskbar 2.0

- Groepeer systeemstatus, synchronisatie en notificaties logischer.

- Maak vastgemaakte apps en actieve apps visueel onderscheidbaar.

- Gebruik een heldere actieve-app-indicator.

- Voeg waar nodig een compacte/overflow-weergave toe voor smallere desktopbreedtes.

- Behoud bestaande functies: Start, zoeken, capture, favorieten, open vensters, updates, meldingen, sync en klok/datum.

- Voorkom dat alle statusiconen evenveel visuele aandacht opeisen.

## 2.2 Dashboard 2.0

- Herzie de hiërarchie tussen NEXUS-markering, begroeting/datum, snelkoppelingen, Welcome/FlowPrompts en widgets.

- Verminder visuele concurrentie tussen opeenvolgende secties.

- Maak de standaard widgetindeling direct aantrekkelijk en bruikbaar.

- Behoud configuratie, drag-and-drop, resizing, toevoegen/verbergen, gaten vullen en PC-/telefoonpreview.

- Maak widgets consistenter qua spacing, typografie, borders en statusweergave.

## 2.3 Venstersysteem en Startmenu

- Verfijn actieve/inactieve vensters, titelbalken, schaduwen en overlapping.

- Geef openen, sluiten, minimaliseren, maximaliseren en snappen consistente, korte feedback.

- Versterk het Startmenu met een duidelijke NEXUS-header, favorieten en geïntegreerde zoekervaring.

- Behoud de eigen NEXUS-indeling; kopieer Windows of macOS niet.

# 3. Visual Identity 2.0

## 3.1 Visuele persoonlijkheid

- Industrial: technische rasterstructuren, printplaatinvloeden en functionele details.

- Premium: rustige kleuren, gecontroleerd materiaalgebruik en verzorgde componenten.

- Living Technology: subtiele beweging die activiteit suggereert zonder af te leiden.

## 3.2 Kleurreferenties

Dit zijn conceptuele referenties, geen opdracht om bestaande Werkbank-tokens blind te overschrijven. Claude inspecteert eerst de huidige tokens en hergebruikt die waar mogelijk.

| **Naam**           | **Referentie** | **Rol**                      |
|--------------------|----------------|------------------------------|
| **Deep Forest**    | \#10251E       | Dominante donkere basis      |
| **Werkbank Green** | \#172F25       | Oppervlakken en lagen        |
| **Copper**         | \#B87948       | Primair accent               |
| **Soft Copper**    | \#D6A477       | Lichtaccent en subtiele puls |

## 3.3 Focus en Pulse

| **Eigenschap**    | **Focus**                | **Pulse**                 |
|-------------------|--------------------------|---------------------------|
| **Karakter**      | Rustig en geconcentreerd | Dynamischer en levendiger |
| **Accent**        | Bestaand Focus-groen     | Bestaand Pulse-koper      |
| **Circuitlijnen** | Zeer subtiel             | Iets nadrukkelijker       |
| **Lichtpulsen**   | Gedempt en rustig        | Warmer en iets helderder  |
| **Knooppunten**   | Zachte activatie         | Duidelijkere activatie    |

De bestaande theme tokens blijven de bron van waarheid. De tabel beschrijft gewenst gedrag, niet een vrijbrief om theme values zonder inspectie te vervangen.

# 4. NEXUS Circuit Flow

Circuit Flow is de belangrijkste nieuwe visuele toevoeging: een levende printplaatlaag die over de volledige desktopachtergrond loopt.

## 4.1 Circuitlijnen

- Lijnen zijn permanent subtiel zichtbaar, ook wanneer er geen puls overheen beweegt.

- Routes volgen het bestaande raster en de bestaande punt-/node-structuur.

- Gebruik dunne koperen sporen met technische rechte segmenten en 90-gradige bochten.

- Laat sommige routes vertakken en eindigen op herkenbare knooppunten.

- Verbind niet elk rasterpunt; negatieve ruimte is essentieel.

- Voorkom een dicht netwerk dat de desktopinhoud visueel verdringt.

## 4.2 Lichtpulsen en knooppunten

- Een kleine lichtpuls verschijnt op een route en beweegt langs de lijn.

- Bij aankomst kan een knooppunt kort oplichten.

- De puls dooft geleidelijk uit; de permanente lijn blijft subtiel zichtbaar.

- Meerdere pulsen bewegen onafhankelijk en met verschillende tussenpozen.

- Vermijd een synchroon, mechanisch patroon of een opvallende screensaver-look.

- Geen onnodige reactie op gebruikersinteracties; houd de animatie decoratief en rustig.

## 4.3 Laagopbouw

- Circuit Flow is een afzonderlijke achtergrondlaag op desktopniveau.

- De laag vult de volledige desktopachtergrond en schaalt mee met de viewport.

- Vensters, dialogs en appoppervlakken blijven eigen, leesbare oppervlakken.

- Circuitlijnen mogen in vrije/transparante desktopruimte zichtbaar blijven, maar mogen niet met content concurreren.

- De bestaande rastertextuur blijft onderdeel van de identiteit.

## 4.4 Motion-profiel

| **Aspect**         | **Richtlijn**                                    |
|--------------------|--------------------------------------------------|
| **Zichtbaarheid**  | Lijnen permanent subtiel zichtbaar               |
| **Beweging**       | Rustige activiteit met onregelmatige tussenpozen |
| **Route**          | Meerdere vooraf bepaalde circuitroutes           |
| **Puls**           | Klein, scherp en beheerst; geen grote neonbol    |
| **Glow**           | Beperkt tot puls en kortstondige node-activatie  |
| **Thema**          | Accent en intensiteit volgen Focus/Pulse         |
| **Reduced motion** | Animatie uitschakelen of statische variant tonen |

# 5. Desktop Experience

## 5.1 Window System

- Duidelijk onderscheid tussen actief en inactief venster.

- Verfijnde titelbalk met consistente icon-, titel- en actieknoppen.

- Subtiele, korte overgangen voor openen, sluiten, minimaliseren en maximaliseren.

- Overlapping toont diepte en focus zonder zware schaduwen.

- Snapzones geven onmiddellijke, begrijpelijke feedback.

- Behoud drag-, resize-, maximize-, minimize-, snap- en positieherinneringsgedrag.

## 5.2 Taskbar

- Logische groepering van systeemstatus, meldingen en synchronisatie.

- Duidelijke actieve-app-indicator.

- Verschil tussen pinned/favoriete en momenteel actieve apps.

- Adaptieve compacte modus of overflow bij beperkte breedte.

- Behoud bestaande functionaliteit en interacties.

## 5.3 Startmenu

- Sterkere NEXUS-identiteit en duidelijke visuele header.

- Favorieten en eventueel recent gebruikte apps overzichtelijk presenteren.

- Zoeken als centraal onderdeel van de ervaring.

- Appcategorieën en bestaand Linux-app-zoekgedrag blijven correct werken.

- Power-acties blijven herkenbaar en bereikbaar.

# 6. Dashboard 2.0

- Maak de bovenkant rustiger en geef begroeting, datum en NEXUS-markering een duidelijke hiërarchie.

- Snelkoppelingen, Welcome/FlowPrompts en widgets moeten in een logisch visueel ritme staan.

- Verminder het gevoel van opeengestapelde secties zonder nuttige informatie te verwijderen.

- Zorg dat de standaard widgetindeling meteen goed oogt.

- Behoud widgetgrid-functies: verplaatsen, vergroten/verkleinen, toevoegen/verbergen, gaten vullen en preview.

- Maak widgetheaders, inhoud, empty states, loading states en interacties consistent.

- Circuit Flow mag zichtbaar blijven in vrije achtergrondzones, maar niet achter tekst of grafieken concurreren.

# 7. Mobiele ervaring

- Behoud dezelfde kleuren, typografie, iconstijl en algemene NEXUS-identiteit.

- Pas layouts en navigatie aan voor kleinere schermen; verklein desktop niet simpelweg.

- Gebruik lagere animatie-intensiteit of een statische/subtiele variant waar dat beter is voor batterij en prestaties.

- Behoud bestaande mobiele shell, appweergave, gegroepeerde app-grid en bottom navigation.

- Controleer touch targets, tekstcontrast, scrollgedrag en statusbalkruimte.

# 8. Werkbank Design System 2.0

| **Domein**     | **Standaard**                                                            |
|----------------|--------------------------------------------------------------------------|
| **Kleuren**    | Centrale tokens voor basis, surfaces, tekst, borders, accenten en states |
| **Typografie** | Consistente type scale, gewichten en line-height                         |
| **Spacing**    | Gestandaardiseerde spacingwaarden                                        |
| **Radius**     | Beperkte, consistente radius-schaal                                      |
| **Borders**    | Subtiel, functioneel en voldoende contrast                               |
| **Shadows**    | Beheerst gebruik voor hiërarchie en diepte                               |
| **Icons**      | Eén consistente stijl, maten en uitlijning                               |
| **Motion**     | Herbruikbare timing, easing en reduced-motion gedrag                     |
| **Surfaces**   | Duidelijke lagen: desktop, venster, kaart, overlay en modal              |
| **Themes**     | Focus en Pulse delen componentstructuur maar behouden eigen tokens       |

Nieuwe of aangepaste componenten moeten Werkbank gebruiken. Introduceer geen parallel design system of losse hardcoded kleurwaarden wanneer bestaande tokens beschikbaar zijn.

# 9. Technische richtlijnen, toegankelijkheid en prestaties

## 9.1 Rendering en prestaties

- Inspecteer eerst de bestaande stack en renderingpatronen.

- Vergelijk Canvas en SVG op aantal routes/nodes, schaalbaarheid, toegankelijkheid, onderhoudbaarheid en performance.

- Kies de eenvoudigste aanpak die soepel en onderhoudbaar is.

- Gebruik requestAnimationFrame alleen waar nodig; vermijd onnodige timers en renderloops.

- Pauzeer of beperk animatie wanneer de desktoplaag niet zichtbaar is of de pagina niet actief is.

- Vermijd zware blur/filter-effecten, grote DOM-aantallen en onnodige compositinglagen.

- Meet prestaties in plaats van zonder meting te claimen dat de animatie lichtgewicht is.

## 9.2 Toegankelijkheid

- Respecteer prefers-reduced-motion en bied een statische variant.

- Behoud voldoende contrast voor tekst, iconen en interactieve elementen.

- Animatie mag geen focusverlies, flikkering of afleiding veroorzaken.

- Interactieve controls behouden duidelijke focus-, hover-, active- en disabled-states.

## 9.3 Compatibiliteit

- Test gangbare desktopbreedtes en verschillende DPI-/schaalfactoren.

- Controleer mobiel gedrag en low-power situaties.

- Controleer dat vensters en overlays boven de achtergrondlaag blijven.

- Controleer dat animatie input-, scroll-, drag- of resize-interacties niet hindert.

# 10. Gefaseerde implementatie en acceptatiecriteria

## Fase 0 – Inspectie en nulmeting

Lees CLAUDE.md, projectregels, relevante skills, tokens, componenten en tests. Leg de huidige werking vast. Controleer de echte UI indien preview/browser beschikbaar is. Maak eerst een plan en rapporteer risico’s.

## Fase 1 – Werkbank Design System 2.0

Centraliseer of normaliseer tokens en componentrichtlijnen. Verander alleen waar aantoonbaar nodig. Controleer Focus en Pulse en voorkom regressies.

## Fase 2 – NEXUS Circuit Flow

Bouw een geïsoleerde desktopachtergrondlaag met permanente subtiele routes, pulsen, node-activatie en theme support. Voeg reduced-motion en performancegedrag toe.

## Fase 3 – Desktop Experience

Verfijn Window System, Taskbar en Startmenu. Behoud alle bestaande acties en states.

## Fase 4 – Dashboard Experience

Verfijn informatiehiërarchie, widgetpresentatie en standaardindeling zonder configuratie of features te verliezen.

## Fase 5 – Mobile & Quality Pass

Optimaliseer mobiele identiteit, animatie-intensiteit, toegankelijkheid, responsive gedrag, prestaties en regressietests.

## Acceptatiecriteria per fase

- De fase is geïmplementeerd binnen de bestaande architectuur.

- Geen bestaande feature, route, instelling of gebruikersconfiguratie is verloren gegaan.

- Relevante tests, typechecks, lint/build en handmatige checks zijn uitgevoerd; resultaten worden eerlijk gerapporteerd.

- Focus en Pulse zijn afzonderlijk gecontroleerd.

- Desktop en relevante mobiele breedtes zijn gecontroleerd.

- Geen ongeautoriseerde database-, infrastructuur-, release- of deploymentwijzigingen.

- Documentatie en changelog zijn bijgewerkt volgens projectregels.

- De gebruiker krijgt een korte samenvatting van wijzigingen, bestanden, tests, beperkingen en openstaande punten.

# 11. Prompt voor Claude Design

Gebruik in de aparte Claude Design-omgeving. Doel: ontwerpbegeleiding, visuele concepten en implementatieadvies. Niet zelfstandig code in de repository wijzigen.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Je bent de senior product designer en design-systemspecialist voor NEXUS OS.<br />
<br />
CONTEXT<br />
NEXUS OS heeft al een eigen Werkbank-designrichting. De identiteit is gebaseerd op donker groen, koperaccenten, een technisch raster/puntmotief en twee thema's: Focus en Pulse. Het product is een desktop/web/mobile ecosysteem, geen generiek AI-dashboard.<br />
<br />
OPDRACHT<br />
Werk NEXUS OS Visual Identity 2.0 uit op basis van het bijgevoegde masterplan. Verfijn de bestaande identiteit; vervang ze niet.<br />
<br />
VASTE BESLISSINGEN<br />
- Donkergroen blijft dominant en koper blijft een gecontroleerd accent.<br />
- Focus en Pulse behouden hun eigen accentkleur en krijgen een eigen Circuit Flow-intensiteit.<br />
- NEXUS Circuit Flow is permanent subtiel zichtbaar op de volledige desktopachtergrond.<br />
- Lichtpulsen bewegen langs koperen circuitroutes; knooppunten lichten kort op.<br />
- Routes volgen het bestaande raster en de puntstructuur.<br />
- Vensters en appoppervlakken blijven leesbaar en worden niet bedekt door decoratieve effecten.<br />
- Geen generieke paarse/blauwe AI-gradients, overmatig glassmorphism, neon of glow.<br />
<br />
LEVER OP<br />
1. Samenhangende visuele richting en design rationale.<br />
2. Kleur- en themaspecificatie die bestaande tokens respecteert.<br />
3. Circuit Flow-ontwerp met routes, nodes, pulsen, timing/intensiteit en reduced-motion variant.<br />
4. Richtlijnen voor desktop, vensters, taskbar, Startmenu en dashboard.<br />
5. Mobiele aanpassingen.<br />
6. Component-, spacing-, typografie-, border-, shadow- en motion-richtlijnen.<br />
7. Concrete schermcomposities/mockups indien de omgeving dat ondersteunt.<br />
8. Implementatiechecklist voor Claude Code.<br />
<br />
WERKWIJZE<br />
- Maak onderscheid tussen bestaande feiten, ontwerpvoorstellen en aannames.<br />
- Verzin geen bestaande features of tokens die niet geverifieerd zijn.<br />
- Behoud herkenbare NEXUS-elementen.<br />
- Ontwerp voor dagelijks gebruik, niet alleen voor een indrukwekkende screenshot.<br />
- Geef eerlijke kritiek en benoem compromissen.<br />
- Lever een gefaseerd, uitvoerbaar ontwerpvoorstel.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 12. Masterprompt voor Claude in het NEXUS OS-project

Gebruik nadat de ontwerprichting is goedgekeurd. Claude inspecteert eerst en implementeert daarna gecontroleerd.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Je werkt aan de bestaande NEXUS OS-codebase. Implementeer NEXUS OS Visual Identity 2.0 volgens het bijgevoegde masterplan en de goedgekeurde designspecificaties.<br />
<br />
PRIORITEIT<br />
Verfijn de bestaande Werkbank-identiteit. Voer geen complete redesign of architectuurvervanging uit.<br />
<br />
VERPLICHTE EERSTE STAP<br />
1. Lees CLAUDE.md, projectregels, relevante bestaande NEXUS skills en documentatie.<br />
2. Inspecteer huidige design tokens, Focus/Pulse theming, desktop shell, background/grid, Desktop, Window, Taskbar, StartMenu, Dashboard, MobileShell en relevante CSS/componenten.<br />
3. Identificeer wat al bestaat en wat daadwerkelijk ontbreekt.<br />
4. Controleer de huidige UI via bestaande preview/browser tooling als die beschikbaar is. Claim geen visuele verificatie als je de UI niet kon bekijken.<br />
5. Geef eerst een beknopt implementatieplan met betrokken bestanden, risico's, testplan en eventuele vragen. Begin pas daarna met wijzigingen.<br />
<br />
VASTE ONTWERPKEUZES<br />
- Behoud Werkbank.<br />
- Behoud donker groen als dominante basis en koper als accent.<br />
- Behoud Focus en Pulse met eigen accentkleur en eigen Circuit Flow-intensiteit.<br />
- Bouw NEXUS Circuit Flow als afzonderlijke laag over de volledige desktopachtergrond.<br />
- Circuitlijnen blijven permanent subtiel zichtbaar.<br />
- Lichtpulsen bewegen langs circuitroutes en activeren knooppunten kort.<br />
- Routes volgen het bestaande raster/puntmotief en gebruiken beheerste technische hoeken.<br />
- Houd vensters, dialogs en appoppervlakken leesbaar en visueel gescheiden van de achtergrond.<br />
- Verfijn taskbar, dashboard, Window System en Startmenu.<br />
- Mobiel behoudt dezelfde identiteit met aangepaste layout en lagere animatie-intensiteit.<br />
<br />
TECHNISCHE EISEN<br />
- Vergelijk Canvas en SVG en motiveer de keuze.<br />
- Respecteer prefers-reduced-motion.<br />
- Beperk of pauzeer onzichtbare animatie.<br />
- Vermijd onnodige dependencies, DOM-nodes, filters en GPU-belasting.<br />
- Hergebruik bestaande Werkbank-tokens en componentpatronen.<br />
- Behoud bestaande app-, widget-, window-, search-, notification-, sync- en mobile-functionaliteit.<br />
- Behoud gebruikersinstellingen en widgetconfiguraties.<br />
- Test Focus en Pulse afzonderlijk.<br />
- Test relevante desktopbreedtes, mobiele layouts, verschillende DPI's en overlay/window stacking.<br />
<br />
IMPLEMENTATIEVOLGORDE<br />
Fase 0: inspectie, nulmeting en plan.<br />
Fase 1: Werkbank Design System 2.0.<br />
Fase 2: NEXUS Circuit Flow.<br />
Fase 3: Desktop Experience (vensters, taskbar, Startmenu).<br />
Fase 4: Dashboard Experience.<br />
Fase 5: Mobile &amp; Quality Pass.<br />
<br />
VEILIGHEID EN PROJECTDISCIPLINE<br />
- Geen destructieve wijzigingen of ongerelateerde refactors.<br />
- Geen productie-database- of infrastructuurwijzigingen.<br />
- Geen automatische commits, pushes, releases of deployments.<br />
- Geen features verwijderen of stilzwijgend vervangen.<br />
- Geen nieuwe dependencies zonder aantoonbare noodzaak en toelichting.<br />
- Volg bestaande projectregels voor changelog en documentatie.<br />
- Als een wijziging groter blijkt dan de goedgekeurde scope, stop en vraag toestemming.<br />
<br />
RAPPORTAGE<br />
Na iedere fase rapporteer je:<br />
1. Wat gewijzigd is.<br />
2. Welke bestanden aangepast zijn.<br />
3. Welke bestaande functionaliteit behouden/gecontroleerd is.<br />
4. Welke tests, typechecks, lint- en buildstappen zijn uitgevoerd en hun echte resultaten.<br />
5. Wat visueel gecontroleerd is en wat niet.<br />
6. Performance- en toegankelijkheidsbevindingen.<br />
7. Resterende risico's en aanbevolen volgende stap.<br />
<br />
Werk fase per fase. Ga niet automatisch door naar een volgende risicovolle fase wanneer de vorige fase tests of acceptatiecriteria niet haalt.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 13. Onafhankelijke auditprompt

Gebruik na implementatie, bij voorkeur in een aparte review/chat of door een reviewer die de codewijzigingen niet zelf heeft uitgevoerd.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Voer een onafhankelijke, kritische design- en regressieaudit uit van de huidige NEXUS OS-implementatie van Visual Identity 2.0.<br />
<br />
Beoordeel de werkelijke implementatie, niet alleen de intentie of documentatie. Inspecteer code en, indien beschikbaar, de draaiende UI. Maak duidelijk onderscheid tussen visueel geverifieerde bevindingen en conclusies die alleen uit code zijn afgeleid.<br />
<br />
CONTROLEER<br />
- Is de bestaande Werkbank-identiteit behouden?<br />
- Zijn donker groen en koper consistent en voldoende leesbaar?<br />
- Zijn Focus en Pulse verschillend maar duidelijk familie van elkaar?<br />
- Is Circuit Flow permanent subtiel zichtbaar en beperkt tot de desktopachtergrond?<br />
- Volgen routes het bestaande raster en zien pulsen/nodes er natuurlijk uit?<br />
- Is de animatie rustig, niet repetitief en niet afleidend?<br />
- Respecteert de implementatie reduced motion en performancegrenzen?<br />
- Zijn vensters, overlays en apps leesbaar boven de achtergrond?<br />
- Zijn taskbar, Startmenu, dashboard en window states consistenter geworden?<br />
- Werken bestaande functionaliteiten en gebruikersconfiguraties nog?<br />
- Is de mobiele ervaring aangepast en bruikbaar?<br />
- Zijn er contrast-, focus-, responsive-, performance- of regressieproblemen?<br />
<br />
OUTPUT<br />
1. Executive summary.<br />
2. Bevindingen met severity: Critical / High / Medium / Low.<br />
3. Per bevinding: bewijs, bestand/component, impact en concrete oplossing.<br />
4. Visuele beoordeling alleen als de UI echt is bekeken.<br />
5. Testresultaten met exacte uitgevoerde commando's en resultaten.<br />
6. Ongeverifieerde punten en beperkingen.<br />
7. Prioriteitenlijst voor herstel.<br />
8. Eindconclusie: ready / ready with issues / not ready.<br />
<br />
Wees direct en kritisch. Geef geen complimenten als vervanging voor bewijs. Pas zelf geen code aan tijdens deze audit.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 14. Definition of Done

- NEXUS blijft onmiddellijk herkenbaar als NEXUS; de identiteit is verfijnd, niet vervangen.

- Circuit Flow werkt op de volledige desktopachtergrond en niet als decoratieve laag in elk venster.

- Lijnen zijn permanent subtiel zichtbaar en pulsen bewegen langs routes die het raster volgen.

- Focus en Pulse hebben elk hun eigen accent- en intensiteitsgedrag.

- Reduced motion, leesbaarheid en prestaties zijn aantoonbaar gecontroleerd.

- Taskbar, Startmenu, vensters en dashboard zijn consistenter zonder functieverlies.

- Mobiel gebruikt dezelfde designtaal met een passende, lichtere ervaring.

- Bestaande instellingen, widgets, vensterposities en appfunctionaliteit blijven behouden.

- Tests en visuele controles worden eerlijk gerapporteerd; geen ongefundeerde claims.

- Geen ongeautoriseerde commits, pushes, releases, deployments of productieaanpassingen.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>EINDRICHTING<br />
</strong>NEXUS OS moet niet moderner worden door trends te volgen. Het moet herkenbaarder worden door zijn eigen identiteit sterker uit te werken. Circuit Flow is een kenmerkend detail van die identiteit, geen effect dat de interface overheerst.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>
