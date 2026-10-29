/**
 * NEXUS Intelligence (blueprint fase 5): rules that look at what NEXUS already knows and propose a
 * flow, with why, which data they used and what approving does. Nothing happens until you approve;
 * an approved proposal becomes an ordinary flow in Flow Studio. Rules only, no AI. Pure logic.
 */
import type { FlowAction, FlowCondition, FlowDefinition, FlowTrigger } from './flows'
import { isTime } from './profiles'

export type RuleId = 'school' | 'deadlines' | 'updates'
export const RULE_IDS: RuleId[] = ['school', 'deadlines', 'updates']
export const RULE_INFO: Record<RuleId, { title: string; description: string }> = {
  school: { title: 'School', description: 'Stelt een flow voor die School Mode aanzet voor je lessen, als dat nog niet op een schema staat.' },
  deadlines: { title: 'Deadlines', description: 'Stelt een flow voor die je vooraf waarschuwt, als er deadlines aankomen en zo een flow er nog niet is.' },
  updates: { title: 'Updates', description: "Stelt in de Windows-app een flow voor die een nieuwe versie 's avonds voorstelt in plaats van tussendoor." },
}

/** What the rules look at, gathered by the web app. Titles of deadlines are not part of it. */
export interface IntelFacts {
  now: number
  /** First lesson per weekday (1 = Monday ... 7 = Sunday) as HH:MM, from the timetable and the school calendar. */
  firstLessons: Partial<Record<number, string>>
  /** School Mode switches on by itself on a schedule (Profielen). */
  scheduleOn: boolean
  flows: FlowDefinition[]
  /** Open deadlines due in the next 7 days. */
  deadlinesSoon: number
  isDesktop: boolean
  /** The version waiting to be installed, if any. */
  updateAvailable: string | null
}

export interface FlowDraft {
  name: string
  trigger: FlowTrigger
  conditions: FlowCondition[]
  actions: FlowAction[]
}

export interface Candidate {
  rule: RuleId
  /** Same situation, same key: a declined proposal does not come back for it. */
  key: string
  title: string
  /** Why it shows up. */
  reason: string
  /** Which data the rule used. */
  data: string[]
  flow: FlowDraft
}

export type SuggestionStatus = 'open' | 'snoozed' | 'accepted' | 'dismissed' | 'expired'

export interface Suggestion extends Candidate {
  id: string
  createdAt: number
  status: SuggestionStatus
  decidedAt?: number
  snoozedUntil?: number
  /** The flow made when it was approved. */
  flowId?: string
}

export interface RuleState {
  enabled: boolean
  /** No new proposal from this rule before then (anti-spam after "Weigeren" or "Verlopen"). */
  cooldownUntil: number
}

export interface IntelState {
  suggestions: Suggestion[]
  rules: Record<RuleId, RuleState>
  /** When the last new proposal appeared: at most one per hour, from all rules together. */
  lastNewAt: number
}

export const DECLINE_COOLDOWN_MS = 14 * 86_400_000
export const EXPIRE_MS = 7 * 86_400_000
export const EXPIRE_COOLDOWN_MS = 3 * 86_400_000
export const SNOOZE_MS = 86_400_000
export const NEW_GAP_MS = 60 * 60_000
export const MAX_SUGGESTIONS = 50

export const emptyIntel = (): IntelState => ({
  suggestions: [],
  rules: { school: { enabled: true, cooldownUntil: 0 }, deadlines: { enabled: true, cooldownUntil: 0 }, updates: { enabled: true, cooldownUntil: 0 } },
  lastNewAt: 0,
})

const DAYS = ['', 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

const hasTrigger = (flows: FlowDefinition[], type: FlowTrigger['type']) => flows.some((f) => f.trigger.type === type)

/** The proposals the rules make right now; a rule makes none when there is nothing to improve. */
export function evaluateRules(f: IntelFacts): Candidate[] {
  const out: Candidate[] = []

  // School: lessons on fixed weekdays, but nothing turns School Mode on for them.
  const days = Object.keys(f.firstLessons).map(Number).filter((d) => d >= 1 && d <= 7 && isTime(f.firstLessons[d])).sort()
  const schoolFlow = f.flows.some((fl) => fl.trigger.type === 'schedule.at_time' && fl.actions.some((a) => a.type === 'profile.activate' && a.profile === 'school'))
  if (days.length >= 2 && !f.scheduleOn && !schoolFlow) {
    const earliest = Math.min(...days.map((d) => toMinutes(f.firstLessons[d]!)))
    const time = toTime(Math.max(0, earliest - 15))
    out.push({
      rule: 'school',
      key: `school:${days.join('')}`,
      title: 'School Mode aanzetten voor je lessen',
      reason: `Je hebt les op ${days.map((d) => DAYS[d]).join(', ')}, de eerste meestal vanaf ${toTime(earliest)}, maar School Mode staat niet op een schema en geen flow zet het aan.`,
      data: ['Lesrooster en schoolkalender (alleen de dagen en het beginuur)', 'Schema van Profielen', 'Je flows'],
      flow: {
        name: 'School Mode voor de les',
        trigger: { type: 'schedule.at_time', days, time },
        conditions: [],
        actions: [{ type: 'profile.activate', profile: 'school', duration: 'until-change' }],
      },
    })
  }

  // Deadlines: some are coming up, but no flow warns ahead.
  if (f.deadlinesSoon >= 1 && !hasTrigger(f.flows, 'deadline.upcoming')) {
    out.push({
      rule: 'deadlines',
      key: 'deadlines:warn',
      title: 'Een seintje voor je deadlines',
      reason: `Je hebt ${f.deadlinesSoon === 1 ? 'een deadline' : `${f.deadlinesSoon} deadlines`} in de komende 7 dagen, en nog geen flow die je vooraf waarschuwt.`,
      data: ['Aantal open deadlines in Agenda (niet de titels)', 'Je flows'],
      flow: {
        name: 'Deadline morgen',
        trigger: { type: 'deadline.upcoming', minutesBefore: 1440 },
        conditions: [],
        actions: [{ type: 'notification.send', title: 'Morgen: {titel}', text: 'Om {tijd}.', target: 'phone' }],
      },
    })
  }

  // Updates: the Windows app, without a calm moment for new versions.
  if (f.isDesktop && !hasTrigger(f.flows, 'update.available')) {
    out.push({
      rule: 'updates',
      key: 'updates:evening',
      title: "Updates 's avonds voorstellen",
      reason: f.updateAvailable
        ? `Versie ${f.updateAvailable} wacht. Met deze flow stelt NEXUS een nieuwe versie 's avonds voor, en niet midden in de les of tijdens het werk.`
        : "Je gebruikt de Windows-app. Met deze flow stelt NEXUS een nieuwe versie 's avonds voor, en niet midden in de les of tijdens het werk.",
      data: ['Of dit de Windows-app is', 'Of er een update klaarstaat', 'Je flows'],
      flow: {
        name: 'Update-moment',
        trigger: { type: 'update.available' },
        conditions: [{ type: 'local_time.in_range', start: '18:00', end: '23:00' }],
        actions: [{ type: 'update.prompt' }],
      },
    })
  }
  return out
}

/** What approving does, in plain words, for the proposal card. */
export function describeFlow(d: FlowDraft): string[] {
  const lines: string[] = []
  const t = d.trigger
  if (t.type === 'schedule.at_time') lines.push(`Wanneer: op ${t.days.map((x) => DAYS[x]).join(', ')} om ${t.time}`)
  else if (t.type === 'deadline.upcoming') lines.push(`Wanneer: ${t.minutesBefore >= 1440 ? `${t.minutesBefore / 1440} dag` : t.minutesBefore >= 60 ? `${t.minutesBefore / 60} uur` : `${t.minutesBefore} minuten`} voor een deadline`)
  else if (t.type === 'update.available') lines.push('Wanneer: er is een nieuwe versie')
  for (const c of d.conditions) if (c.type === 'local_time.in_range') lines.push(`Alleen als: tussen ${c.start} en ${c.end}`)
  for (const a of d.actions) {
    if (a.type === 'profile.activate') lines.push(`Doe dit: profiel ${a.profile === 'school' ? 'School' : a.profile} aanzetten`)
    else if (a.type === 'notification.send') lines.push(`Doe dit: een melding op ${a.target === 'phone' ? 'je gsm en horloge' : 'dit toestel'}`)
    else if (a.type === 'update.prompt') lines.push('Doe dit: de update voorstellen (nooit vanzelf installeren)')
    else if (a.type === 'app.open_prompt') lines.push('Doe dit: voorstellen om een app te openen')
  }
  lines.push('De flow komt in Flow Studio, waar je hem altijd kan aanpassen, pauzeren of verwijderen.')
  return lines
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const STATUSES: SuggestionStatus[] = ['open', 'snoozed', 'accepted', 'dismissed', 'expired']

export function parseIntel(raw: unknown): IntelState {
  const base = emptyIntel()
  if (!isObject(raw)) return base
  const rules = isObject(raw.rules) ? raw.rules : {}
  for (const id of RULE_IDS) {
    const r = isObject(rules[id]) ? (rules[id] as Record<string, unknown>) : {}
    base.rules[id] = { enabled: r.enabled !== false, cooldownUntil: isNum(r.cooldownUntil) ? r.cooldownUntil : 0 }
  }
  base.lastNewAt = isNum(raw.lastNewAt) ? raw.lastNewAt : 0
  base.suggestions = (Array.isArray(raw.suggestions) ? raw.suggestions : [])
    .filter((s): s is Suggestion => isObject(s) && typeof s.id === 'string' && RULE_IDS.includes(s.rule as RuleId) && typeof s.key === 'string' && isObject(s.flow) && isNum(s.createdAt))
    .map((s) => ({ ...s, status: STATUSES.includes(s.status) ? s.status : 'expired' }))
    .slice(0, MAX_SUGGESTIONS)
  return base
}

/**
 * Brings the proposals up to date: open ones whose situation is gone disappear, old open ones
 * expire (with a short cooldown), snoozed ones return, and at most one new proposal appears per
 * hour, never from a disabled rule, a rule in cooldown, or for a key you already decided on.
 */
export function refreshSuggestions(state: IntelState, candidates: Candidate[], now: number, newId: () => string): { state: IntelState; added: Suggestion | null } {
  const byRule = new Map(candidates.map((c) => [c.rule, c]))
  const rules = { ...state.rules }
  let suggestions = state.suggestions.flatMap((s): Suggestion[] => {
    if (s.status !== 'open' && s.status !== 'snoozed') return [s]
    const still = byRule.get(s.rule)
    // The situation changed (e.g. you made such a flow yourself): the proposal goes quietly.
    if (!still || still.key !== s.key || !rules[s.rule].enabled) return []
    // Your own changes to the flow (Aanpassen) stay; the explanation follows the current situation.
    const fresh = { ...s, title: still.title, reason: still.reason, data: still.data }
    if (s.status === 'snoozed' && (s.snoozedUntil ?? 0) <= now) return [{ ...fresh, status: 'open', snoozedUntil: undefined }]
    if (s.status === 'open' && now - s.createdAt > EXPIRE_MS) {
      rules[s.rule] = { ...rules[s.rule], cooldownUntil: now + EXPIRE_COOLDOWN_MS }
      return [{ ...s, status: 'expired', decidedAt: now }]
    }
    return [fresh]
  })
  let added: Suggestion | null = null
  let lastNewAt = state.lastNewAt
  if (lastNewAt === 0 || now - lastNewAt >= NEW_GAP_MS) {
    const fresh = candidates.find(
      (c) =>
        rules[c.rule].enabled &&
        rules[c.rule].cooldownUntil <= now &&
        !suggestions.some((s) => s.rule === c.rule && (s.status === 'open' || s.status === 'snoozed')) &&
        !suggestions.some((s) => s.key === c.key && (s.status === 'accepted' || s.status === 'dismissed')),
    )
    if (fresh) {
      added = { ...fresh, id: newId(), createdAt: now, status: 'open' }
      suggestions = [added, ...suggestions]
      lastNewAt = now
    }
  }
  return { state: { suggestions: suggestions.slice(0, MAX_SUGGESTIONS), rules, lastNewAt }, added }
}

export type Decision = 'accept' | 'dismiss' | 'snooze'

/** Your answer to a proposal. Weigeren keeps the rule quiet for 14 days; Later brings it back tomorrow. */
export function decide(state: IntelState, id: string, decision: Decision, now: number, flowId?: string): IntelState {
  const s = state.suggestions.find((x) => x.id === id)
  if (!s || (s.status !== 'open' && s.status !== 'snoozed')) return state
  const rules = { ...state.rules }
  const next: Suggestion =
    decision === 'accept'
      ? { ...s, status: 'accepted', decidedAt: now, ...(flowId ? { flowId } : {}) }
      : decision === 'dismiss'
        ? { ...s, status: 'dismissed', decidedAt: now }
        : { ...s, status: 'snoozed', snoozedUntil: now + SNOOZE_MS }
  if (decision === 'dismiss') rules[s.rule] = { ...rules[s.rule], cooldownUntil: now + DECLINE_COOLDOWN_MS }
  return { ...state, rules, suggestions: state.suggestions.map((x) => (x.id === id ? next : x)) }
}

/** The proposal with your changes (Aanpassen), checked like a flow from the builder. */
export function adjustDraft(state: IntelState, id: string, flow: FlowDraft): IntelState {
  return { ...state, suggestions: state.suggestions.map((s) => (s.id === id && (s.status === 'open' || s.status === 'snoozed') ? { ...s, flow } : s)) }
}

export function setRule(state: IntelState, rule: RuleId, enabled: boolean): IntelState {
  return {
    ...state,
    rules: { ...state.rules, [rule]: { ...state.rules[rule], enabled } },
    suggestions: enabled ? state.suggestions : state.suggestions.filter((s) => !(s.rule === rule && (s.status === 'open' || s.status === 'snoozed'))),
  }
}

/** Forgets every answer and cooldown, so all rules can propose again. */
export function resetFeedback(state: IntelState): IntelState {
  return { ...emptyIntel(), rules: Object.fromEntries(RULE_IDS.map((r) => [r, { enabled: state.rules[r].enabled, cooldownUntil: 0 }])) as IntelState['rules'] }
}

/** The flow an approved proposal becomes; a new id, on, in the device's time zone. */
export function draftToFlow(d: FlowDraft, id: string, now: number): FlowDefinition {
  return { id, name: d.name, enabled: true, version: 1, trigger: d.trigger, conditions: d.conditions, actions: d.actions, timeZone: '', createdAt: now, updatedAt: now }
}
