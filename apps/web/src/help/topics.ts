import type { AppId } from '@nexus/core'

export interface HelpTopic {
  /** One sentence on what the app is for. */
  summary: string
  /** Short how-tos, one per line. */
  tips: string[]
}

/** An explanation for every app; the type makes a new app fail to build until it has one. */
export const HELP: Record<AppId, HelpTopic> = {
  agenda: {
    summary: 'Je deadlines, projecten en afspraken op één plek, met een overzicht van wat eraan komt.',
    tips: [
      'Met Integratie (Nieuwe modules) zie je onder een deadline of project wat erbij hoort, en opent een aangetikte melding meteen de juiste deadline.',
      'Overzicht toont wat vandaag en deze week op je wacht, als lijst of als rooster per week met elke agenda in haar kleur.',
      'Een deadline kan een melding sturen naar je gsm en horloge, ook als je pc uit staat.',
      'Een afspraak kan elke dag, week, maand of jaar terugkomen; één keer overslaan kan in Overzicht.',
      'Overlapt een afspraak met een les of een andere afspraak, dan zie je dat meteen.',
      'Dagstart stuurt elke ochtend een kort overzicht; Week maakt op zondag een terugblik.',
    ],
  },
  study: {
    summary: 'Focustimer, studieplanner, examenplanner en je studiegroep.',
    tips: [
      'Focus start een pomodoro van 25 minuten; je horloge kan er ook een starten.',
      'De planner verdeelt je deadlines over vrije momenten rond je lessen en afspraken.',
      'Groep: maak een studiegroep en deel de uitnodigingscode, dan zien jullie elkaars deadlines, examens en studietijd, en delen jullie groepsdeadlines.',
    ],
  },
  grades: {
    summary: 'Hou je cijfers per vak bij en zie je gemiddelde.',
    tips: ['Voeg per vak toetsen toe met hun gewicht.', 'Je cijfers synchroniseren tussen je apparaten als je aangemeld bent.'],
  },
  habits: {
    summary: 'Gewoontes die je elke dag of week wilt doen, met een reeks en een herinnering.',
    tips: ['Vink een gewoonte af in de app of op je horloge.', 'Een herinnering komt ook op je gsm als NEXUS op je pc dicht is.'],
  },
  journal: {
    summary: 'Een kort dagboek per dag, met je stemming.',
    tips: ['Schrijf een paar zinnen per dag; oudere dagen vind je terug in de lijst.', 'Je dagboek is alleen voor jou; andere accounts kunnen het nooit lezen.'],
  },
  flashcards: {
    summary: 'Leerkaarten die terugkomen net voor je ze zou vergeten.',
    tips: ['Maak een stapel per vak en voeg kaarten toe, of laat NEXUS AI ze maken uit een notitie.', 'Herhaal elke dag de kaarten die klaarstaan; hoe goed je ze kende bepaalt wanneer ze terugkomen.'],
  },
  insights: {
    summary: 'Grafieken van je week: focustijd, afgeronde deadlines, gewoontes en meer.',
    tips: ['Alles wordt op je toestel berekend uit je eigen gegevens.'],
  },
  finance: {
    summary: 'Je inkomsten, uitgaven, budgetten, spaardoelen en abonnementen.',
    tips: [
      'Met Integratie (Nieuwe modules) toont het tabblad Kalender je abonnementen en vaste bedragen per dag van de maand.',
      'Importeer een CSV van je bank om uitgaven niet met de hand te moeten typen.',
      'Vaste bedragen worden elke maand vanzelf geboekt.',
      'Delen houdt bij wat je met vrienden deelt en wie nog moet betalen.',
    ],
  },
  files: {
    summary: 'Je eigen bestanden in NEXUS, en mappen van je pc.',
    tips: ['Bestanden die je uploadt staan in je account en zijn op elk apparaat te openen.', 'Een map van je pc koppelen kan in Chrome en Edge.', 'Met de module Vault: tags, verzamelingen, koppelingen naar projecten en notities, versies, een prullenbak van 30 dagen en deellinks die vervallen (bij Details).'],
  },
  notes: {
    summary: 'Notities die offline werken en synchroniseren zodra je online bent.',
    tips: ['Snelle notitie: Alt+N, of de knop op je gsm, ook met inspreken.', 'Zoek in al je notities met Ctrl+K.'],
  },
  notifications: {
    summary: 'De meldingen van je gsm op je pc, en omgekeerd.',
    tips: ['Koppel eerst je gsm in Apparaten.', 'Meldingen zijn end-to-end versleuteld: de server kan ze niet lezen.'],
  },
  assistant: {
    summary: 'NEXUS AI: vraag iets, laat een samenvatting maken of laat een deadline of herinnering plannen.',
    tips: [
      'Elke actie vraagt eerst je toestemming voor ze gebeurt.',
      'NEXUS AI werkt alleen als je aangemeld bent met een toegelaten account.',
      'Met Wat NEXUS AI mag zien zet je per module uit wat de AI mag lezen of veranderen, en zie je elke goedkeuring terug.',
    ],
  },
  reminders: {
    summary: 'Herinneringen op een vast tijdstip, ook naar je gsm en horloge.',
    tips: ['Een herinnering werkt offline op je pc.', 'Met de gsm-app of webmeldingen komt ze ook als je pc uit staat.'],
  },
  devices: {
    summary: 'NEXUS Connect: koppel je gsm, horloge en pc.',
    tips: [
      'Koppelen gaat met een code die je op het andere toestel invult.',
      'Zonder gsm-app kan je in Chrome op je gsm webmeldingen aanzetten.',
      'Een webmelding van een deadline heeft de knoppen Klaar en Later: Klaar vinkt de deadline af, Later toont de melding over een uur opnieuw.',
      'De apps voor Windows, je gsm en je horloge, met uitleg om te installeren, staan op /download. Die link kun je ook naar anderen sturen.',
    ],
  },
  account: {
    summary: 'Aanmelden, synchroniseren en de controle van de database.',
    tips: [
      'Over jou: je naam, wat je doet en waar. Kies je "Ik werk" of "Iets anders", dan wordt het profiel School het profiel Werk, zonder schoolapps; met "Ik studeer" komen die terug.',
      'Wachtwoord vergeten? Je krijgt een eenmalige link per mail en kiest daarna een nieuw wachtwoord hier.',
      'Database-check toont welke SQL-stappen in Supabase nog ontbreken, met de SQL om te kopiëren.',
    ],
  },
  klashub: {
    summary: 'Opent KlasHub, de studiehub van de klas, op zijn eigen site.',
    tips: ['KlasHub heeft zijn eigen account; je meldt je daar apart aan.'],
  },
  flows: {
    summary: 'Flow Studio (beta): laat NEXUS iets doen als iets gebeurt, zoals een melding bij een bijna volle budgetpot.',
    tips: ['Begin met een sjabloon en test met een proefrun voor je de flow aanzet.', 'In de Bouwer kies je Lijst of Canvas; op het canvas sleep je blokken erbij, van plaats of naar de prullenbak.', 'Met Wachten zet je tijd tussen twee acties; onder Betrouwbaarheid kies je nieuwe pogingen en een time-out, onder Versies zet je een vorige versie terug.', 'Flows draaien zolang NEXUS ergens openstaat. Een flow op een vast tijdstip die een profiel kiest, loopt met de SQL voor flows op de server ook als alles dicht is, en volgt dan ook je lesrooster.'],
  },
  profiles: {
    summary: 'Profielen (School, Persoonlijk, Gaming, Developer) bepalen welke apps en welk thema je ziet.',
    tips: [
      'School Mode zet het profiel School vanzelf aan tijdens je lesuren. Onder Automatisch kan het ook volgens je lesrooster: het profiel wisselt wanneer een les begint.',
      'Overzicht zegt waarom een profiel actief is, en Geschiedenis toont elke wissel met de reden.',
      'Je profielen zijn op al je apparaten dezelfde.',
      'Met Indeling aanpassen op het dashboard sleep en vergroot je de widgets van je profiel, met een voorbeeld op de gsm.',
    ],
  },
  settings: {
    summary: 'Thema, meldingen, back-up en de rondleiding.',
    tips: ['Back-up maakt één bestand met al je gegevens, dat je later terugzet.', 'Rondleiding starten toont de uitleg van het begin opnieuw.'],
  },
  developer: {
    summary: 'Logboek en technische informatie, alleen zichtbaar in ontwikkelaarsmodus.',
    tips: ['Handig bij een probleem: hier zie je wat er misliep.'],
  },
  about: {
    summary: 'Welke versie van NEXUS je gebruikt.',
    tips: ['Vermeld de versie als je een probleem meldt.'],
  },
  spaces: {
    summary: 'Werkruimtes binnen je profielen: een Space onthoudt welke apps open staan en waar hun vensters staan.',
    tips: [
      'Zet je vensters zoals je wilt en kies "Huidige vensters bewaren als Space".',
      'Een template (Studeren, Examens, Geld en planning) zet meteen de juiste apps naast elkaar.',
      'Een gewijzigde indeling geldt pas als je ze bewaart; tot dan kan je terug naar de bewaarde.',
      'Wisselen sluit je vensters, maar je notities en andere gegevens zijn al bewaard.',
    ],
  },
  inbox: {
    summary: 'Universal Inbox: alles wat NEXUS je meldt op één plek, op al je apparaten.',
    tips: [
      'Prioriteit toont alleen wat dringend is, zoals een deadline binnen een dag of een mislukte flow.',
      'Vink items aan om ze samen te archiveren of te laten sluimeren, ook tot een eigen moment met Ander moment…. Ze staan dan in Gepland en komen ongelezen terug.',
      'Klik op een item om de app te openen waar het over gaat. Rechts zie je op welke apparaten het binnenkwam en waar je het las.',
      'Onder Regels per bron kies je per bron Aan, Stil of Uit, een vaste prioriteit en of het vanzelf naar het archief gaat. Berichten van je gsm komen er nooit in; die staan in Meldingen.',
    ],
  },
  timemachine: {
    summary: 'Time Machine: herstelpunten van je profielen en lesrooster, flows en Spaces, zodat je een wijziging kan terugdraaien.',
    tips: [
      'NEXUS maakt vanzelf een herstelpunt bij het openen, na een update en na een wijziging; een eigen herstelpunt maak je met een naam.',
      'Herstellen toont eerst wat er verandert, en je kiest welke delen je terugzet. Met Eén onderdeel terugzetten zet je bijvoorbeeld alleen één flow of één profiel terug.',
      'In Instellingen kies je het bewaarbeleid: wat automatisch meegaat, hoe lang herstelpunten blijven en of ze slim uitgedund worden.',
      'Voor elk herstel komt er een herstelpunt van hoe het nu is, dus je kan het herstel zelf ook terugdraaien.',
      'Herstelpunten staan alleen op dit toestel. Notities, deadlines en bestanden horen er niet bij; daarvoor is de back-up in Instellingen.',
    ],
  },
  bridge: {
    summary: 'Bridge: tekst, links, bestanden en je klembord naar een van je eigen toestellen sturen, of daar verdergaan, end-to-end versleuteld.',
    tips: [
      'Plak een link of typ een tekst, kies het toestel en verstuur. Een gsm met meldingen aan krijgt het ook als NEXUS daar dicht is.',
      'De gsm-app en het horloge tonen wat je stuurt als melding; tik op een link om hem op je gsm te openen.',
      'In Overdrachten zie je of het afgeleverd of geopend is; zolang het niet afgeleverd is, kan je het nog annuleren.',
      'Wat je ontvangt, open je zelf: Link openen, Kopiëren of Als notitie bewaren. Na de gekozen tijd verdwijnt het.',
      'In Toestemmingen kies je welke toestellen naar dit toestel mogen sturen. Bridge moet aan staan op het toestel dat ontvangt.',
      'Bestanden tot 10 MB gaan versleuteld via je eigen opslag; de ontvanger kiest Opslaan of In Bestanden zetten.',
      'Met Verdergaan open je op je andere toestel dezelfde app of notitie; met Klembord ophalen deel je je klembord.',
    ],
  },
  intelligence: {
    summary: 'Intelligence: voorstellen voor flows, met uitleg, die pas iets doen als jij ze goedkeurt.',
    tips: [
      'Elk voorstel toont waarom het verschijnt, welke gegevens de regel gebruikte en wat goedkeuren doet.',
      'Goedkeuren maakt een gewone flow in Flow Studio; met Aanpassen verander je eerst de dag, het uur of hoelang vooraf.',
      'Later brengt een voorstel morgen terug; Weigeren houdt die regel 14 dagen stil.',
      'Drie regels: School, Deadlines en Updates. Je zet ze aan of uit in Automatiseringen. Ze draaien op dit toestel, zonder AI.',
      'Geschiedenis toont al je goedkeuringen, van voorstellen en van NEXUS AI, met filters.',
    ],
  },
  capture: {
    summary: 'Snel vastleggen: links, ideeën en taken meteen bewaren en later een plek geven.',
    tips: [
      'Kies in Snelle notitie (Alt+N of Ctrl+Shift+Spatie) "Later sorteren" en sorteer het in Te sorteren naar een notitie, deadline of herinnering.',
      'Sjablonen zetten tekst en soort klaar voor wat je vaak bewaart.',
      'Geschiedenis toont de laatste 200 keer dat je iets vastlegde.',
    ],
  },
  studylab: {
    summary: 'Study Lab: per vak je onderwerpen, eigen oefenvragen en hoe ver je staat.',
    tips: [
      'Maak in Vakken een vak met zijn onderwerpen en kies per onderwerp hoe zeker je bent. Een vak kan een stapel Leerkaarten krijgen.',
      'In Vragen maak je open vragen of meerkeuzevragen. Oefenen stelt eerst wat je fout had en wat je nog nooit probeerde.',
      'Voortgang per onderwerp komt voor de helft uit je laatste antwoorden en voor de helft uit hoe zeker je je voelt.',
      'Het Dashboard toont wat je eerst oefent, je studietijd van de week en je examens; KlasHub open je er alleen, Study Lab leest er niets uit.',
    ],
  },
  gaming: {
    summary: 'Gaming Companion: je games, sessies, builds en speeltijd.',
    tips: [
      'Je voert alles zelf in: NEXUS koppelt geen gameplatform en leest niets uit.',
      'Noteer na het spelen een sessie; Statistieken toont je speeltijd per week en per game.',
      'Builds bewaren een loadout of instellingen met tags, en kopieer je met één klik.',
      'Met een plan in uren per week waarschuwt de app vanaf 80 % en als je erover gaat.',
      'Op het dashboard van Gaming start je de timer: het profiel Gaming staat aan tot je stopt, en de sessie komt vanzelf in je logboek.',
      'De Slaapbewaker (Instellingen) zegt op een avond voor een lesdag wanneer je moet stoppen, volgens je eerste les.',
      'Op je horloge start en stop je de timer ook (Gaming, onder Focus); de stopmelding komt dan ook als NEXUS dicht is.',
      'In Vrienden zie je wie uit je teams aan het gamen is en plan je samen een sessie; kies per team of het jou ziet gamen.',
    ],
  },
  darts: {
    summary: 'Darts: een scorebord voor 301, 501 en 701 met uitgooi-tips en je statistieken.',
    tips: [
      'Start een wedstrijd met 1 tot 4 spelers en tik na elke beurt het totaal van je drie pijlen in, zoals op een scorebord.',
      'Bij double-out is een beurt die onder nul gaat, op 1 eindigt of niet met een dubbel kan uitgooien, een bust: ze telt niet.',
      'Kun je uitgooien, dan toont Darts een route, bv. T20 T20 Bull. Gooi je uit met minder dan drie pijlen, kies dan 1 of 2 pijlen.',
      'Een fout getikt? Ongedaan maken neemt de laatste beurt terug, ook als die een leg won.',
      'Oefenen: Around the Clock (1 tot 20 en de bull, tik Raak of Mis per pijl) en Checkout-training (een willekeurige finish uitgooien in hoogstens 9 pijlen). Je resultaten staan bij Statistieken.',
      'Op je horloge (NEXUS-app, onderdeel Darts) tel je een leg van 501 of 301 bij met uitgooi-tip. Als ze uit is of je stopt, komt ze bij Geschiedenis en Statistieken.',
      'Statistieken tellen voor jouw naam (Instellingen): gemiddelde per drie pijlen, first 9, 180\'s, 140+, hoogste finish en beste leg.',
      'Heb je een dartskalender gekoppeld (Profielen › Andere agenda\'s), dan staan je volgende dartsafspraken bovenaan.',
    ],
  },
  clock: {
    summary: 'Klok: wekkers, een timer, een stopwatch en een wereldklok.',
    tips: [
      'Een wekker is een herinnering die elke dag of elke week afgaat, ook op je gsm en horloge. Je ziet en wist hem ook in Herinneringen.',
      'De timer en de stopwatch lopen door als je Klok sluit. Is de timer om, dan krijg je een melding zolang NEXUS openstaat.',
      'In Wereldklok zet je tot 8 steden, met het tijdsverschil met hier en of het daar al morgen is.',
      'Klok is een module: je zet ze aan of uit in Instellingen › Nieuwe modules.',
    ],
  },
  calculator: {
    summary: 'Rekenmachine: rekenen met haakjes, procenten en een komma.',
    tips: [
      'Tik of typ een berekening, bv. (12,5 + 7) × 3, en druk op Enter of =.',
      'Procenten werken zoals op een zakrekenmachine: 200 + 10% is 220, 80 × 25% is 20.',
      'Je laatste 20 berekeningen staan onder Geschiedenis, alleen op dit toestel. Tik erop om verder te rekenen.',
      'Rekenmachine is een module: je zet ze aan of uit in Instellingen › Nieuwe modules.',
    ],
  },
  teams: {
    summary: 'Teams: je studiegroepen met rollen, uitnodigingen en gedeelde projecten.',
    tips: [
      'Een team is dezelfde groep als in Studie › Groep: wat leden delen en de groepsdeadlines staan daar.',
      'Eigenaar, beheerder, lid of kijker: bij Leden staat wat elke rol mag. Kijkers lezen alleen mee.',
      'Bij Uitnodigingen kopieer of deel je een uitnodiging als link; wie ze opent, heeft de code al ingevuld.',
      'Onder Teams van je klas vul je je klas in (bv. 1IT3) en sluit je aan bij teams die open staan voor je klas.',
      'Klasagenda: de groepsdeadlines van een klasteam komen vanzelf in je Agenda, met herinneringen. Bij Instellingen zet je dat per team aan of uit.',
      'Een uitnodiging heeft een rol, vervalt na een uur tot 30 dagen en kan maar een aantal keer werken.',
      'Bij Projecten werkt het hele team op één bord; Mijn taken toont wat aan jou is toegewezen.',
    ],
  },
  marketplace: {
    summary: 'Marketplace: extra widgets, thema\'s, Flow-recepten en sjablonen, allemaal gemaakt door NEXUS zelf.',
    tips: [
      'Een widget toont eerst welke gegevens hij mag lezen; pas na Toestaan komt hij op je dashboard.',
      'Een thema geldt voor het profiel dat nu aan staat; elk profiel kan een ander thema hebben.',
      'Een Flow-recept komt uit in Flow Studio, maar staat nog uit tot je het nakijkt en aanzet.',
      'Er komt niets van derden: alles zit al in NEXUS en gaat door dezelfde review als je eigen widgets.',
    ],
  },
  offline: {
    summary: 'Offline-centrum: wat er zonder internet werkt, wat nog wacht om verstuurd te worden en hoe je synchronisaties liepen.',
    tips: [
      'Overzicht toont of je online bent, hoeveel wijzigingen wachten en welk onderdeel een probleem heeft. Nu syncen stuurt alles meteen.',
      'Wachtrij: wat dit apparaat nog moet versturen. Het gaat vanzelf mee zodra je weer online bent.',
      'Samengevoegd: wanneer twee apparaten hetzelfde wijzigden; per onderdeel wint de laatste wijziging.',
      'Per app staat wat volledig, deels of alleen online werkt.',
    ],
  },
  sentinel: {
    summary: 'Sentinel: je account, apparaten, sessies en toestemmingen op één plek, met wat je eraan kunt doen.',
    tips: [
      'Overzicht zet bovenaan wat je aandacht vraagt, zoals een apparaat dat al 30 dagen niet gezien is.',
      'Bij Apparaten trek je een toestel in dat je kwijt bent; bij Sessies meld je alle andere apparaten af.',
      'Toestemmingen toont wat NEXUS AI mag zien en zonder vragen mag doen, je widgets en welke teams je zien gamen.',
      'Activiteit is een log op dit apparaat: aanmelden, nieuwe of ingetrokken apparaten en wat je hier aanpaste.',
      'Wordt er een nieuw apparaat gekoppeld, dan krijg je dat in je Inbox. Sentinel is geen virusscanner.',
    ],
  },
  controlcenter: {
    summary: 'Control Center: de status van NEXUS, snelknoppen en je favoriete apps op één plek.',
    tips: [
      'Bovenaan staat wat het eerst je aandacht vraagt; alles in orde is groen.',
      'Een statuskaart opent de app die erbij hoort, bv. Apparaten of de Agenda.',
      'Snelknoppen pauzeren je flows, zetten stille uren aan, openen Snelle notitie of syncen meteen.',
      'Favorieten kies je met de ster en zet je in volgorde met de pijltjes; ze gelden voor dit apparaat.',
    ],
  },
  knowledge: {
    summary: 'Kennis: je notities als doorzoekbare kennisbank, met collecties, tags, verwijzingen en versies.',
    tips: [
      'Het zijn dezelfde notities als in Notities: wat je daar of in Snel vastleggen bewaart, staat hier ook.',
      'Schrijf in Markdown (# kop, **vet**, - lijst) en klik op Voorbeeld. Met [[Titel]] verwijs je naar een andere notitie; bestaat die nog niet, dan maak je ze met één klik.',
      'Tags geef je onder de notitie of met #tag in de tekst. Collecties groeperen notities, bv. per vak.',
      'Geschiedenis bewaart een versie als je een notitie verlaat (de laatste 20). Terugzetten bewaart eerst wat er nu staat.',
    ],
  },
  projecthub: {
    summary: 'Project Hub: je projecten van idee tot oplevering, met een bord, mijlpalen en een tijdlijn.',
    tips: [
      'Elk project is ook een project in de Agenda: de deadlines ervan staan mee op de Tijdlijn.',
      'Op het Bord sleep je een taak naar een andere kolom, of gebruik je de pijltjes. Klik op een taak voor prioriteit, datum, mijlpaal en waar ze op wacht.',
      'Met "In Agenda zetten" wordt een taak met een datum een deadline, met een melding de dag ervoor.',
      'Activiteit toont wat er veranderde: nieuwe taken, verplaatsingen, mijlpalen en de status.',
    ],
  },
  briefing: {
    summary: 'Dagbriefing: je dag in één overzicht, met wat eerst moet en waar je tijd hebt.',
    tips: [
      'Overzicht toont je dag, de belangrijkste prioriteiten en de vrije blokken van minstens een uur tussen 08:00 en 20:00.',
      'Prioriteiten zet te late deadlines bovenaan, dan die van vandaag, examens van de komende week, deadlines van de komende dagen en gewoontes. Een deadline of gewoonte vink je daar meteen af.',
      'In Bezorging kies je uur, dagen en of de Dagstart naar je gsm en horloge gaat. Met de Dagbriefing aan staan te laat, examens, gewoontes en je langste vrije blok mee in die melding.',
      'Geschiedenis toont elke verstuurde Dagstart, één keer per dag en per kanaal, ook als meerdere apparaten openstonden.',
    ],
  },
  devhub: {
    summary: 'Developer Hub: je eigen widgets bouwen, testen in een sandbox en na een review op je dashboard zetten.',
    tips: [
      'Met Integratie (Nieuwe modules) toont Platform Health hoe NEXUS er op dit apparaat voor staat: sync, modules, opslag en gebeurtenissen.',
      'Begin met het voorbeeldproject in Projecten: een manifest (naam, versie, permissies) en de code van de widget.',
      'In Sandbox draait je code afgeschermd: zonder netwerk, opslag of toegang tot je account. Gegevens vraag je met nexus.call, en alleen met een toegestane permissie.',
      'Reviews kijkt je code na. Pas als alles klopt, publiceer je een versie; installeren vraagt eerst je toestemming voor de permissies.',
      'Een oudere versie terugzetten of de widget weghalen kan altijd in Reviews. Widgets draaien in de browser, niet in de Windows-app.',
    ],
  },
  help: {
    summary: 'Deze uitleg, per app.',
    tips: [
      'Zoek bovenaan op een app of een woord.',
      'Loopt er iets mis, gebruik dan "Probleem melden".',
      'Met de module Launcher (Instellingen › Nieuwe modules) toont Ctrl+K ook Recent, Vastgezet (Alt+P) en opdrachten zoals "Herinnering zetten", die vooraf zeggen wat ze doen.',
    ],
  },
}
