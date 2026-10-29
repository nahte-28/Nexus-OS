/**
 * NEXUS Time Machine (blueprint fase 3): restore points of your configuration (profiles, flows and
 * Spaces), a readable diff before restoring, and a history of restores. Configuration only: notes,
 * files and other records are not part of it. Pure logic; the web app captures and applies.
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
}

export interface TimeMachineSettings {
  /** Restore points after changes and when NEXUS starts. Manual ones always work. */
  auto: boolean
  /** Automatic restore points kept; manual ones do not count. */
  maxCount: number
  /** Automatic restore points older than this go. */
  retentionDays: number
}

export interface TimeMachineState {
  revision: number
  snapshots: ConfigSnapshot[]
  history: RestoreJob[]
  settings: TimeMachineSettings
  /** The NEXUS version that last ran here, to notice an update. */
  lastVersion: string
}

export const DEFAULT_TM_SETTINGS: TimeMachineSettings = { auto: true, maxCount: 30, retentionDays: 30 }
export const TM_COUNT_CHOICES = [10, 30, 50]
export const TM_DAYS_CHOICES = [7, 30, 90]
export const MAX_HISTORY = 50
/** All restore points together, in characters; localStorage holds about 5 million. */
export const MAX_TOTAL_SIZE = 1_500_000
export const MAX_SNAPSHOT_SIZE = 300_000
export const MAX_LABEL = 80

export const emptyTimeMachine = (): TimeMachineState => ({ revision: 0, snapshots: [], history: [], settings: { ...DEFAULT_TM_SETTINGS }, lastVersion: '' })

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

/** Drops automatic restore points past the count or age, then the oldest of any kind past the size limit. */
export function pruneSnapshots(state: TimeMachineState, now: number): TimeMachineState {
  const maxAge = state.settings.retentionDays * 86_400_000
  let auto = 0
  let kept = state.snapshots.filter((s) => {
    if (!prunable(s)) return true
    auto++
    return auto <= state.settings.maxCount && now - s.at <= maxAge
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
