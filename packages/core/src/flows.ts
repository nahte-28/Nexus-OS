/**
 * NEXUS Flow Studio: automations as Trigger → Conditions → Actions. Only whitelisted building
 * blocks, no code; every run is deterministic and recorded. Pure logic, no storage or clocks.
 */
import { isTime, localClock, PROFILE_IDS, type ProfileId } from './profiles'
import type { AppId } from './windows'

export type TriggerType =
  | 'schedule.at_time'
  | 'deadline.upcoming'
  | 'device.offline'
  | 'update.available'
  | 'finance.budget_used'
  | 'finance.payment_due'
  | 'finance.expense_added'
  | 'manual'
export type ConditionType = 'profile.is_active' | 'local_time.in_range' | 'network.online'
export type ActionType = 'profile.activate' | 'notification.send' | 'app.open_prompt' | 'update.prompt'

export type ProfileDuration = 'until-change' | 'hour' | 'today'
export type NotifyTarget = 'this_device' | 'phone'

export type FlowTrigger =
  | { type: 'schedule.at_time'; days: number[]; time: string }
  | { type: 'deadline.upcoming'; minutesBefore: number }
  | { type: 'device.offline'; minutes: number }
  | { type: 'update.available' }
  /** A budget passes [percent] of what it has this month. */
  | { type: 'finance.budget_used'; percent: number }
  /** A subscription is paid within [daysBefore] days (0 is on the day itself). */
  | { type: 'finance.payment_due'; daysBefore: number }
  /** An expense of at least [minAmount] cents is added by hand; imports from the bank do not count. */
  | { type: 'finance.expense_added'; minAmount: number }
  | { type: 'manual' }

export type FlowCondition =
  | { type: 'profile.is_active'; profile: ProfileId }
  | { type: 'local_time.in_range'; start: string; end: string }
  | { type: 'network.online' }

export type FlowAction =
  | { type: 'profile.activate'; profile: ProfileId; duration: ProfileDuration }
  | { type: 'notification.send'; title: string; text: string; target: NotifyTarget }
  | { type: 'app.open_prompt'; app: AppId }
  | { type: 'update.prompt' }

export interface FlowDefinition {
  id: string
  name: string
  enabled: boolean
  /** Goes up with every saved change. */
  version: number
  trigger: FlowTrigger
  /** All must hold (AND). */
  conditions: FlowCondition[]
  actions: FlowAction[]
  /** IANA zone, e.g. Europe/Brussels; the device's zone when empty. */
  timeZone: string
  createdAt: number
  updatedAt: number
}

/** What the engine looks at; gathered from Profiles, Reminders, Connect and the updater. */
export interface FlowContext {
  now: number
  activeProfile: ProfileId
  online: boolean
  deadlines: { id: string; title: string; at: number }[]
  /** The other devices of the account. */
  devices: { id: string; name: string; lastSeenAt: number }[]
  update: { version: string } | null
  /** What Financiën knows right now; absent where the app is not used. */
  finance?: FinanceFlowFacts
}

/** The parts of Financiën a flow can start on, with amounts already written out. */
export interface FinanceFlowFacts {
  budgets: { id: string; month: string; label: string; used: number; left: string }[]
  payments: { id: string; name: string; amount: string; date: string; dateLabel: string }[]
  expenses: { id: string; amount: number; amountText: string; category: string; createdAt: number; imported: boolean }[]
}

/** One thing that happened and may start a flow. The id makes a run happen once per event. */
export interface FlowEvent {
  id: string
  label: string
  vars: Record<string, string>
}

export const MAX_ACTIONS = 5
export const MAX_CONDITIONS = 5
/** A broken flow can never flood the devices: at most this many runs per flow per hour. */
export const MAX_RUNS_PER_HOUR = 6
/** A planned time is still caught up this long after it passed (NEXUS was asleep or just opened). */
export const CATCH_UP_MINUTES = 30

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  'schedule.at_time': 'Op een vast tijdstip',
  'deadline.upcoming': 'Een deadline komt eraan',
  'device.offline': 'Een apparaat is offline',
  'update.available': 'Er is een update',
  'finance.budget_used': 'Een budget raakt op',
  'finance.payment_due': 'Een abonnement wordt betaald',
  'finance.expense_added': 'Een uitgave wordt toegevoegd',
  manual: 'Als ik op Uitvoeren druk',
}
export const CONDITION_LABELS: Record<ConditionType, string> = {
  'profile.is_active': 'Profiel is actief',
  'local_time.in_range': 'Tussen twee uren',
  'network.online': 'Dit apparaat is online',
}
export const ACTION_LABELS: Record<ActionType, string> = {
  'profile.activate': 'Profiel activeren',
  'notification.send': 'Melding sturen',
  'app.open_prompt': 'Voorstellen om een app te openen',
  'update.prompt': 'Voorstellen om de update te installeren',
}
export const TRIGGER_TYPES = Object.keys(TRIGGER_LABELS) as TriggerType[]
export const CONDITION_TYPES = Object.keys(CONDITION_LABELS) as ConditionType[]
export const ACTION_TYPES = Object.keys(ACTION_LABELS) as ActionType[]

/** Apps a flow may suggest opening. */
export const PROMPT_APPS: AppId[] = ['klashub', 'notes', 'reminders', 'assistant', 'notifications', 'devices', 'profiles', 'finance']

export function defaultTrigger(type: TriggerType): FlowTrigger {
  switch (type) {
    case 'schedule.at_time':
      return { type, days: [1, 2, 3, 4, 5], time: '08:30' }
    case 'deadline.upcoming':
      return { type, minutesBefore: 60 }
    case 'device.offline':
      return { type, minutes: 60 }
    case 'finance.budget_used':
      return { type, percent: 90 }
    case 'finance.payment_due':
      return { type, daysBefore: 1 }
    case 'finance.expense_added':
      return { type, minAmount: 5000 }
    case 'update.available':
    case 'manual':
      return { type }
  }
}

export function defaultCondition(type: ConditionType): FlowCondition {
  switch (type) {
    case 'profile.is_active':
      return { type, profile: 'school' }
    case 'local_time.in_range':
      return { type, start: '18:00', end: '23:00' }
    case 'network.online':
      return { type }
  }
}

export function defaultAction(type: ActionType): FlowAction {
  switch (type) {
    case 'profile.activate':
      return { type, profile: 'school', duration: 'until-change' }
    case 'notification.send':
      return { type, title: 'NEXUS', text: '', target: 'this_device' }
    case 'app.open_prompt':
      return { type, app: 'klashub' }
    case 'update.prompt':
      return { type }
  }
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/** Whether [minutes] lies in start-end; an end before the start runs past midnight. */
function inRange(start: string, end: string, minutes: number): boolean {
  const s = minutesOf(start)
  const e = minutesOf(end)
  return s <= e ? minutes >= s && minutes < e : minutes >= s || minutes < e
}

/** The local date of [at] in [timeZone], as YYYY-MM-DD. */
export function localDate(at: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(at),
  )
}

/** Checks a definition from the builder or from storage; the first problem in plain Dutch. */
export function validateFlow(flow: FlowDefinition): string | null {
  if (!flow.name.trim()) return 'Geef de flow een naam.'
  if (flow.name.length > 80) return 'De naam is te lang.'
  const t = flow.trigger
  if (!TRIGGER_TYPES.includes(t?.type)) return 'Kies wanneer de flow start.'
  if (t.type === 'schedule.at_time') {
    if (!isTime(t.time)) return 'Kies een geldig tijdstip.'
    if (!Array.isArray(t.days) || t.days.length === 0 || t.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7))
      return 'Kies minstens één dag.'
  }
  if (t.type === 'deadline.upcoming' && !(Number.isInteger(t.minutesBefore) && t.minutesBefore >= 5 && t.minutesBefore <= 7 * 24 * 60))
    return 'Kies tussen 5 minuten en 7 dagen op voorhand.'
  if (t.type === 'device.offline' && !(Number.isInteger(t.minutes) && t.minutes >= 15 && t.minutes <= 7 * 24 * 60))
    return 'Kies tussen 15 minuten en 7 dagen offline.'
  if (t.type === 'finance.budget_used' && !(Number.isInteger(t.percent) && t.percent >= 1 && t.percent <= 200)) return 'Kies een percentage tussen 1 en 200.'
  if (t.type === 'finance.payment_due' && !(Number.isInteger(t.daysBefore) && t.daysBefore >= 0 && t.daysBefore <= 30))
    return 'Kies tussen 0 en 30 dagen op voorhand.'
  if (t.type === 'finance.expense_added' && !(Number.isInteger(t.minAmount) && t.minAmount >= 0 && t.minAmount <= 10_000_000))
    return 'Kies een bedrag tot € 100.000.'
  if (flow.conditions.length > MAX_CONDITIONS) return `Hoogstens ${MAX_CONDITIONS} voorwaarden.`
  for (const c of flow.conditions) {
    if (!CONDITION_TYPES.includes(c?.type)) return 'Onbekende voorwaarde.'
    if (c.type === 'profile.is_active' && !PROFILE_IDS.includes(c.profile)) return 'Kies een profiel in de voorwaarde.'
    if (c.type === 'local_time.in_range' && (!isTime(c.start) || !isTime(c.end) || c.start === c.end)) return 'Kies twee verschillende uren.'
  }
  if (flow.actions.length === 0) return 'Voeg minstens één actie toe.'
  if (flow.actions.length > MAX_ACTIONS) return `Hoogstens ${MAX_ACTIONS} acties.`
  for (const a of flow.actions) {
    if (!ACTION_TYPES.includes(a?.type)) return 'Onbekende actie.'
    if (a.type === 'profile.activate' && (!PROFILE_IDS.includes(a.profile) || !['until-change', 'hour', 'today'].includes(a.duration)))
      return 'Kies een profiel en hoelang.'
    if (a.type === 'notification.send') {
      if (!a.title.trim() || a.title.length > 120) return 'Een melding heeft een korte titel nodig.'
      if (a.text.length > 1000) return 'De tekst van de melding is te lang.'
      if (a.target !== 'this_device' && a.target !== 'phone') return 'Kies waar de melding heen gaat.'
    }
    if (a.type === 'app.open_prompt' && !PROMPT_APPS.includes(a.app)) return 'Kies een app.'
  }
  if (flow.actions.some((a) => a.type === 'update.prompt') && t.type !== 'update.available')
    return 'De update voorstellen kan alleen als de flow start bij een update.'
  return null
}

/** The events of [flow]'s trigger at [ctx.now]. A manual flow only runs through runNow. */
export function triggerEvents(flow: FlowDefinition, ctx: FlowContext): FlowEvent[] {
  const t = flow.trigger
  switch (t.type) {
    case 'schedule.at_time': {
      const { day, minutes } = localClock(ctx.now, flow.timeZone)
      const late = minutes - minutesOf(t.time)
      if (!t.days.includes(day) || late < 0 || late > CATCH_UP_MINUTES) return []
      const date = localDate(ctx.now, flow.timeZone)
      return [{ id: `at:${date}`, label: `${date} om ${t.time}`, vars: { tijd: t.time } }]
    }
    case 'deadline.upcoming':
      return ctx.deadlines
        .filter((d) => d.at > ctx.now && d.at - ctx.now <= t.minutesBefore * 60_000)
        .map((d) => ({ id: `deadline:${d.id}@${d.at}`, label: d.title, vars: { titel: d.title, tijd: clock(d.at, flow.timeZone) } }))
    case 'device.offline':
      return ctx.devices
        .filter((d) => ctx.now - d.lastSeenAt >= t.minutes * 60_000)
        // Once per offline period: the id changes when the device is seen again.
        .map((d) => ({ id: `offline:${d.id}@${d.lastSeenAt}`, label: d.name, vars: { apparaat: d.name } }))
    case 'update.available':
      return ctx.update ? [{ id: `update:${ctx.update.version}`, label: `Versie ${ctx.update.version}`, vars: { versie: ctx.update.version } }] : []
    case 'finance.budget_used':
      return (ctx.finance?.budgets ?? [])
        .filter((b) => b.used >= t.percent)
        // Once per budget per month: the next month starts afresh.
        .map((b) => ({ id: `budget:${b.month}:${b.id}@${t.percent}`, label: b.label, vars: { categorie: b.label, procent: String(b.used), over: b.left } }))
    case 'finance.payment_due': {
      const today = localDate(ctx.now, flow.timeZone)
      return (ctx.finance?.payments ?? [])
        .filter((p) => p.date >= today && daysBetween(today, p.date) <= t.daysBefore)
        .map((p) => ({ id: `payment:${p.id}@${p.date}`, label: p.name, vars: { naam: p.name, bedrag: p.amount, datum: p.dateLabel } }))
    }
    case 'finance.expense_added':
      return (ctx.finance?.expenses ?? [])
        // Only new ones: added after the flow was saved and not longer ago than a catch-up.
        .filter((e) => !e.imported && e.amount >= t.minAmount && e.createdAt >= flow.updatedAt && ctx.now - e.createdAt <= CATCH_UP_MINUTES * 60_000)
        .map((e) => ({ id: `expense:${e.id}`, label: e.category, vars: { bedrag: e.amountText, categorie: e.category } }))
    case 'manual':
      return []
  }
}

/** Whole days from one YYYY-MM-DD to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86_400_000)
}

function clock(at: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('nl-BE', { timeZone: timeZone || undefined, hour: '2-digit', minute: '2-digit' }).format(new Date(at))
}

export function conditionHolds(c: FlowCondition, ctx: FlowContext, timeZone: string): boolean {
  switch (c.type) {
    case 'profile.is_active':
      return ctx.activeProfile === c.profile
    case 'local_time.in_range':
      return inRange(c.start, c.end, localClock(ctx.now, timeZone).minutes)
    case 'network.online':
      return ctx.online
  }
}

/** The first condition that does not hold, or null when the flow may run. */
export function failingCondition(flow: FlowDefinition, ctx: FlowContext): FlowCondition | null {
  return flow.conditions.find((c) => !conditionHolds(c, ctx, flow.timeZone)) ?? null
}

/** Fills in {titel}, {apparaat}, {tijd} and {versie} from the event. */
export function fillText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (all, key: string) => vars[key] ?? all)
}

export interface PlannedRun {
  flow: FlowDefinition
  event: FlowEvent
  /** Why it does not run; absent when it runs. */
  skipped?: 'condition' | 'paused' | 'rate-limit'
  condition?: FlowCondition
}

export interface FlowRuntime {
  /** flowId|eventId → when it was handled; keeps every event to one run. */
  handled: Record<string, number>
  /** Start times of recent runs per flow, for the rate limit. */
  recent: Record<string, number[]>
}

export const emptyRuntime = (): FlowRuntime => ({ handled: {}, recent: {} })

/** How long a handled event is remembered; longer than any trigger can repeat it. */
const KEEP_HANDLED_MS = 14 * 24 * 60 * 60_000

/**
 * The runs due at [ctx.now] that were not handled yet. Every event is handled once, also when
 * its conditions fail, so a flow never fires later for an old event.
 */
export function planRuns(flows: FlowDefinition[], ctx: FlowContext, runtime: FlowRuntime, paused = false): PlannedRun[] {
  const runs: PlannedRun[] = []
  for (const flow of flows) {
    if (!flow.enabled || validateFlow(flow)) continue
    const recent = (runtime.recent[flow.id] ?? []).filter((t) => ctx.now - t < 60 * 60_000)
    for (const event of triggerEvents(flow, ctx)) {
      if (runtime.handled[`${flow.id}|${event.id}`] !== undefined) continue
      const condition = failingCondition(flow, ctx)
      if (paused) runs.push({ flow, event, skipped: 'paused' })
      else if (condition) runs.push({ flow, event, skipped: 'condition', condition })
      else if (recent.length >= MAX_RUNS_PER_HOUR) runs.push({ flow, event, skipped: 'rate-limit' })
      else {
        recent.push(ctx.now)
        runs.push({ flow, event })
      }
    }
  }
  return runs
}

/** Records [runs] as handled and forgets old events. */
export function markHandled(runtime: FlowRuntime, runs: PlannedRun[], now: number): FlowRuntime {
  const handled = Object.fromEntries(Object.entries(runtime.handled).filter(([, at]) => now - at < KEEP_HANDLED_MS))
  const recent: Record<string, number[]> = {}
  for (const [id, times] of Object.entries(runtime.recent)) recent[id] = times.filter((t) => now - t < 60 * 60_000)
  for (const run of runs) {
    handled[`${run.flow.id}|${run.event.id}`] = now
    if (!run.skipped) recent[run.flow.id] = [...(recent[run.flow.id] ?? []), now]
  }
  return { handled, recent }
}

const DURATION_LABELS: Record<ProfileDuration, string> = { 'until-change': 'tot het schema wisselt', hour: 'voor een uur', today: 'voor vandaag' }
const TARGET_LABELS: Record<NotifyTarget, string> = { this_device: 'op het apparaat dat de flow uitvoert', phone: 'ook op gsm en horloge' }
const PROFILE_NAMES: Record<ProfileId, string> = { school: 'School', personal: 'Persoonlijk', gaming: 'Gaming', developer: 'Developer' }
const DAY_NAMES = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

export function describeTrigger(t: FlowTrigger): string {
  switch (t.type) {
    case 'schedule.at_time':
      return `Om ${t.time} op ${[...t.days].sort().map((d) => DAY_NAMES[d - 1]).join(', ')}`
    case 'deadline.upcoming':
      return `${t.minutesBefore} minuten voor een herinnering afgaat`
    case 'device.offline':
      return `Als een apparaat ${t.minutes} minuten offline is`
    case 'update.available':
      return 'Als er een nieuwe versie van de Windows-app is'
    case 'finance.budget_used':
      return `Als een budget ${t.percent}% gebruikt heeft`
    case 'finance.payment_due':
      return t.daysBefore === 0 ? 'Op de dag dat een abonnement betaald wordt' : t.daysBefore === 1 ? 'De dag voor een abonnement betaald wordt' : `${t.daysBefore} dagen voor een abonnement betaald wordt`
    case 'finance.expense_added':
      return t.minAmount > 0 ? `Als je een uitgave van minstens € ${(t.minAmount / 100).toFixed(2).replace('.', ',').replace(/,00$/, '')} toevoegt` : 'Als je een uitgave toevoegt'
    case 'manual':
      return 'Als je op Uitvoeren drukt'
  }
}

export function describeCondition(c: FlowCondition): string {
  switch (c.type) {
    case 'profile.is_active':
      return `${PROFILE_NAMES[c.profile]} is actief`
    case 'local_time.in_range':
      return `Tussen ${c.start} en ${c.end}`
    case 'network.online':
      return 'Dit apparaat is online'
  }
}

export function describeAction(a: FlowAction, vars: Record<string, string> = {}, appName: (id: AppId) => string = (id) => id): string {
  switch (a.type) {
    case 'profile.activate':
      return `${PROFILE_NAMES[a.profile]} activeren ${DURATION_LABELS[a.duration]}`
    case 'notification.send':
      return `Melding "${fillText(a.title, vars)}" ${TARGET_LABELS[a.target]}`
    case 'app.open_prompt':
      return `Voorstellen om ${appName(a.app)} te openen`
    case 'update.prompt':
      return 'Voorstellen om de update te installeren'
  }
}

/** When a scheduled flow next starts after [at]; null for event triggers. */
export function nextScheduledRun(flow: FlowDefinition, at: number): number | null {
  if (flow.trigger.type !== 'schedule.at_time' || !flow.enabled) return null
  const { day, minutes } = localClock(at, flow.timeZone)
  const target = minutesOf(flow.trigger.time)
  for (let d = 0; d <= 7; d++) {
    const weekday = ((day - 1 + d) % 7) + 1
    if (!flow.trigger.days.includes(weekday) || (d === 0 && target <= minutes)) continue
    const rough = at + (d * 24 * 60 + target - minutes) * 60_000
    // Correct for a summer/winter time change in between.
    return rough + (target - localClock(rough, flow.timeZone).minutes) * 60_000
  }
  return null
}

export function isFlowDefinition(value: unknown): value is FlowDefinition {
  const f = value as FlowDefinition
  return (
    typeof f === 'object' &&
    f !== null &&
    typeof f.id === 'string' &&
    typeof f.name === 'string' &&
    typeof f.enabled === 'boolean' &&
    typeof f.trigger === 'object' &&
    Array.isArray(f.conditions) &&
    Array.isArray(f.actions) &&
    validateFlow({ ...f, timeZone: typeof f.timeZone === 'string' ? f.timeZone : '' }) === null
  )
}

export interface FlowTemplate {
  id: string
  title: string
  category: 'School' | 'Apparaten' | 'Updates' | 'Productiviteit' | 'Geld'
  description: string
  flow: Pick<FlowDefinition, 'name' | 'trigger' | 'conditions' | 'actions'>
}

/** The first-party recipes from the Flow Studio blueprint. */
export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'school-start',
    title: 'School Start',
    category: 'School',
    description: 'Op schooldagen School Mode aanzetten en voorstellen om KlasHub te openen. Andere apps blijven open.',
    flow: {
      name: 'School Start',
      trigger: { type: 'schedule.at_time', days: [1, 2, 3, 4, 5], time: '08:30' },
      conditions: [],
      actions: [
        { type: 'profile.activate', profile: 'school', duration: 'until-change' },
        { type: 'app.open_prompt', app: 'klashub' },
      ],
    },
  },
  {
    id: 'deadline-reminder',
    title: 'Deadline eraan',
    category: 'School',
    description: 'Een uur voor een herinnering afgaat al een seintje op je gsm en horloge.',
    flow: {
      name: 'Deadline eraan',
      trigger: { type: 'deadline.upcoming', minutesBefore: 60 },
      conditions: [],
      actions: [{ type: 'notification.send', title: 'Binnen een uur: {titel}', text: 'Om {tijd}.', target: 'phone' }],
    },
  },
  {
    id: 'update-window',
    title: 'Update-moment',
    category: 'Updates',
    description: "Een nieuwe versie van de Windows-app 's avonds voorstellen, nooit vanzelf installeren.",
    flow: {
      name: 'Update-moment',
      trigger: { type: 'update.available' },
      conditions: [{ type: 'local_time.in_range', start: '18:00', end: '23:00' }],
      actions: [{ type: 'update.prompt' }],
    },
  },
  {
    id: 'device-offline',
    title: 'Apparaat offline',
    category: 'Apparaten',
    description: 'Eén melding als een gekoppeld apparaat een uur niets van zich laat horen, pas opnieuw als het terug was.',
    flow: {
      name: 'Apparaat offline',
      trigger: { type: 'device.offline', minutes: 60 },
      conditions: [{ type: 'network.online' }],
      actions: [{ type: 'notification.send', title: '{apparaat} is offline', text: 'NEXUS heeft al een uur niets van dit apparaat gehoord.', target: 'this_device' }],
    },
  },
  {
    id: 'study-session',
    title: 'Studiesessie',
    category: 'Productiviteit',
    description: 'Met één druk een uur School Mode: rustig thema, alleen belangrijke meldingen en je deadlines in beeld.',
    flow: {
      name: 'Studiesessie',
      trigger: { type: 'manual' },
      conditions: [],
      actions: [
        { type: 'profile.activate', profile: 'school', duration: 'hour' },
        { type: 'app.open_prompt', app: 'reminders' },
      ],
    },
  },
  {
    id: 'budget-almost-up',
    title: 'Budget bijna op',
    category: 'Geld',
    description: 'Een seintje op je gsm als een budget voor 90% gebruikt is, één keer per maand.',
    flow: {
      name: 'Budget bijna op',
      trigger: { type: 'finance.budget_used', percent: 90 },
      conditions: [],
      actions: [{ type: 'notification.send', title: '{categorie}: {procent}% gebruikt', text: 'Nog {over} over deze maand.', target: 'phone' }],
    },
  },
  {
    id: 'big-expense',
    title: 'Grote uitgave',
    category: 'Geld',
    description: 'Bij een uitgave van € 50 of meer voorstellen om Financiën te openen en even je budget te bekijken.',
    flow: {
      name: 'Grote uitgave',
      trigger: { type: 'finance.expense_added', minAmount: 5000 },
      conditions: [],
      actions: [{ type: 'app.open_prompt', app: 'finance' }],
    },
  },
]

/** A flow as the account stores it: a definition, or a deletion, with the time of the change. */
export interface StoredFlow {
  id: string
  /** null when the flow was deleted. */
  definition: FlowDefinition | null
  /** Time of the last change in ms; the newer side wins. */
  revision: number
}

export interface MergedFlows {
  flows: FlowDefinition[]
  /** Deleted flows on this device: id → time of the deletion. */
  deleted: Record<string, number>
  /** What the account does not have yet. */
  push: StoredFlow[]
}

/**
 * Brings this device's flows and the account's together, one flow at a time: the newer change
 * wins, a deletion included. A copy from the account that no longer passes validation is ignored.
 */
export function mergeFlows(flows: FlowDefinition[], deleted: Record<string, number>, stored: StoredFlow[]): MergedFlows {
  const local = new Map<string, StoredFlow>()
  for (const [id, at] of Object.entries(deleted)) local.set(id, { id, definition: null, revision: at })
  for (const f of flows) local.set(f.id, { id: f.id, definition: f, revision: f.updatedAt })
  const remote = new Map(stored.filter((s) => s.definition === null || isFlowDefinition(s.definition)).map((s) => [s.id, s]))

  const result = new Map<string, StoredFlow>()
  const push: StoredFlow[] = []
  for (const id of new Set([...local.keys(), ...remote.keys()])) {
    const mine = local.get(id)
    const theirs = remote.get(id)
    if (mine && (!theirs || mine.revision > theirs.revision)) {
      result.set(id, mine)
      push.push(mine)
    } else if (theirs) {
      result.set(id, theirs.definition ? { ...theirs, definition: { ...theirs.definition, id, updatedAt: theirs.revision } } : theirs)
    }
  }
  const all = [...result.values()]
  // Keep the order of this device; flows from other devices go at the end, oldest first.
  const order = new Map(flows.map((f, i) => [f.id, i]))
  const merged = all
    .flatMap((s) => (s.definition ? [s.definition] : []))
    .sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || a.createdAt - b.createdAt)
  return {
    flows: merged,
    deleted: Object.fromEntries(all.filter((s) => !s.definition).map((s) => [s.id, s.revision])),
    push,
  }
}
