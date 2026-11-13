/**
 * Feature flags (blueprint fase 0): every new module from the blueprint ships behind a switch,
 * so it can be rolled out gradually and switched off at once (kill switch). Every module is on
 * by default (STABLE_FEATURES) except the Developer Hub, which is for developers only. The
 * database has every SQL step (Database-check), so modules with tables work for everyone. Pure logic.
 */
export type FeatureId = 'spaces' | 'inbox' | 'timeMachine' | 'bridge' | 'intelligence' | 'devHub' | 'capture' | 'briefing' | 'projectHub' | 'knowledge' | 'studyLab' | 'gaming' | 'teams' | 'controlCenter' | 'launcher' | 'sentinel' | 'vault' | 'offline' | 'marketplace' | 'integration' | 'darts' | 'clock' | 'calculator' | 'weather' | 'contacts' | 'browser' | 'friends'

export interface FeatureInfo {
  id: FeatureId
  title: string
  description: string
  /** Whether it is on for someone who never touched the switch. */
  defaultOn: boolean
  /** Not built yet: shown as "binnenkort" and cannot be switched on. */
  available: boolean
}

export const FEATURES: FeatureInfo[] = [
  { id: 'spaces', title: 'Spaces', description: 'Werkruimtes binnen je profielen, met hun eigen apps en indeling.', defaultOn: true, available: true },
  { id: 'inbox', title: 'Universal Inbox', description: 'Eén plek voor wat NEXUS je meldt: flows, updates, apparaten en deadlines.', defaultOn: true, available: true },
  { id: 'timeMachine', title: 'Time Machine', description: 'Herstelpunten van je profielen, flows en Spaces, met een overzicht van wat verandert voor je herstelt.', defaultOn: true, available: true },
  { id: 'bridge', title: 'Bridge', description: 'Tekst en links naar een van je eigen toestellen sturen, end-to-end versleuteld.', defaultOn: true, available: true },
  { id: 'intelligence', title: 'Intelligence', description: 'Voorstellen met uitleg, die pas iets doen als jij ze goedkeurt.', defaultOn: true, available: true },
  { id: 'devHub', title: 'Developer Hub', description: 'Eigen widgets bouwen, testen in een afgeschermde sandbox en pas na een review op je dashboard zetten.', defaultOn: false, available: true },
  { id: 'capture', title: 'Snel vastleggen', description: 'Te sorteren, sjablonen en geschiedenis bij Snelle notitie: links en ideeën nu bewaren, later een plek geven.', defaultOn: true, available: true },
  { id: 'briefing', title: 'Dagbriefing', description: 'Dagstart 2.0: je dag in één overzicht met prioriteiten, vrije blokken en een geschiedenis, en de belangrijkste punten mee in je Dagstart.', defaultOn: true, available: true },
  { id: 'projectHub', title: 'Project Hub', description: 'Je Agenda-projecten met een kanbanbord, prioriteiten, afhankelijkheden, mijlpalen, een tijdlijn en activiteit.', defaultOn: true, available: true },
  { id: 'knowledge', title: 'Kennis', description: 'Je notities als kennisbank: collecties, tags, verwijzingen met [[Titel]], Markdown, zoeken en versiegeschiedenis.', defaultOn: true, available: true },
  { id: 'studyLab', title: 'Study Lab', description: 'Vakken met onderwerpen, je eigen oefenvragen, oefenrondes, studiesessies en voortgang per onderwerp.', defaultOn: true, available: true },
  { id: 'gaming', title: 'Gaming Companion', description: 'Je games, een sessielogboek, builds en loadouts, statistieken en een plan per week. Alles zelf ingevoerd, zonder platformkoppeling.', defaultOn: true, available: true },
  { id: 'darts', title: 'Darts', description: 'Een scorebord voor 301, 501 en 701 met legs, double-out en uitgooi-tips, statistieken (gemiddelde, first 9, 180\'s, hoogste finish) en je dartsafspraken uit de Agenda.', defaultOn: true, available: true },
  { id: 'clock', title: 'Klok', description: 'Wekkers die ook op je gsm en horloge afgaan, een timer, een stopwatch met rondetijden en een wereldklok.', defaultOn: true, available: true },
  { id: 'calculator', title: 'Rekenmachine', description: 'Een rekenmachine met haakjes, procenten en een komma, die je laatste berekeningen onthoudt.', defaultOn: true, available: true },
  { id: 'weather', title: 'Weer', description: 'Het weer van nu, de komende uren en de week voor je eigen plaatsen, met een tip als je een paraplu nodig hebt. Werkt ook offline met het laatst opgehaalde weer.', defaultOn: true, available: true },
  { id: 'contacts', title: 'Contacten', description: 'Je adresboek met telefoon, e-mail, adres en verjaardag, een melding op iemands verjaardag (ook op gsm en horloge) en importeren of exporteren als .vcf.', defaultOn: true, available: true },
  { id: 'browser', title: 'Browser', description: 'Een startpagina met zoekbalk en je bladwijzers in mappen, op elk toestel dezelfde. In de Windows-app opent een site in een eigen NEXUS-browservenster met tabbladen.', defaultOn: true, available: true },
  { id: 'teams', title: 'Teams', description: 'Je studiegroepen met rollen (eigenaar, beheerder, lid, kijker), uitnodigingen die vervallen en projecten waar het team samen aan werkt.', defaultOn: true, available: true },
  { id: 'friends', title: 'Vrienden', description: 'Voeg mensen toe met je eigen vriendencode of link. Zij sturen een verzoek, jij aanvaardt. Je vrienden zien alleen de naam die je kiest.', defaultOn: true, available: true },
  { id: 'launcher', title: 'Launcher', description: 'Zoeken overal (Ctrl+K) wordt de Launcher: recent geopend, vastgezette items, instellingen en opdrachten die vooraf tonen wat ze doen.', defaultOn: true, available: true },
  { id: 'sentinel', title: 'Sentinel', description: 'Eén beveiligingscentrum: je apparaten, sessies en wat je toestond, met een activiteitenlog en een melding bij een nieuw gekoppeld apparaat.', defaultOn: true, available: true },
  { id: 'vault', title: 'Vault', description: 'Bestanden wordt een kluis: tags, verzamelingen, koppelingen naar projecten en notities, versies, een prullenbak van 30 dagen en deellinks die vanzelf vervallen.', defaultOn: true, available: true },
  { id: 'offline', title: 'Offline-centrum', description: 'Wat per app offline werkt, wat nog wacht om verstuurd te worden, wat NEXUS samenvoegde en een geschiedenis van je synchronisaties, met een knop om meteen te syncen.', defaultOn: true, available: true },
  { id: 'marketplace', title: 'Marketplace', description: 'Extra widgets, thema\'s, Flow-recepten en sjablonen, allemaal gemaakt door NEXUS zelf. Niets van derden; een widget toont eerst wat hij mag.', defaultOn: true, available: true },
  { id: 'integration', title: 'Integratie', description: 'Alles hangt aan elkaar: vanuit een melding naar de deadline of het project, bij een deadline zie je wat erbij hoort, een betaalkalender in Financiën en een Platform Health-scherm voor ontwikkelaars.', defaultOn: true, available: true },
  { id: 'controlCenter', title: 'Control Center', description: 'Eén paneel met de status van NEXUS (sync, apparaten, profiel, deadlines, flows, focus, updates), snelknoppen en je favoriete apps.', defaultOn: true, available: true },
]

/** On for everyone who never touched the switch: every module except the Developer Hub. */
export const STABLE_FEATURES: FeatureId[] = FEATURES.filter((f) => f.defaultOn).map((f) => f.id)

export type FeatureSwitches = Partial<Record<FeatureId, boolean>>

/** Whether a module is on: only when it is built, and then the switch or its default decides. */
export function featureOn(switches: FeatureSwitches, id: FeatureId): boolean {
  const info = FEATURES.find((f) => f.id === id)
  if (!info?.available) return false
  return switches[id] ?? info.defaultOn
}

/** Stored switches, keeping only known ids with true/false. */
export function parseSwitches(value: unknown): FeatureSwitches {
  if (typeof value !== 'object' || value === null) return {}
  const out: FeatureSwitches = {}
  for (const f of FEATURES) {
    const v = (value as Record<string, unknown>)[f.id]
    if (typeof v === 'boolean') out[f.id] = v
  }
  return out
}
