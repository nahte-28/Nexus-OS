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
