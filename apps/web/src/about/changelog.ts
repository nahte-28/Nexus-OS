/**
 * "Wat is er nieuw" on the Over NEXUS page. Every change that reaches NEXUS gets an entry here,
 * newest first, in the same pull request (see CLAUDE.md). Written for the person using NEXUS:
 * what they can do now, not how it was built.
 */
export interface ChangelogEntry {
  /** Day the change was merged, YYYY-MM-DD. */
  date: string
  title: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-11-16',
    title: 'Darts online op je horloge',
    items: [
      'Speel je een online match tegen een vriend, dan staat ze ook op je horloge onder Darts online: de stand, wie gooit en een uitgooi-tip.',
      'Ben jij aan de beurt, tik dan je score in op je horloge. Je gsm hoeft niet in je hand.',
      'NEXUS moet daarvoor open en aangemeld zijn op je pc of gsm. Werk ook de horloge-app bij.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Notities delen',
    items: [
      'Deel een notitie met een vriend of een heel team: tik in Notities op Delen en kies of ze mogen meebewerken of alleen lezen.',
      'Wat anderen met jou delen, staat in Notities onder Gedeeld met mij. Past iemand een gedeelde notitie aan, dan zie je dat meteen.',
      'Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Afspraak met vrienden',
    items: [
      'Nodig vrienden uit voor een afspraak: tik in de Agenda bij een afspraak op Vrienden uitnodigen. Je ziet wie komt en wie niet.',
      'Een uitnodiging die je krijgt, staat bovenaan in de Agenda. Aanvaard je ze, dan komt de afspraak in je eigen Agenda met meldingen, en ze verandert mee als je vriend ze verzet of afzegt.',
      'Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Automatische back-up',
    items: [
      'NEXUS maakt nu elke week zelf een back-up van al je gegevens en bewaart die in Bestanden. Met een account staat ze zo ook in je account, en ben je niets kwijt als een toestel stuk gaat.',
      'In Instellingen › Back-up kies je elke dag of elke week, hoeveel back-ups er blijven staan en of je bestanden mee moeten. Daar zet je een automatische back-up ook met één knop terug.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Sneller opstarten',
    items: [
      'NEXUS start sneller, vooral op je gsm: al je apps halen hun gegevens nu samen op in één keer in plaats van elk apart, en dat ook maar één keer bij het opstarten.',
      'Het deel van NEXUS dat bij het openen geladen wordt, is kleiner.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Darts online',
    items: [
      'Nieuw tabblad Online in Darts: daag een vriend uit voor een match van 501 (of een ander spel). Jullie gooien elk op je eigen toestel en zien de stand live.',
      'Een afgewerkte online match komt in je Geschiedenis en Statistieken. Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Vandaag op je horloge',
    items: [
      'Bovenaan de horloge-app staat nu Vandaag: je lessen en afspraken van vandaag, je gewoontes en hoe je doelen ervoor staan.',
      'Vink een gewoonte af met één tik op je horloge. De tegel toont hoeveel gewoontes je vandaag al deed. Werk de horloge-app bij via Bijwerken.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Examenblok',
    items: [
      'Nieuw tabblad Blok in Studie: NEXUS maakt een blokschema tot je laatste examen, dag per dag, met studieblokken, pauzes en een middagpauze.',
      'De dag voor elk examen is herhaling van dat vak. Je kiest zelf wanneer je blok begint, hoe lang je per dag studeert en welke dagen je rust, en zet het schema met één knop in je Agenda.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Doelen',
    items: [
      'Nieuwe app Doelen: zet doelen voor je semester, zoals 14/20 gemiddeld, een cijfer voor een vak, 30 studiepunten, 10 uur focus per week of een gewoonte 80 % van de dagen.',
      'Je doelen houden zichzelf bij met je cijfers uit Cijfers, je focustijd uit Studie en je gewoontes uit Gewoontes. Je ziet meteen of je op schema zit en wat je nog nodig hebt.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Apps per profiel',
    items: [
      'In Profielen › Apps & widgets kies je nu uit al je apps welke een profiel toont en in welke volgorde, ook Darts, Teams, Vrienden en de andere extra apps.',
      'Zo verberg je bijvoorbeeld Gaming en Darts in School, terwijl ze in je andere profielen blijven staan. Een app die je in Instellingen uitzet, is in elk profiel weg.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Berichten op je gsm en horloge',
    items: [
      'Een nieuw privébericht of teambericht komt nu ook op je gsm en horloge, ook als NEXUS daar dicht is. Zet daarvoor in Apparaten de meldingen op je gsm aan.',
      'Antwoord meteen vanuit de melding met Oké 👍 of Ik reageer straks. Tik je op de melding zelf, dan opent NEXUS bij Vrienden of Teams.',
      'Een privébericht blijft versleuteld tot op je gsm. In Apparaten kies je of privéberichten en de teamchat je gsm wekken.',
    ],
  },
  {
    date: '2026-11-14',
    title: 'Samen studeren',
    items: [
      'In Studie staat de nieuwe tab Samen: start een focussessie of doe mee met die van een vriend of iemand uit je teams. Iedereen ziet dezelfde timer en wie er meestudeert.',
      'Elk focusblok dat je samen afmaakt, komt in je focuslog en telt mee in Studie en Inzichten. Stopt wie de sessie startte, dan stopt ze voor iedereen.',
    ],
  },
  {
    date: '2026-11-14',
    title: 'Darts: Cricket',
    items: [
      'Bij Darts › Spelen kies je nu ook Cricket: gooi 20 tot 15 en de bull dicht, scoor punten op wat de ander nog open heeft, met 1 tot 4 spelers en best of legs.',
      'Tik per pijl Single, Double of Triple en het nummer. Na de wedstrijd zie je een samenvatting met MPR, triples en bull-treffers, en je Cricket-statistieken staan bij Statistieken.',
    ],
  },
  {
    date: '2026-11-14',
    title: 'Darts: samenvatting en training op je horloge',
    items: [
      'Na elke wedstrijd krijg je een samenvatting: gemiddelde, first 9, checkout %, hoogste finish, beste en slechtste leg, 180\'s, 140+, 100+ en 60+ per speler, en elke leg apart. Ook later te openen in Geschiedenis, en de uitslag kopieer je met één tik.',
      'Kun je uitgooien, dan vraagt het scorebord hoeveel pijlen op een dubbel gingen. Zo zie je je checkout-percentage in de samenvatting en bij Statistieken.',
      'Op je horloge kun je nu trainen: Around the Clock, Doubles rond, Bob\'s 27 en Scoring op T20. De rondes komen in Darts › Oefenen.',
    ],
  },
  {
    date: '2026-11-14',
    title: 'Apps aan/uit',
    items: [
      'In Instellingen staat nu Apps aan/uit: één lijst met al je apps en modules, in dezelfde groepen als de zijbalk.',
      'Zet je een app uit, dan verdwijnt ze uit de zijbalk, het zoeken en het dashboard, in elk profiel. Je gegevens blijven bewaard en zijn terug zodra je de app weer aanzet.',
      'Je keuze geldt op al je toestellen. Profielen, Instellingen, Help en Account blijven altijd.',
    ],
  },
  {
    date: '2026-11-14',
    title: 'Eigen AI-sleutel',
    items: [
      'In NEXUS AI staat nu Eigen sleutel: zet je eigen sleutel van Anthropic en gebruik NEXUS AI, de studiesamenvattingen, leerkaarten en het weekoverzicht op je eigen account.',
      'Je sleutel blijft versleuteld op dit apparaat, gaat niet mee met syncen of een back-up, en verdwijnt als je je afmeldt.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Zijbalk in groepen',
    items: [
      'De zijbalk is nu ingedeeld in School, Planning, Samen, Persoonlijk en Systeem. Klap een groep in die je weinig gebruikt; NEXUS onthoudt dat op dit apparaat.',
      'Op je gsm staan de apps onder dezelfde koppen.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Beheer',
    items: [
      'Voor de beheerder van NEXUS staat er nu Beheer in de zijbalk: hoeveel accounts er zijn, wie nu online is, de teams, wat er deze week gebeurde en de laatste foutmeldingen.',
      'Beheer toont alleen tellingen en namen, nooit wat iemand schreef. Wie Onzichtbaar koos, telt niet mee als online.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Wie is er online',
    items: [
      'In Vrienden en bij Teams › Leden zie je wie nu online is, wie bezet is en wanneer iemand laatst online was.',
      'Kies in Vrienden je eigen status: Beschikbaar, Bezet of Onzichtbaar, met een korte zin zoals "Aan het studeren". Onzichtbaar toont je voor iedereen offline.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Privéberichten',
    items: [
      'In Vrienden staat nu Berichten: stuur een vriend een privébericht, end-to-end versleuteld. Alleen jullie toestellen kunnen het lezen, NEXUS zelf niet.',
      'Een nieuw bericht geeft een melding zolang NEXUS openstaat; je ziet ook wanneer je bericht gelezen is.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Vrienden',
    items: [
      'Nieuwe app Vrienden: je krijgt een eigen vriendencode en link. Wie hem opent, stuurt je een verzoek dat jij aanvaardt of weigert.',
      'Je vrienden zien alleen de naam die je kiest, nooit je e-mailadres. Met Nieuwe code maak je je oude code en link ongeldig.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Opmerkingen en @vermeldingen',
    items: [
      'Onder elke taak van een teamproject en elke groepsdeadline staat 💬: schrijf er een opmerking bij, live voor het hele team.',
      'Typ @ om iemand van het team te vermelden. Die krijgt een melding en een item in de Universal Inbox.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Teamchat',
    items: [
      'Elk team heeft nu een tabblad Chat: praat met je team, live op al je toestellen. Op het tabblad staat hoeveel berichten je nog niet las.',
      'Een nieuw bericht geeft een melding zolang NEXUS openstaat, en komt in de Universal Inbox. Je verwijdert je eigen berichten; de eigenaar en beheerders kunnen elk bericht weghalen.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'NEXUS OS installeren vanuit NEXUS',
    items: [
      'Op de usb-stick van NEXUS OS staat in Start de knop NEXUS OS installeren. Die opent een eigen installatieprogramma in het Nederlands, met het uitzicht van NEXUS: taal, toetsenbord, schijf en je account in een paar stappen.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Systeemupdates van Debian',
    items: [
      'NEXUS OS installeert de beveiligingsupdates van Debian nu elke dag vanzelf.',
      'In Systeem › Updates zie je welke andere updates klaarstaan en installeer je ze allemaal met één wachtwoord. Is een herstart nodig, dan zegt NEXUS het, met een knop om meteen opnieuw op te starten.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Apps installeren uit Flathub',
    items: [
      'Linux-apps heeft een tabblad Apps installeren: zoek in Flathub, installeer of verwijder apps zoals Spotify, VLC en Discord, en werk ze allemaal in één keer bij. Zonder terminal en zonder wachtwoord.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Systeeminstellingen in NEXUS OS',
    items: [
      'Nieuwe app Systeem in de Linux-app: verbind met wifi, regel het volume van luidspreker en microfoon, kies resolutie, grootte en helderheid van je scherm, en koppel Bluetooth-apparaten. Allemaal zonder terminal.',
    ],
  },
  {
    date: '2026-11-12',
    title: 'NEXUS OS in een virtuele machine blijft goed in beeld',
    items: [
      'In VirtualBox en andere virtuele machines bleven er resten van vorige schermen staan, of werd NEXUS na een tijdje donker of zwart. NEXUS tekent daar nu op een eenvoudigere manier, zodat het scherm blijft kloppen.',
    ],
  },
  {
    date: '2026-11-12',
    title: 'Bijwerken op Linux eindigt niet meer met een foutmelding',
    items: [
      'Na "Zoeken naar updates" op Linux (en NEXUS OS) werd de nieuwe versie wel geïnstalleerd, maar meldde NEXUS "NEXUS opnieuw starten mislukt". NEXUS start nu gewoon opnieuw in de nieuwe versie.',
    ],
  },
  {
    date: '2026-11-12',
    title: 'NEXUS OS start ook zonder grafische versnelling',
    items: [
      'Kan de grafische kaart niet tekenen (VirtualBox zonder 3D-versnelling, sommige oudere pc\'s), dan start de NEXUS-sessie opnieuw met tekenen door de processor, in plaats van te stoppen met "Failed to initialize EGL context".',
    ],
  },
  {
    date: '2026-11-12',
    title: 'NEXUS OS werkt zichzelf bij',
    items: [
      'NEXUS OS heeft een eigen pakketbron. Een nieuwe versie van NEXUS komt vanzelf binnen, zonder nieuwe ISO en zonder wachtwoord: kort na het opstarten en daarna om de zes uur.',
      'Ook op een andere Debian, Ubuntu of Mint kun je die bron toevoegen, zodat NEXUS meekomt met sudo apt upgrade.',
    ],
  },
  {
    date: '2026-11-12',
    title: 'NEXUS OS met een eigen gezicht',
    items: [
      'NEXUS OS heet nu overal zo, ook in de systeeminformatie, en draagt de versie van de ISO.',
      'Het opstartmenu van de usb-stick, het laadscherm en het installatieprogramma tonen het NEXUS-logo.',
      'Op een geïnstalleerde NEXUS OS is het opstartmenu verborgen (houd Shift of Esc ingedrukt om het te zien).',
    ],
  },
  {
    date: '2026-11-11',
    title: 'Aanmeldscherm van NEXUS OS flasht niet meer',
    items: [
      'Het aanmeldscherm van NEXUS OS flashte en verloor wat je typte: het vocht met een tekstaanmelding om hetzelfde scherm. Het staat nu op een eigen scherm. Wie NEXUS OS al installeerde, installeert opnieuw met de nieuwe ISO.',
      'Kan NEXUS op een computer niet starten, dan toont de live-usb na drie pogingen het aanmeldscherm met de foutmelding in plaats van te blijven flashen.',
    ],
  },
  {
    date: '2026-11-10',
    title: 'NEXUS-sessie start betrouwbaarder',
    items: ['Vlak na het opstarten wacht de NEXUS-sessie tot het scherm klaar is, zodat je niet op het aanmeldscherm terechtkomt in plaats van in NEXUS.'],
  },
  {
    date: '2026-11-09',
    title: 'NEXUS OS als eigen besturingssysteem (ISO)',
    items: [
      'Er komt een ISO-bestand van NEXUS OS bij de releases op GitHub: Debian 13 met NEXUS als bureaublad, om uit te proberen in VirtualBox of van een usb-stick, en te installeren.',
      'In een virtuele machine is de muisaanwijzer nu zichtbaar in de NEXUS-sessie.',
      'De NEXUS-sessie start een wachtwoordvenster mee, zodat een update van de Linux-app je wachtwoord kan vragen.',
    ],
  },
  {
    date: '2026-11-09',
    title: 'NEXUS als hele desktop op Linux',
    items: [
      'Kies op het aanmeldscherm van Linux "NEXUS OS": NEXUS vult dan het scherm als bureaublad en andere programma\'s openen als vensters erboven.',
      'De nieuwe app Linux-apps toont de programma\'s op je computer; in Start vind je ze ook door te typen.',
      'In die sessie staan afmelden, slaapstand, opnieuw opstarten en uitschakelen onderaan in Start.',
    ],
  },
  {
    date: '2026-11-09',
    title: 'NEXUS voor Linux',
    items: [
      'NEXUS bestaat nu ook als Linux-app: een .deb voor Debian, Ubuntu en Mint, en een AppImage voor andere distributies. Je vindt ze op /download.',
      'De Linux-app werkt zichzelf bij zoals de Windows-app; met de .deb vraagt een update je wachtwoord.',
      '"Toon in map" bij een download opent je bestandsbeheer op Linux.',
    ],
  },
  {
    date: '2026-11-09',
    title: 'Browser: geschiedenis, downloads en zoomen',
    items: [
      'De Browser-app toont in de Windows-app je geschiedenis, te doorzoeken en te wissen; die blijft op je pc.',
      'Downloads komen in je map Downloads en staan in de werkbalk met "Toon in map".',
      'In- en uitzoomen per tabblad met − en +, of Ctrl + / Ctrl − / Ctrl 0.',
    ],
  },
  {
    date: '2026-11-09',
    title: 'Melding na een update',
    items: ['Na een update toont NEXUS één keer kort wat er nieuw is, met een knop naar Over NEXUS.'],
  },
  {
    date: '2026-11-09',
    title: 'Updates zoeken op gsm en horloge zonder GitHub-limiet',
    items: ['De gsm-app en het horloge zoeken updates eerst in de releaselijst van GitHub, zoals de Windows-app, zodat een gedeeld netwerk geen "GitHub gaf 403" meer geeft.'],
  },
  {
    date: '2026-11-07',
    title: 'Browser in de Windows-app bleef wit',
    items: ['Het NEXUS-browservenster laadt nu de site in plaats van een wit scherm te tonen.'],
  },
  {
    date: '2026-11-07',
    title: 'Wat is er nieuw op Over NEXUS',
    items: ['Over NEXUS toont nu na elke update wat er veranderd is.'],
  },
  {
    date: '2026-11-07',
    title: 'Updates zoeken zonder GitHub-limiet',
    items: [
      'De Windows-app zoekt updates eerst in de releaselijst van GitHub, zodat een gedeeld netwerk (school, thuis) geen "403 rate limit" meer geeft.',
    ],
  },
  {
    date: '2026-11-07',
    title: 'Browser in de Windows-app',
    items: [
      'Sites uit de Browser-app openen in een eigen NEXUS-venster met tabbladen, een adresbalk, terug/vooruit en een bladwijzerbalk.',
      'Met de ster bewaar je de pagina als bladwijzer; die synchroniseert met je andere apparaten.',
    ],
  },
  {
    date: '2026-11-06',
    title: 'Browser-app: startpagina en bladwijzers',
    items: [
      'Zoek of typ een adres, kies je zoekmachine (Google, DuckDuckGo, Bing of Ecosia).',
      'Bladwijzers in mappen, te ordenen en te bewerken, gesynchroniseerd tussen je apparaten.',
    ],
  },
  {
    date: '2026-11-06',
    title: 'Darts: wedstrijdvormen en koppels',
    items: [
      'Spelen vanaf 170, 301, 501, 701, 1001 of een eigen score.',
      'Legs en sets als best of 3, 5, …, en koppelwedstrijden waarin de spelers per leg wisselen.',
    ],
  },
  {
    date: '2026-11-06',
    title: 'Darts: bijnamen en meer trainingen',
    items: [
      'Spelers met bijnaam, bewaard in je spelerslijst.',
      "Nieuwe trainingen: Bob's 27, scoren en uitgooien, met statistieken per speler.",
    ],
  },
  {
    date: '2026-11-06',
    title: 'Verjaardagen en weer op je horloge',
    items: ['Verjaardagen van je contacten in de Agenda en de Dagstart.', 'Het weer op je horloge.'],
  },
  {
    date: '2026-11-06',
    title: 'Over jou, Klok, Rekenmachine, Weer en Contacten',
    items: [
      'Over jou in Account: kies je "Ik werk", dan wordt het School-profiel Werk.',
      'Nieuwe apps: Klok met wekkers, Rekenmachine, Weer en Contacten.',
    ],
  },
]
