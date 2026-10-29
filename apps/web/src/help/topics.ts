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
      'Overzicht toont wat vandaag en deze week op je wacht.',
      'Een deadline kan een melding sturen naar je gsm en horloge, ook als je pc uit staat.',
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
      'Importeer een CSV van je bank om uitgaven niet met de hand te moeten typen.',
      'Vaste bedragen worden elke maand vanzelf geboekt.',
      'Delen houdt bij wat je met vrienden deelt en wie nog moet betalen.',
    ],
  },
  files: {
    summary: 'Je eigen bestanden in NEXUS, en mappen van je pc.',
    tips: ['Bestanden die je uploadt staan in je account en zijn op elk apparaat te openen.', 'Een map van je pc koppelen kan in Chrome en Edge.'],
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
    tips: ['Elke actie vraagt eerst je toestemming voor ze gebeurt.', 'NEXUS AI werkt alleen als je aangemeld bent met een toegelaten account.'],
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
    ],
  },
  account: {
    summary: 'Aanmelden, synchroniseren en de controle van de database.',
    tips: [
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
    tips: ['Begin met een sjabloon en test met een proefrun voor je de flow aanzet.', 'Flows draaien zolang NEXUS ergens openstaat.'],
  },
  profiles: {
    summary: 'Profielen (School, Persoonlijk, Gaming, Developer) bepalen welke apps en welk thema je ziet.',
    tips: ['School Mode zet het profiel School vanzelf aan tijdens je lesuren.', 'Je profielen zijn op al je apparaten dezelfde.'],
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
  help: {
    summary: 'Deze uitleg, per app.',
    tips: ['Zoek bovenaan op een app of een woord.', 'Loopt er iets mis, gebruik dan "Probleem melden".'],
  },
}
