import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { ACTION_LABELS, isTime, mergeFlows, TRIGGER_LABELS, type ActionType, type FlowDefinition, type StoredFlow, type TriggerType } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { readStorage, writeStorage } from '../state/storage'
import { flowsStore, type FlowRun, type FlowSettings, type FlowsStore } from './store'

/** 'off' when flows stay on this device only (Flow Studio > Instellingen). */
const SYNC_MODE_KEY = 'nexus.flows.sync'
const SETTINGS_KEY = 'flows'
const PUSH_DEBOUNCE_MS = 1500
const POLL_MS = 5 * 60_000
/** How long a device waits for the account before it runs an event itself. */
const CLAIM_TIMEOUT_MS = 5000
const KEEP_RUNS_MS = 30 * 24 * 60 * 60_000
const PULL_RUNS = 100

export function flowsSyncOn(): boolean {
  return readStorage(SYNC_MODE_KEY) !== 'off'
}

export interface FlowsSyncStatus {
  state: 'unavailable' | 'off' | 'signed-out' | 'syncing' | 'synced' | 'error'
  at: number | null
  error: string | null
}

let status: FlowsSyncStatus = { state: 'unavailable', at: null, error: null }
const statusListeners = new Set<() => void>()
function setStatus(next: Partial<FlowsSyncStatus>): void {
  status = { ...status, ...next }
  statusListeners.forEach((l) => l())
}
export const flowsSyncStatus = {
  subscribe(listener: () => void): () => void {
    statusListeners.add(listener)
    return () => statusListeners.delete(listener)
  },
  getSnapshot: (): FlowsSyncStatus => status,
}

export type SyncedSettings = Omit<FlowSettings, 'updatedAt'>

/** Where the account's copy lives; a small seam so the logic can be tested without Supabase. */
export interface FlowsRemote {
  pullFlows(): Promise<StoredFlow[]>
  pushFlows(flows: StoredFlow[]): Promise<void>
  pullSettings(): Promise<{ settings: SyncedSettings; revision: number } | null>
  pushSettings(settings: SyncedSettings, revision: number): Promise<void>
  /** Writes the run as started; false when the account already has a run for that event. */
  claim(run: FlowRun): Promise<boolean>
  /** Stores outcomes; returns the ids the account now has (a duplicate of another device's included). */
  pushRuns(runs: FlowRun[]): Promise<string[]>
  pullRuns(limit: number): Promise<FlowRun[]>
  deleteRuns(before?: number): Promise<void>
}

interface RunRow {
  id: string
  flow_id: string
  flow_name: string
  event_id: string
  trigger_type: string
  status: 'running' | 'ok' | 'failed'
  manual: boolean
  device_name: string | null
  steps: Array<{ type?: string; status: 'ok' | 'failed' | 'skipped'; detail?: string }>
  started_at: string
  completed_at: string | null
}

/**
 * What the account keeps of a run: the kind of event and of each action, never a deadline's
 * title or the text of a notification.
 */
export function toRunRow(run: FlowRun, running = false): RunRow {
  return {
    id: run.id,
    flow_id: run.flowId,
    flow_name: run.flowName,
    event_id: run.eventId ?? `run:${run.id}`,
    trigger_type: run.trigger ?? (run.manual ? 'manual' : 'unknown'),
    status: running ? 'running' : run.status === 'failed' ? 'failed' : 'ok',
    manual: run.manual === true,
    device_name: run.device ?? null,
    steps: running ? [] : run.steps.map((s) => ({ ...(s.type ? { type: s.type } : {}), status: s.status, ...(s.detail ? { detail: s.detail.slice(0, 300) } : {}) })),
    started_at: new Date(run.at).toISOString(),
    completed_at: running ? null : new Date(run.at).toISOString(),
  }
}

export function fromRunRow(row: RunRow): FlowRun {
  const trigger = row.trigger_type in TRIGGER_LABELS ? (row.trigger_type as TriggerType) : undefined
  return {
    id: row.id,
    flowId: row.flow_id,
    flowName: row.flow_name,
    event: trigger ? TRIGGER_LABELS[trigger] : row.trigger_type,
    eventId: row.event_id,
    ...(trigger ? { trigger } : {}),
    at: Date.parse(row.started_at) || 0,
    status: row.status === 'failed' ? 'failed' : 'ok',
    ...(row.manual ? { manual: true } : {}),
    ...(row.device_name ? { device: row.device_name } : {}),
    synced: true,
    steps: (Array.isArray(row.steps) ? row.steps : []).map((s) => {
      const type = s.type && s.type in ACTION_LABELS ? (s.type as ActionType) : undefined
      return { ...(type ? { type } : {}), action: type ? ACTION_LABELS[type] : 'Actie', status: s.status, ...(s.detail ? { detail: s.detail } : {}) }
    }),
  }
}

const isUniqueViolation = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'

export function createFlowsRemote(client: SupabaseClient): FlowsRemote {
  return {
    async pullFlows() {
      const { data, error } = await client.from('automation_flows').select('id,definition,revision')
      if (error) throw error
      return (data ?? []).map((r) => ({ id: String(r.id), definition: (r.definition as FlowDefinition | null) ?? null, revision: Number(r.revision) }))
    },
    async pushFlows(flows) {
      if (flows.length === 0) return
      const rows = flows.map((f) => ({
        id: f.id,
        name: f.definition?.name ?? '',
        enabled: f.definition?.enabled ?? false,
        definition: f.definition,
        version: f.definition?.version ?? 1,
        timezone: f.definition?.timeZone ?? '',
        revision: f.revision,
        deleted_at: f.definition ? null : new Date(f.revision).toISOString(),
      }))
      // The server skips a copy that is not newer; the next round then takes the stored one.
      const { error } = await client.from('automation_flows').upsert(rows, { onConflict: 'user_id,id' })
      if (error) throw error
    },
    async pullSettings() {
      const { data, error } = await client.from('user_settings').select('value,revision').eq('key', SETTINGS_KEY).maybeSingle()
      if (error) throw error
      if (!data) return null
      const v = (data.value ?? {}) as Partial<SyncedSettings>
      const quiet = v.quiet && isTime(v.quiet.start) && isTime(v.quiet.end) ? { enabled: v.quiet.enabled === true, start: v.quiet.start, end: v.quiet.end } : null
      if (!quiet) return null
      return { settings: { paused: v.paused === true, quiet }, revision: Number(data.revision) }
    },
    async pushSettings(settings, revision) {
      const { error } = await client.from('user_settings').upsert({ key: SETTINGS_KEY, value: settings, revision }, { onConflict: 'user_id,key' })
      if (error) throw error
    },
    async claim(run) {
      const { error } = await client.from('automation_runs').insert(toRunRow(run, true))
      if (!error) return true
      if (isUniqueViolation(error)) return false
      throw error
    },
    async pushRuns(runs) {
      if (runs.length === 0) return []
      const { error } = await client.from('automation_runs').upsert(runs.map((r) => toRunRow(r)), { onConflict: 'id' })
      if (!error) return runs.map((r) => r.id)
      if (!isUniqueViolation(error)) throw error
      // Two devices ran the same event while offline: the account keeps the first one.
      const done: string[] = []
      for (const run of runs) {
        const { error: one } = await client.from('automation_runs').upsert(toRunRow(run), { onConflict: 'id' })
        if (!one || isUniqueViolation(one)) done.push(run.id)
        else throw one
      }
      return done
    },
    async pullRuns(limit) {
      const { data, error } = await client
        .from('automation_runs')
        .select('id,flow_id,flow_name,event_id,trigger_type,status,manual,device_name,steps,started_at,completed_at')
        .neq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return ((data ?? []) as RunRow[]).map(fromRunRow)
    },
    async deleteRuns(before) {
      let query = client.from('automation_runs').delete()
      query = before === undefined ? query.not('id', 'is', null) : query.lt('started_at', new Date(before).toISOString())
      const { error } = await query
      if (error) throw error
    },
  }
}

/** Flows and settings as they matter for the account, to see whether a round has anything to do. */
const fingerprint = (store: FlowsStore) => {
  const s = store.getSnapshot()
  return JSON.stringify([s.flows, s.deleted, s.settings, store.getRuns().filter((r) => !r.synced && r.status !== 'skipped').length])
}

/**
 * Keeps flows, pause-all and quiet hours the same on every device of the account, and shares the
 * run history. Per flow the newest change wins (see mergeFlows). Runs are claimed per event, so a
 * flow that is on several devices still runs once.
 */
export class FlowsSync {
  private running: Promise<void> | null = null
  private again = false
  private synced = ''
  private pruned = false

  constructor(
    readonly remote: FlowsRemote,
    private store: FlowsStore = flowsStore,
  ) {}

  sync(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    if (!flowsSyncOn()) {
      setStatus({ state: 'off', error: null })
      return Promise.resolve()
    }
    setStatus({ state: 'syncing' })
    this.running = this.round()
      .then(() => setStatus({ state: 'synced', at: Date.now(), error: null }))
      .catch((err) => {
        const message = errorMessage(err)
        setStatus({ state: 'error', error: message })
        logEvent('sync', `Flows synchroniseren mislukt: ${message}`)
      })
      .finally(() => {
        this.running = null
        if (this.again) {
          this.again = false
          void this.sync()
        }
      })
    return this.running
  }

  private async round(): Promise<void> {
    const local = this.store.getSnapshot()
    const merged = mergeFlows(local.flows, local.deleted, await this.remote.pullFlows())
    if (JSON.stringify([merged.flows, merged.deleted]) !== JSON.stringify([local.flows, local.deleted])) {
      this.store.adopt({ flows: merged.flows, deleted: merged.deleted })
    }
    await this.remote.pushFlows(merged.push)

    const settings = this.store.getSnapshot().settings
    const remoteSettings = await this.remote.pullSettings()
    if (remoteSettings && remoteSettings.revision > settings.updatedAt) {
      this.store.adopt({ settings: { ...remoteSettings.settings, updatedAt: remoteSettings.revision } })
    } else if (!remoteSettings || settings.updatedAt > remoteSettings.revision) {
      const { updatedAt, ...rest } = settings
      // A device that never changed them sends its defaults at revision 1, so any real change wins.
      await this.remote.pushSettings(rest, Math.max(updatedAt, 1))
    }

    if (!this.pruned) {
      await this.remote.deleteRuns(Date.now() - KEEP_RUNS_MS)
      this.pruned = true
    }
    const unsynced = this.store.getRuns().filter((r) => !r.synced && r.status !== 'skipped' && r.eventId)
    this.store.markSynced(await this.remote.pushRuns(unsynced))
    this.store.mergeRuns(await this.remote.pullRuns(PULL_RUNS))
    this.synced = fingerprint(this.store)
  }

  /** True when this device has a change the account has not seen yet. */
  hasLocalChange(): boolean {
    return fingerprint(this.store) !== this.synced
  }

  /** Clears the history on every device. */
  async clearRuns(): Promise<void> {
    await this.remote.deleteRuns()
  }
}

function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err)
  // The tables do not exist yet: the SQL migration was not run in Supabase.
  if (/automation_(flows|runs)/.test(text) && /(does not exist|schema cache|not find)/i.test(text)) {
    return 'De tabellen voor Flow Studio ontbreken in Supabase. Voer de SQL van supabase/migrations/20261020140000_flows.sql uit.'
  }
  if (/user_settings_key_check/.test(text)) {
    return 'Supabase kent de instellingen van Flow Studio nog niet. Voer de SQL van supabase/migrations/20261020140000_flows.sql uit.'
  }
  return text
}

let current: FlowsSync | null = null

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    )
  })
}

/**
 * Asks the account whether this device runs the event. Without an account, with sync off, or when
 * the account cannot be reached, this device runs it: a reminder must not wait for the network.
 */
export async function claimFlowRun(run: FlowRun, sync: FlowsSync | null = current): Promise<boolean> {
  if (!sync || !flowsSyncOn()) return true
  try {
    return await withTimeout(sync.remote.claim(run), CLAIM_TIMEOUT_MS)
  } catch {
    return true
  }
}

/** "Geschiedenis wissen": here and, with sync on, on the account and so on the other devices. */
export async function clearFlowRuns(store: FlowsStore = flowsStore): Promise<void> {
  store.clearRuns()
  if (current && flowsSyncOn()) await current.clearRuns()
}

/** Turns syncing on or off for this device; switching it on syncs right away. */
export function setFlowsSyncOn(on: boolean): void {
  writeStorage(SYNC_MODE_KEY, on ? 'on' : 'off')
  if (!on) setStatus({ state: 'off', error: null })
  else if (current) void current.sync()
  else setStatus({ state: 'signed-out' })
}

export interface FlowsServerStatus {
  /** Whether the database runs fixed-time profile flows itself (20261030090000_flows_server.sql). */
  scheduled: boolean
  /** When the server last ran one of this account's flows. */
  lastRun: number | null
}

let serverClient: SupabaseClient | null = null

/** Asks the account whether flows also run there; null when signed out or the SQL is missing. */
export async function fetchFlowsServerStatus(): Promise<FlowsServerStatus | null> {
  if (!serverClient || !current) return null
  const { data, error } = await serverClient.rpc('flows_server_status')
  if (error || !data || typeof data !== 'object') return null
  const v = data as { scheduled?: unknown; lastRun?: unknown }
  return { scheduled: v.scheduled === true, lastRun: typeof v.lastRun === 'number' ? v.lastRun : null }
}

/** Starts syncing flows whenever someone is signed in; stays local-only otherwise. */
export function startFlowsSync(client: SupabaseClient | null, store: FlowsStore = flowsStore): () => void {
  if (!client) return () => {}
  serverClient = client
  let userId: string | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined
  const remote = createFlowsRemote(client)

  setStatus({ state: flowsSyncOn() ? 'signed-out' : 'off' })
  const setSession = (session: Session | null) => {
    if (!session) {
      userId = null
      current = null
      if (flowsSyncOn()) setStatus({ state: 'signed-out', error: null })
      return
    }
    if (current && userId === session.user.id) return
    userId = session.user.id
    current = new FlowsSync(remote, store)
    void current.sync()
  }
  void client.auth.getSession().then(({ data }) => setSession(data.session))
  const { data } = client.auth.onAuthStateChange((_event, session) => setSession(session))

  const unsubscribe = store.subscribe(() => {
    if (!current?.hasLocalChange()) return
    clearTimeout(debounce)
    debounce = setTimeout(() => void current?.sync(), PUSH_DEBOUNCE_MS)
  })
  const now = () => void current?.sync()
  const onVisible = () => document.visibilityState === 'visible' && now()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', now)
  const poll = setInterval(now, POLL_MS)
  const channel = client
    .channel('flows-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_flows' }, now)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_runs' }, now)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings', filter: `key=eq.${SETTINGS_KEY}` }, now)
    .subscribe()

  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    unsubscribe()
    data.subscription.unsubscribe()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', now)
    void client.removeChannel(channel)
    current = null
    serverClient = null
  }
}
