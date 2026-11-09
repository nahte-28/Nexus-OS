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
