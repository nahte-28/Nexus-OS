/**
 * NEXUS Time Machine (blueprint fase 3): restore points of your configuration (profiles, flows and
 * Spaces), a readable diff before restoring, and a history of restores. Configuration only: notes,
 * files and other records are not part of it. Time Machine 2.0 adds a retention policy (thinning
 * older points, what automatic points take along, how long your own points stay) and restoring one
 * part: a single profile, flow, Space or setting. Pure logic; the web app captures and applies.
 */
import { PROFILE_IDS, type ProfilesState } from './profiles'

export type SnapshotScope = 'profiles' | 'flows' | 'spaces'
export const SNAPSHOT_SCOPES: SnapshotScope[] = ['profiles', 'flows', 'spaces']
export const SCOPE_NAMES: Record<SnapshotScope, string> = { profiles: 'Profielen en lesrooster', flows: 'Flows', spaces: 'Spaces' }

/** auto: after a change settled; start: when NEXUS opened; update: a new version started; before_restore: just before a restore. */
export type SnapshotReason = 'auto' | 'manual' | 'start' | 'update' | 'before_restore'

export interface ConfigSnapshot {
  id: string
  at: number
  reason: SnapshotReason
  label: string
  appVersion: string
  scopes: Partial<Record<SnapshotScope, unknown>>
  /** Characters of the stored payload, to keep the total within what the device can hold. */
  size: number
}

export interface RestoreJob {
  id: string
  snapshotId: string
  snapshotLabel: string
  at: number
  scopes: SnapshotScope[]
  /** rolled_back: something did not match afterwards and the configuration went back as it was. */
  status: 'done' | 'rolled_back'
  detail?: string
  /** Time Machine 2.0: only this part was put back, e.g. "Flow Ochtend". */
  part?: string
}

export interface TimeMachineSettings {
  /** Restore points after changes and when NEXUS starts. Manual ones always work. */
  auto: boolean
  /** Automatic restore points kept; manual ones do not count. */
  maxCount: number
  /** Automatic restore points older than this go. */
  retentionDays: number
  /** Thin out: all of the last day, then one per day, and after a week one per week. */
  thin: boolean
  /** What an automatic restore point takes along; manual ones always take everything. */
  autoScopes: SnapshotScope[]
  /** Your own restore points go after this many days; null keeps them until you delete them. */
  manualDays: number | null
}

export interface TimeMachineState {
  revision: number
  snapshots: ConfigSnapshot[]
  history: RestoreJob[]
  settings: TimeMachineSettings
  /** The NEXUS version that last ran here, to notice an update. */
  lastVersion: string
}

export const DEFAULT_TM_SETTINGS: TimeMachineSettings = { auto: true, maxCount: 30, retentionDays: 30, thin: false, autoScopes: [...SNAPSHOT_SCOPES], manualDays: null }
export const TM_COUNT_CHOICES = [10, 30, 50, 100]
export const TM_DAYS_CHOICES = [7, 30, 90, 365]
export const TM_MANUAL_DAYS_CHOICES = [90, 365]
export const MAX_HISTORY = 50
/** All restore points together, in characters; localStorage holds about 5 million. */
export const MAX_TOTAL_SIZE = 1_500_000
export const MAX_SNAPSHOT_SIZE = 300_000
export const MAX_LABEL = 80

export const emptyTimeMachine = (): TimeMachineState => ({ revision: 0, snapshots: [], history: [], settings: { ...DEFAULT_TM_SETTINGS, autoScopes: [...SNAPSHOT_SCOPES] }, lastVersion: '' })

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const REASONS: SnapshotReason[] = ['auto', 'manual', 'start', 'update', 'before_restore']

function parseSnapshot(v: unknown): ConfigSnapshot | null {
  if (!isObject(v) || typeof v.id !== 'string' || !isNum(v.at) || !isObject(v.scopes)) return null
  const scopes: ConfigSnapshot['scopes'] = {}
  for (const s of SNAPSHOT_SCOPES) if (v.scopes[s] !== undefined) scopes[s] = v.scopes[s]
  if (Object.keys(scopes).length === 0) return null
  return {
    id: v.id,
    at: v.at,
    reason: REASONS.includes(v.reason as SnapshotReason) ? (v.reason as SnapshotReason) : 'auto',
    label: typeof v.label === 'string' ? v.label.slice(0, MAX_LABEL) : '',
    appVersion: typeof v.appVersion === 'string' ? v.appVersion : '',
    scopes,
    size: isNum(v.size) ? v.size : JSON.stringify(scopes).length,
  }
}

function parseJob(v: unknown): RestoreJob | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.snapshotId !== 'string' || !isNum(v.at)) return null
  return {
    id: v.id,
    snapshotId: v.snapshotId,
    snapshotLabel: typeof v.snapshotLabel === 'string' ? v.snapshotLabel : '',
    at: v.at,
    scopes: Array.isArray(v.scopes) ? v.scopes.filter((s): s is SnapshotScope => SNAPSHOT_SCOPES.includes(s as SnapshotScope)) : [],
    status: v.status === 'rolled_back' ? 'rolled_back' : 'done',
    ...(typeof v.detail === 'string' ? { detail: v.detail.slice(0, 300) } : {}),
    ...(typeof v.part === 'string' ? { part: v.part.slice(0, MAX_LABEL) } : {}),
  }
}

export function parseTimeMachine(raw: unknown): TimeMachineState {
  if (!isObject(raw)) return emptyTimeMachine()
  const s = isObject(raw.settings) ? raw.settings : {}
  return {
    revision: isNum(raw.revision) ? raw.revision : 0,
    snapshots: (Array.isArray(raw.snapshots) ? raw.snapshots : []).map(parseSnapshot).filter((x): x is ConfigSnapshot => x !== null).sort((a, b) => b.at - a.at),
    history: (Array.isArray(raw.history) ? raw.history : []).map(parseJob).filter((x): x is RestoreJob => x !== null).slice(0, MAX_HISTORY),
    settings: {
      auto: s.auto !== false,
      maxCount: TM_COUNT_CHOICES.includes(s.maxCount as number) ? (s.maxCount as number) : DEFAULT_TM_SETTINGS.maxCount,
      retentionDays: TM_DAYS_CHOICES.includes(s.retentionDays as number) ? (s.retentionDays as number) : DEFAULT_TM_SETTINGS.retentionDays,
      thin: s.thin === true,
      autoScopes: Array.isArray(s.autoScopes) ? SNAPSHOT_SCOPES.filter((x) => (s.autoScopes as unknown[]).includes(x)) : [...SNAPSHOT_SCOPES],
      manualDays: TM_MANUAL_DAYS_CHOICES.includes(s.manualDays as number) ? (s.manualDays as number) : null,
    },
    lastVersion: typeof raw.lastVersion === 'string' ? raw.lastVersion : '',
  }
}

/** JSON with sorted keys, so two equal configurations always compare equal. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isObject(value)) return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

const omit = (v: unknown, keys: string[]): unknown => (isObject(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => !keys.includes(k))) : v)
const byId = (xs: unknown[]) => [...xs].sort((a, b) => String(isObject(a) ? a.id : '').localeCompare(String(isObject(b) ? b.id : '')))

/** What lives in a profiles restore point: the settings, not the lessons fetched from a calendar link or a choice of the moment. */
export const PROFILE_RUNTIME_KEYS = ['calendarEvents', 'calendarSyncedAt', 'googleEvents', 'googleSyncedAt', 'override', 'returnProfile', 'revision', 'schema'] as const
export function profilesPayload(state: ProfilesState): Record<string, unknown> {
  return omit(state, [...PROFILE_RUNTIME_KEYS]) as Record<string, unknown>
}

/**
 * The part that counts when comparing: without change times and version counters, which a
 * restore sets anew so other devices take it over.
 */
export function canonical(scope: SnapshotScope, payload: unknown): unknown {
  if (!isObject(payload)) return payload
  if (scope === 'profiles') return omit(payload, [...PROFILE_RUNTIME_KEYS])
  if (scope === 'flows') {
    const flows = Array.isArray(payload.flows) ? payload.flows : []
    return { flows: byId(flows.map((f) => omit(f, ['updatedAt', 'version']))), settings: omit(payload.settings, ['updatedAt']) }
  }
  const spaces = Array.isArray(payload.spaces) ? payload.spaces : []
  return { spaces: byId(spaces.map((s) => omit(s, ['updatedAt', 'version', 'deletedAt']))), suggestOnProfile: payload.suggestOnProfile !== false }
}

export const sameScope = (scope: SnapshotScope, a: unknown, b: unknown) => stableJson(canonical(scope, a)) === stableJson(canonical(scope, b))

const prunable = (s: ConfigSnapshot) => s.reason !== 'manual'

const DAY = 86_400_000

/**
 * With thinning: which period an automatic point stands for. The last day: itself; up to a
 * week: its day; older: its week. Per period only the newest stays. Days count in UTC.
 */
function thinBucket(s: ConfigSnapshot, now: number): string {
  const age = now - s.at
  if (age <= DAY) return `p:${s.id}`
  if (age <= 7 * DAY) return `d:${Math.floor(s.at / DAY)}`
  return `w:${Math.floor(s.at / (7 * DAY))}`
}

/**
 * Drops automatic restore points past the count or age (and, when thinning, all but the newest per
 * day or week), your own past their days when set, then the oldest of any kind past the size limit.
 * A point made just before a restore is always kept for a day, so a restore can be undone.
 */
export function pruneSnapshots(state: TimeMachineState, now: number): TimeMachineState {
  const { maxCount, retentionDays, thin, manualDays } = state.settings
  const maxAge = retentionDays * DAY
  const buckets = new Set<string>()
  let auto = 0
  let kept = state.snapshots.filter((s) => {
    if (!prunable(s)) return manualDays === null || now - s.at <= manualDays * DAY
    if (s.reason === 'before_restore' && now - s.at <= DAY) return true
    if (thin) {
      const bucket = thinBucket(s, now)
      if (buckets.has(bucket)) return false
      buckets.add(bucket)
    }
    auto++
    return auto <= maxCount && now - s.at <= maxAge
  })
  let total = kept.reduce((n, s) => n + s.size, 0)
  while (total > MAX_TOTAL_SIZE && kept.length > 1) {
    const oldest = kept[kept.length - 1]
    total -= oldest.size
    kept = kept.slice(0, -1)
  }
  return kept.length === state.snapshots.length ? state : { ...state, snapshots: kept }
}

export interface NewSnapshot {
  id: string
  at: number
  reason: SnapshotReason
  label?: string
  appVersion: string
  scopes: Partial<Record<SnapshotScope, unknown>>
}

const DEFAULT_LABELS: Record<SnapshotReason, string> = {
  auto: 'Na een wijziging',
  manual: 'Herstelpunt',
  start: 'Bij het openen van NEXUS',
  update: 'Na een update',
  before_restore: 'Voor een herstel',
}

/**
 * Adds a restore point. An automatic one is skipped when nothing changed since the newest one;
 * a manual one or one before a restore is always kept. Returns the state unchanged when skipped.
 */
export function addSnapshot(state: TimeMachineState, input: NewSnapshot): { state: TimeMachineState; added: ConfigSnapshot | null; error?: string } {
  const newest = state.snapshots[0]
  const scopes = Object.keys(input.scopes) as SnapshotScope[]
  if ((input.reason === 'auto' || input.reason === 'start' || input.reason === 'update') && newest) {
    const unchanged = scopes.every((s) => newest.scopes[s] !== undefined && sameScope(s, newest.scopes[s], input.scopes[s]))
    if (unchanged) return { state, added: null }
  }
  const size = JSON.stringify(input.scopes).length
  if (size > MAX_SNAPSHOT_SIZE) return { state, added: null, error: 'Deze configuratie is te groot voor een herstelpunt op dit toestel.' }
  const snapshot: ConfigSnapshot = {
    id: input.id,
    at: input.at,
    reason: input.reason,
    label: (input.label?.trim() || DEFAULT_LABELS[input.reason]).slice(0, MAX_LABEL),
    appVersion: input.appVersion,
    scopes: input.scopes,
    size,
  }
  const next = pruneSnapshots({ ...state, snapshots: [snapshot, ...state.snapshots].sort((a, b) => b.at - a.at) }, input.at)
  return { state: next, added: next.snapshots.some((s) => s.id === snapshot.id) ? snapshot : null }
}

export function removeSnapshot(state: TimeMachineState, id: string): TimeMachineState {
  return { ...state, snapshots: state.snapshots.filter((s) => s.id !== id) }
}

export function renameSnapshot(state: TimeMachineState, id: string, label: string): TimeMachineState {
  const clean = label.trim().slice(0, MAX_LABEL)
  if (!clean) return state
  return { ...state, snapshots: state.snapshots.map((s) => (s.id === id ? { ...s, label: clean } : s)) }
}

/** A manual restore point stays until you delete it; marking it makes an automatic one stay too. */
export function keepSnapshot(state: TimeMachineState, id: string): TimeMachineState {
  return { ...state, snapshots: state.snapshots.map((s) => (s.id === id ? { ...s, reason: 'manual' } : s)) }
}

export function addRestoreJob(state: TimeMachineState, job: RestoreJob): TimeMachineState {
  return { ...state, history: [job, ...state.history].slice(0, MAX_HISTORY) }
}

export function setTmSettings(state: TimeMachineState, patch: Partial<TimeMachineSettings>, now: number): TimeMachineState {
  return pruneSnapshots({ ...state, settings: { ...state.settings, ...patch } }, now)
}

/** What the policy would remove right now, to show before you save a stricter one. */
export function prunedBy(state: TimeMachineState, patch: Partial<TimeMachineSettings>, now: number): number {
  return state.snapshots.length - setTmSettings(state, patch, now).snapshots.length
}

// ---- One part ------------------------------------------------------------------------------

/** One part of a scope that can be put back on its own. */
export interface RestorePart {
  scope: SnapshotScope
  /** profile:<id>, a profiles setting (schedule, lessons, …), flow:<id>, flow-settings, space:<id> or suggestOnProfile. */
  key: string
  label: string
}

const PROFILE_SETTING_LABELS: Record<string, string> = {
  defaultProfile: 'Standaardprofiel',
  schedule: 'Schema (School Mode)',
  lessons: 'Lesrooster',
  calendarUrl: 'Schoolkalender',
  googleUrl: 'Google Agenda',
  klashubUrl: 'KlasHub-adres',
  dagstart: 'Dagstart',
  agenda: 'Profiel volgens lesrooster',
}

const itemName = (x: Record<string, unknown>) => (typeof x.name === 'string' && x.name ? x.name : String(x.id))

/** The parts of a scope in either version, in a fixed order. */
function partsOf(scope: SnapshotScope, now: Record<string, unknown>, then: Record<string, unknown>): RestorePart[] {
  if (scope === 'profiles') {
    const a = obj(now.profiles)
    const b = obj(then.profiles)
    const profiles = PROFILE_IDS.filter((id) => a[id] !== undefined || b[id] !== undefined).map((id) => {
      const p = obj(b[id] ?? a[id])
      return { scope, key: `profile:${id}`, label: `Profiel ${typeof p.name === 'string' && p.name ? p.name : PROFILE_NAMES[id]}` }
    })
    const keys = [...new Set([...Object.keys(now), ...Object.keys(then)])].filter((k) => k !== 'profiles')
    const ordered = [...Object.keys(PROFILE_SETTING_LABELS).filter((k) => keys.includes(k)), ...keys.filter((k) => !(k in PROFILE_SETTING_LABELS)).sort()]
    return [...profiles, ...ordered.map((k) => ({ scope, key: k, label: PROFILE_SETTING_LABELS[k] ?? k }))]
  }
  const list = scope === 'flows' ? 'flows' : 'spaces'
  const prefix = scope === 'flows' ? 'flow' : 'space'
  const kind = scope === 'flows' ? 'Flow' : 'Space'
  const seen = new Map<string, Record<string, unknown>>()
  for (const x of [...arr(then[list]), ...arr(now[list])]) if (isObject(x) && !seen.has(String(x.id))) seen.set(String(x.id), x)
  const items = [...seen.values()].map((x) => ({ scope, key: `${prefix}:${String(x.id)}`, label: `${kind} ${itemName(x)}` }))
  return [...items, scope === 'flows' ? { scope, key: 'flow-settings', label: 'Pauze en stille uren' } : { scope, key: 'suggestOnProfile', label: 'Space voorstellen bij een profiel' }]
}

/** Replaces, adds or removes one item of a list by id, keeping the order of [list]. */
function putItem(list: unknown[], id: string, item: unknown): unknown[] {
  const at = list.findIndex((x) => isObject(x) && String(x.id) === id)
  if (item === undefined) return at < 0 ? list : list.filter((_, i) => i !== at)
  if (at < 0) return [...list, item]
  return list.map((x, i) => (i === at ? item : x))
}

/**
 * The configuration as it is now, with only [key] as it was in the restore point. A part that did
 * not exist then is removed; everything else stays as it is now.
 */
export function withPart(scope: SnapshotScope, current: unknown, snapshot: unknown, key: string): unknown {
  const now = obj(current)
  const then = obj(snapshot)
  if (scope === 'profiles') {
    if (key.startsWith('profile:')) {
      const id = key.slice('profile:'.length)
      const profiles = { ...obj(now.profiles) }
      if (obj(then.profiles)[id] === undefined) delete profiles[id]
      else profiles[id] = obj(then.profiles)[id]
      return { ...now, profiles }
    }
    const next = { ...now }
    if (then[key] === undefined) delete next[key]
    else next[key] = then[key]
    return next
  }
  if (scope === 'flows') {
    if (key === 'flow-settings') return { ...now, settings: then.settings }
    const id = key.slice('flow:'.length)
    return { ...now, flows: putItem(arr(now.flows), id, arr(then.flows).find((x) => isObject(x) && String(x.id) === id)) }
  }
  if (key === 'suggestOnProfile') return { ...now, suggestOnProfile: then.suggestOnProfile }
  const id = key.slice('space:'.length)
  return { ...now, spaces: putItem(arr(now.spaces), id, arr(then.spaces).find((x) => isObject(x) && String(x.id) === id)) }
}

/** The parts that differ between now and the restore point, each with what putting it back changes. */
export function changedParts(scope: SnapshotScope, current: unknown, snapshot: unknown, names: DiffNames = {}): Array<RestorePart & { changes: ConfigChange[] }> {
  return partsOf(scope, obj(current), obj(snapshot))
    .map((part) => ({ ...part, changes: diffScope(scope, current, withPart(scope, current, snapshot, part.key), names) }))
    .filter((p) => p.changes.length > 0)
}

// ---- Diff ---------------------------------------------------------------------------------

export interface ConfigChange {
  scope: SnapshotScope
  /** Where, in words, e.g. "Profiel School › Apps". */
  where: string
  /** What restoring does there, e.g. "+ Financiën, − Spaces" or "Donker → Licht". */
  what: string
}

export interface DiffNames {
  app?: (id: string) => string
  theme?: (id: string) => string
}

const PROFILE_FIELDS: Record<string, string> = {
  name: 'Naam',
  description: 'Beschrijving',
  theme: 'Thema',
  apps: 'Apps',
  widgets: 'Widgets',
  quietNonEssential: 'Alleen belangrijke meldingen',
  allowApps: 'Toegelaten gsm-apps',
  accent: 'Accentkleur',
}
const WIDGETS: Record<string, string> = {
  next_class: 'Volgende les',
  deadlines: 'Deadlines',
  notes: 'Notities',
  ai_study: 'AI-studie',
  klashub: 'KlasHub',
  devices: 'Apparaten',
  notifications: 'Meldingen',
  finance: 'Financiën',
}
const PROFILE_NAMES: Record<string, string> = { school: 'School', personal: 'Persoonlijk', gaming: 'Gaming', developer: 'Developer' }
const DAYS = ['', 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

const show = (v: unknown): string => {
  if (v === true) return 'aan'
  if (v === false) return 'uit'
  if (v === null || v === undefined || v === '') return '(leeg)'
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 39)}…` : v
  return JSON.stringify(v).slice(0, 40)
}

/** What a list becomes: "+ a, − b", or "andere volgorde". */
function listChange(now: unknown[], then: unknown[], name: (v: string) => string = String): string | null {
  const a = now.map(String)
  const b = then.map(String)
  if (a.join('\n') === b.join('\n')) return null
  const added = b.filter((x) => !a.includes(x)).map((x) => `+ ${name(x)}`)
  const removed = a.filter((x) => !b.includes(x)).map((x) => `− ${name(x)}`)
  const parts = [...added, ...removed]
  return parts.length ? parts.join(', ') : 'andere volgorde'
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): Record<string, unknown> => (isObject(v) ? v : {})

function diffProfiles(now: Record<string, unknown>, then: Record<string, unknown>, names: DiffNames, out: ConfigChange[]): void {
  const push = (where: string, what: string) => out.push({ scope: 'profiles', where, what })
  const a = obj(now.profiles)
  const b = obj(then.profiles)
  for (const id of PROFILE_IDS) {
    const pa = obj(a[id])
    const pb = obj(b[id])
    const title = `Profiel ${typeof pb.name === 'string' ? pb.name : PROFILE_NAMES[id]}`
    for (const [field, label] of Object.entries(PROFILE_FIELDS)) {
      if (stableJson(pa[field]) === stableJson(pb[field])) continue
      if (field === 'apps') push(`${title} › ${label}`, listChange(arr(pa.apps), arr(pb.apps), names.app) ?? '')
      else if (field === 'widgets') push(`${title} › ${label}`, listChange(arr(pa.widgets), arr(pb.widgets), (w) => WIDGETS[w] ?? w) ?? '')
      else if (field === 'allowApps') push(`${title} › ${label}`, listChange(arr(pa.allowApps), arr(pb.allowApps)) ?? '')
      else if (field === 'theme' && names.theme) push(`${title} › ${label}`, `${names.theme(String(pa.theme))} → ${names.theme(String(pb.theme))}`)
      else push(`${title} › ${label}`, `${show(pa[field])} → ${show(pb[field])}`)
    }
  }
  if (now.defaultProfile !== then.defaultProfile) push('Standaardprofiel', `${PROFILE_NAMES[String(now.defaultProfile)] ?? show(now.defaultProfile)} → ${PROFILE_NAMES[String(then.defaultProfile)] ?? show(then.defaultProfile)}`)
  const sa = obj(now.schedule)
  const sb = obj(then.schedule)
  if (stableJson(sa) !== stableJson(sb)) {
    const describe = (s: Record<string, unknown>) =>
      s.enabled ? `${PROFILE_NAMES[String(s.profile)] ?? ''} ${arr(s.days).map((d) => DAYS[Number(d)] ?? '').join(' ')} ${s.start}–${s.end}`.trim() : 'uit'
    push('Schema', `${describe(sa)} → ${describe(sb)}`)
  }
  const la = arr(now.lessons)
  const lb = arr(then.lessons)
  if (stableJson(la) !== stableJson(lb)) push('Lesrooster', `${la.length} → ${lb.length} lessen`)
  const link = (v: unknown) => (typeof v === 'string' && v ? 'gekoppeld' : 'niet gekoppeld')
  if (now.calendarUrl !== then.calendarUrl) push('Schoolkalender', now.calendarUrl && then.calendarUrl ? 'andere link' : `${link(now.calendarUrl)} → ${link(then.calendarUrl)}`)
  if (now.googleUrl !== then.googleUrl) push('Google Agenda', now.googleUrl && then.googleUrl ? 'andere link' : `${link(now.googleUrl)} → ${link(then.googleUrl)}`)
  if (now.klashubUrl !== then.klashubUrl) push('KlasHub-adres', `${show(now.klashubUrl)} → ${show(then.klashubUrl)}`)
  const da = obj(now.dagstart)
  const db = obj(then.dagstart)
  if (stableJson(da) !== stableJson(db)) push('Dagstart', `${da.enabled ? `aan om ${da.time}` : 'uit'} → ${db.enabled ? `aan om ${db.time}` : 'uit'}`)
  const aa = obj(now.agenda)
  const ab = obj(then.agenda)
  if (stableJson(aa) !== stableJson(ab)) {
    const describe = (a: Record<string, unknown>) => (a.enabled ? `aan (${PROFILE_NAMES[String(a.profile)] ?? ''})` : 'uit')
    push('Profiel volgens lesrooster', `${describe(aa)} → ${describe(ab)}`)
  }
}

/** Per item of a list with ids and names: which come back, which go, which change. */
function diffItems(scope: SnapshotScope, kind: string, now: unknown[], then: unknown[], out: ConfigChange[]): void {
  const name = (x: Record<string, unknown>) => (typeof x.name === 'string' && x.name ? x.name : String(x.id))
  const a = new Map(now.filter(isObject).map((x) => [String(x.id), x]))
  const b = new Map(then.filter(isObject).map((x) => [String(x.id), x]))
  for (const [id, x] of b) {
    const cur = a.get(id)
    if (!cur) out.push({ scope, where: `${kind} ${name(x)}`, what: 'komt terug' })
    else if (stableJson(cur) !== stableJson(x)) {
      const fields = Object.keys({ ...cur, ...x }).filter((k) => stableJson(cur[k]) !== stableJson(x[k]))
      const what = fields.includes('enabled') && fields.length === 1 ? `${x.enabled ? 'gaat aan' : 'gaat uit'}` : fields.includes('name') ? `heette ${name(cur)}; wordt ${name(x)}` : 'wordt zoals toen'
      out.push({ scope, where: `${kind} ${name(x)}`, what })
    }
  }
  for (const [id, x] of a) if (!b.has(id)) out.push({ scope, where: `${kind} ${name(x)}`, what: 'verdwijnt' })
}

/** What restoring [snapshot] would change compared to [current], in readable lines. Empty: already the same. */
export function diffScope(scope: SnapshotScope, current: unknown, snapshot: unknown, names: DiffNames = {}): ConfigChange[] {
  const now = obj(canonical(scope, current))
  const then = obj(canonical(scope, snapshot))
  if (stableJson(now) === stableJson(then)) return []
  const out: ConfigChange[] = []
  if (scope === 'profiles') diffProfiles(now, then, names, out)
  else if (scope === 'flows') {
    diffItems('flows', 'Flow', arr(now.flows), arr(then.flows), out)
    const sa = obj(now.settings)
    const sb = obj(then.settings)
    if (sa.paused !== sb.paused) out.push({ scope, where: 'Alles pauzeren', what: `${show(sa.paused)} → ${show(sb.paused)}` })
    if (stableJson(sa.quiet) !== stableJson(sb.quiet)) out.push({ scope, where: 'Stille uren', what: 'worden zoals toen' })
  } else {
    diffItems('spaces', 'Space', arr(now.spaces), arr(then.spaces), out)
    if (now.suggestOnProfile !== then.suggestOnProfile) out.push({ scope, where: 'Space voorstellen bij een profiel', what: `${show(now.suggestOnProfile)} → ${show(then.suggestOnProfile)}` })
  }
  // A difference the lines above do not name still shows, so a preview never claims "the same".
  if (out.length === 0) out.push({ scope, where: SCOPE_NAMES[scope], what: 'andere instellingen' })
  return out
}
