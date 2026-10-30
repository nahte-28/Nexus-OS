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
    tips: ['Begin met een sjabloon en test met een proefrun voor je de flow aanzet.', 'In de Bouwer kies je Lijst of Canvas; op het canvas sleep je blokken erbij, van plaats of naar de prullenbak.', 'Flows draaien zolang NEXUS ergens openstaat. Een flow op een vast tijdstip die een profiel kiest, loopt met de SQL voor flows op de server ook als alles dicht is.'],
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
      'Vink items aan om ze samen te archiveren of te snoozen; gesnoozede items staan in Gepland.',
      'Klik op een item om de app te openen waar het over gaat.',
      'Onderaan kies je welke bronnen in de Inbox mogen. Berichten van je gsm komen er nooit in; die staan in Meldingen.',
    ],
  },
  timemachine: {
    summary: 'Time Machine: herstelpunten van je profielen en lesrooster, flows en Spaces, zodat je een wijziging kan terugdraaien.',
    tips: [
      'NEXUS maakt vanzelf een herstelpunt bij het openen, na een update en na een wijziging; een eigen herstelpunt maak je met een naam.',
      'Herstellen toont eerst wat er verandert, en je kiest welke delen je terugzet.',
      'Voor elk herstel komt er een herstelpunt van hoe het nu is, dus je kan het herstel zelf ook terugdraaien.',
      'Herstelpunten staan alleen op dit toestel. Notities, deadlines en bestanden horen er niet bij; daarvoor is de back-up in Instellingen.',
    ],
  },
  bridge: {
    summary: 'Bridge: tekst en links naar een van je eigen toestellen sturen, end-to-end versleuteld via NEXUS Connect.',
    tips: [
      'Plak een link of typ een tekst, kies het toestel en verstuur. Een gsm met meldingen aan krijgt het ook als NEXUS daar dicht is.',
      'De gsm-app en het horloge tonen wat je stuurt als melding; tik op een link om hem op je gsm te openen.',
      'In Overdrachten zie je of het afgeleverd of geopend is; zolang het niet afgeleverd is, kan je het nog annuleren.',
      'Wat je ontvangt, open je zelf: Link openen, Kopiëren of Als notitie bewaren. Na de gekozen tijd verdwijnt het.',
      'In Toestemmingen kies je welke toestellen naar dit toestel mogen sturen. Bridge moet aan staan op het toestel dat ontvangt.',
    ],
  },
  intelligence: {
    summary: 'Intelligence: voorstellen voor flows, met uitleg, die pas iets doen als jij ze goedkeurt.',
    tips: [
      'Elk voorstel toont waarom het verschijnt, welke gegevens de regel gebruikte en wat goedkeuren doet.',
      'Goedkeuren maakt een gewone flow in Flow Studio; met Aanpassen verander je eerst de dag, het uur of hoelang vooraf.',
      'Later brengt een voorstel morgen terug; Weigeren houdt die regel 14 dagen stil.',
      'Drie regels: School, Deadlines en Updates. Je zet ze aan of uit in Automatiseringen. Ze draaien op dit toestel, zonder AI.',
    ],
  },
  devhub: {
    summary: 'Developer Hub: je eigen widgets bouwen, testen in een sandbox en na een review op je dashboard zetten.',
    tips: [
      'Begin met het voorbeeldproject in Projecten: een manifest (naam, versie, permissies) en de code van de widget.',
      'In Sandbox draait je code afgeschermd: zonder netwerk, opslag of toegang tot je account. Gegevens vraag je met nexus.call, en alleen met een toegestane permissie.',
      'Reviews kijkt je code na. Pas als alles klopt, publiceer je een versie; installeren vraagt eerst je toestemming voor de permissies.',
      'Een oudere versie terugzetten of de widget weghalen kan altijd in Reviews. Widgets draaien in de browser, niet in de Windows-app.',
    ],
  },
  help: {
    summary: 'Deze uitleg, per app.',
    tips: ['Zoek bovenaan op een app of een woord.', 'Loopt er iets mis, gebruik dan "Probleem melden".'],
  },
}
