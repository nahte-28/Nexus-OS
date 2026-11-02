/**
 * Intelligence 2.0: per module choose what NEXUS AI may see, and one history of every approval
 * (actions of NEXUS AI and proposals of Intelligence). Pure logic; the web app stores it on the
 * device and leaves out what is switched off before anything goes to the server.
 */

export type AiModule = 'notes' | 'agenda' | 'reminders' | 'habits' | 'grades' | 'focus' | 'finance' | 'devices' | 'appearance'

export interface AiModuleInfo {
  id: AiModule
  title: string
  /** What NEXUS AI gets to see or do when the module is on. */
  description: string
  /** The assistant's actions that belong to the module. */
  tools: string[]
}

export const AI_MODULES: AiModuleInfo[] = [
  {
    id: 'notes',
    title: 'Notities',
    description: 'Notities zoeken en lezen, en nieuwe notities maken.',
    tools: ['search_notes', 'create_note'],
  },
  {
    id: 'agenda',
    title: 'Agenda en lesrooster',
    description: 'Deadlines, afspraken en lessen bekijken en toevoegen; ook in het Weekoverzicht.',
    tools: ['list_agenda', 'create_deadline', 'create_appointment'],
  },
  {
    id: 'reminders',
    title: 'Herinneringen',
    description: 'Herinneringen bekijken, plannen en verwijderen; ook in het Weekoverzicht.',
    tools: ['list_reminders', 'create_reminder', 'delete_reminder'],
  },
  {
    id: 'habits',
    title: 'Gewoontes',
    description: 'Je gewoontes en reeksen in het Weekoverzicht.',
    tools: [],
  },
  {
    id: 'grades',
    title: 'Cijfers',
    description: 'Je cijfers in het Weekoverzicht.',
    tools: [],
  },
  {
    id: 'focus',
    title: 'Focustijd',
    description: 'Je focusblokken in het Weekoverzicht.',
    tools: [],
  },
  {
    id: 'finance',
    title: 'Financiën',
    description: 'De totalen van een maand voor het geldadvies.',
    tools: [],
  },
  {
    id: 'devices',
    title: 'Apparaten',
    description: 'Meldingen naar je gsm en horloge sturen.',
    tools: ['send_to_phone'],
  },
  {
    id: 'appearance',
    title: 'Thema',
    description: 'Het thema van NEXUS wisselen.',
    tools: ['set_theme'],
  },
]

export const AI_MODULE_IDS = AI_MODULES.map((m) => m.id)

export type AiContext = Record<AiModule, boolean>

/** Everything on: how NEXUS AI worked before Intelligence 2.0. */
export const fullAiContext = (): AiContext => Object.fromEntries(AI_MODULE_IDS.map((id) => [id, true])) as AiContext

export function parseAiContext(raw: unknown): AiContext {
  const out = fullAiContext()
  if (typeof raw !== 'object' || raw === null) return out
  for (const id of AI_MODULE_IDS) {
    const v = (raw as Record<string, unknown>)[id]
    if (typeof v === 'boolean') out[id] = v
  }
  return out
}

/** The module an action belongs to; null for an unknown action. */
export function toolModule(tool: string): AiModule | null {
  return AI_MODULES.find((m) => m.tools.includes(tool))?.id ?? null
}

/** The actions NEXUS AI may use with these settings, in a fixed order. */
export function allowedTools(context: AiContext): string[] {
  return AI_MODULES.filter((m) => context[m.id]).flatMap((m) => m.tools)
}

/** Titles of the modules that are switched off, for the note to the model and the screen. */
export function hiddenModules(context: AiContext): string[] {
  return AI_MODULES.filter((m) => !context[m.id]).map((m) => m.title)
}

export type ApprovalSource = 'ai' | 'intelligence'

/**
 * allowed / denied: your answer on a permission card; always: allowed and "voortaan altijd";
 * auto: ran without asking because of an earlier "altijd"; blocked: the module was switched off.
 * accepted / dismissed / snoozed / expired: what happened to a proposal of Intelligence.
 */
export type ApprovalOutcome = 'allowed' | 'always' | 'auto' | 'denied' | 'blocked' | 'accepted' | 'dismissed' | 'snoozed' | 'expired'

export const OUTCOME_LABELS: Record<ApprovalOutcome, string> = {
  allowed: 'Toegestaan',
  always: 'Altijd toegestaan',
  auto: 'Vanzelf (altijd toegestaan)',
  denied: 'Geweigerd',
  blocked: 'Tegengehouden (module uit)',
  accepted: 'Goedgekeurd',
  dismissed: 'Geweigerd',
  snoozed: 'Later',
  expired: 'Verlopen',
}

export interface ApprovalEntry {
  id: string
  at: number
  source: ApprovalSource
  outcome: ApprovalOutcome
  /** The action or proposal, e.g. "Herinnering plannen". */
  label: string
  /** One sentence about what it would do. */
  detail: string
}

export const MAX_APPROVALS = 300

/** Newest first, at most [MAX_APPROVALS]. */
export function addApproval(list: ApprovalEntry[], entry: ApprovalEntry): ApprovalEntry[] {
  return [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, MAX_APPROVALS)
}

const OUTCOMES = Object.keys(OUTCOME_LABELS)

export function parseApprovals(raw: unknown): ApprovalEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (e): e is ApprovalEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof e.id === 'string' &&
        typeof e.at === 'number' &&
        (e.source === 'ai' || e.source === 'intelligence') &&
        OUTCOMES.includes(e.outcome) &&
        typeof e.label === 'string' &&
        typeof e.detail === 'string',
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_APPROVALS)
}

export type ApprovalFilter = 'all' | ApprovalSource | 'denied'

const NO = new Set<ApprovalOutcome>(['denied', 'blocked', 'dismissed'])

export function filterApprovals(list: ApprovalEntry[], filter: ApprovalFilter): ApprovalEntry[] {
  if (filter === 'all') return list
  if (filter === 'denied') return list.filter((e) => NO.has(e.outcome))
  return list.filter((e) => e.source === filter)
}

/** Counts for the top of the history: how often yes, how often no. */
export function approvalCounts(list: ApprovalEntry[]): {
  yes: number
  no: number
  other: number
} {
  let yes = 0
  let no = 0
  let other = 0
  for (const e of list) {
    if (NO.has(e.outcome)) no++
    else if (e.outcome === 'snoozed' || e.outcome === 'expired') other++
    else yes++
  }
  return { yes, no, other }
}
