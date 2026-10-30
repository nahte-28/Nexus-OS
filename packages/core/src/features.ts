/**
 * Feature flags (blueprint fase 0): every new module from the blueprint ships behind a switch,
 * so it can be rolled out gradually and switched off at once (kill switch). Pure logic.
 */
export type FeatureId = 'spaces' | 'inbox' | 'timeMachine' | 'bridge' | 'intelligence' | 'devHub' | 'capture' | 'briefing'

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
  { id: 'spaces', title: 'Spaces', description: 'Werkruimtes binnen je profielen, met hun eigen apps en indeling.', defaultOn: false, available: true },
  { id: 'inbox', title: 'Universal Inbox', description: 'Eén plek voor wat NEXUS je meldt: flows, updates, apparaten en deadlines.', defaultOn: false, available: true },
  { id: 'timeMachine', title: 'Time Machine', description: 'Herstelpunten van je profielen, flows en Spaces, met een overzicht van wat verandert voor je herstelt.', defaultOn: false, available: true },
  { id: 'bridge', title: 'Bridge', description: 'Tekst en links naar een van je eigen toestellen sturen, end-to-end versleuteld.', defaultOn: false, available: true },
  { id: 'intelligence', title: 'Intelligence', description: 'Voorstellen met uitleg, die pas iets doen als jij ze goedkeurt.', defaultOn: false, available: true },
  { id: 'devHub', title: 'Developer Hub', description: 'Eigen widgets bouwen, testen in een afgeschermde sandbox en pas na een review op je dashboard zetten.', defaultOn: false, available: true },
  { id: 'capture', title: 'Snel vastleggen', description: 'Te sorteren, sjablonen en geschiedenis bij Snelle notitie: links en ideeën nu bewaren, later een plek geven.', defaultOn: false, available: true },
  { id: 'briefing', title: 'Dagbriefing', description: 'Dagstart 2.0: je dag in één overzicht met prioriteiten, vrije blokken en een geschiedenis, en de belangrijkste punten mee in je Dagstart.', defaultOn: false, available: true },
]

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
