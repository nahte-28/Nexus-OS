import { useSyncExternalStore } from 'react'
import {
  addRestoreJob,
  addSnapshot,
  liveSpaces,
  parseProfilesState,
  parseTimeMachine,
  profilesPayload,
  sameScope,
  SCOPE_NAMES,
  SNAPSHOT_SCOPES,
  type ConfigSnapshot,
  type FlowDefinition,
  type RestoreJob,
  type SnapshotReason,
  type SnapshotScope,
  type Space,
  type TimeMachineState,
  withPart,
} from '@nexus/core'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { flowsStore, parseFlowsState } from '../flows/store'
import { profilesStore } from '../profiles/store'
import { spacesStore } from '../spaces/store'
import { DocStore } from '../state/docStore'

/** Restore points stay on this device; what they restore syncs to your other devices as usual. */
export const timeMachineStore = new DocStore<TimeMachineState>('nexus.timemachine', parseTimeMachine)

export function useTimeMachine(): TimeMachineState {
  return useSyncExternalStore(timeMachineStore.subscribe, timeMachineStore.getSnapshot)
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `tm-${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** The configuration on this device right now, per scope, as it goes into a restore point. */
export function captureScope(scope: SnapshotScope): unknown {
  if (scope === 'profiles') return profilesPayload(profilesStore.getSnapshot().state)
  if (scope === 'flows') {
    const { flows, settings } = flowsStore.getSnapshot()
    return { flows, settings }
  }
  const s = spacesStore.getSnapshot()
  return { spaces: liveSpaces(s), suggestOnProfile: s.suggestOnProfile }
}

export const captureAll = (scopes: SnapshotScope[] = SNAPSHOT_SCOPES): ConfigSnapshot['scopes'] => Object.fromEntries(scopes.map((s) => [s, captureScope(s)]))

/**
 * Puts one scope back. Change times are set to now, so the restored version wins on your other
 * devices too; what was added since the restore point is deleted the same way a delete would be.
 */
function applyScope(scope: SnapshotScope, payload: unknown, now: number, otherVersion: boolean): unknown {
  const p = (payload ?? {}) as Record<string, unknown>
  if (scope === 'profiles') {
    // From this version: exactly what was captured, since parsing again can reformat it (a link
    // gets a slash). From another version: through the parser, which upgrades an older shape.
    const current = profilesStore.getSnapshot().state
    const back = otherVersion ? profilesPayload(parseProfilesState({ ...current, ...p })) : profilesPayload({ ...current, ...p } as typeof current)
    profilesStore.update((s) => ({ ...s, ...back }))
    return back
  }
  if (scope === 'flows') {
    const back = parseFlowsState({ flows: p.flows, settings: p.settings })
    flowsStore.update((s) => {
      const keep = new Set(back.flows.map((f) => f.id))
      const deleted = { ...s.deleted }
      for (const f of s.flows) if (!keep.has(f.id)) deleted[f.id] = now
      for (const id of keep) delete deleted[id]
      const versions = new Map(s.flows.map((f) => [f.id, f.version]))
      const flows: FlowDefinition[] = back.flows.map((f) => ({ ...f, version: Math.max(versions.get(f.id) ?? 0, f.version) + 1, updatedAt: now }))
      return { ...s, flows, deleted, settings: { ...back.settings, updatedAt: now } }
    })
    return payload
  }
  const spaces = (Array.isArray(p.spaces) ? p.spaces : []) as Space[]
  spacesStore.update((s) => {
    const keep = new Map(spaces.map((x) => [x.id, x]))
    const current = new Map(s.spaces.map((x) => [x.id, x]))
    const gone = s.spaces.filter((x) => !keep.has(x.id)).map((x) => (x.deletedAt === null ? { ...x, deletedAt: now, updatedAt: now } : x))
    const back = spaces.map((x) => ({ ...x, deletedAt: null, updatedAt: now, version: Math.max(current.get(x.id)?.version ?? 0, x.version) + 1 }))
    return { ...s, spaces: [...gone, ...back].sort((a, b) => a.createdAt - b.createdAt), suggestOnProfile: p.suggestOnProfile !== false, settingsUpdatedAt: now }
  })
  return payload
}

let restoring = false

/** Automatic points take what the policy says; your own and the one before a restore take everything. */
export function takeSnapshot(reason: SnapshotReason, label?: string, now = Date.now()): { snapshot: ConfigSnapshot | null; error?: string } {
  let result: { snapshot: ConfigSnapshot | null; error?: string } = { snapshot: null }
  const automatic = reason === 'auto' || reason === 'start' || reason === 'update'
  const scopes = automatic ? timeMachineStore.getSnapshot().settings.autoScopes : SNAPSHOT_SCOPES
  if (scopes.length === 0) return result
  timeMachineStore.update((s) => {
    const r = addSnapshot(s, { id: newId(), at: now, reason, label, appVersion: __APP_VERSION__, scopes: captureAll(scopes) })
    result = { snapshot: r.added, ...(r.error ? { error: r.error } : {}) }
    return r.state
  })
  return result
}

export interface RestoreResult {
  ok: boolean
  job: RestoreJob
}

/**
 * Restores the chosen scopes of a restore point. First a restore point of how things are now;
 * afterwards every scope is read back and compared, and when one does not match exactly, all of
 * them go back to how they were (rollback).
 */
export function restoreSnapshot(snapshotId: string, scopes: SnapshotScope[], now = Date.now()): RestoreResult {
  const snapshot = findSnapshot(snapshotId)
  return runRestore(
    snapshot,
    scopes.filter((s) => snapshot.scopes[s] !== undefined),
    (scope) => snapshot.scopes[scope],
    now,
  )
}

/**
 * Time Machine 2.0: puts back one part (a profile, flow, Space or setting) as it was in the
 * restore point and leaves the rest as it is now. Same safety as a full restore.
 */
export function restorePart(snapshotId: string, scope: SnapshotScope, key: string, label: string, now = Date.now()): RestoreResult {
  const snapshot = findSnapshot(snapshotId)
  if (snapshot.scopes[scope] === undefined) throw new Error('Dit herstelpunt bevat dat onderdeel niet.')
  return runRestore(snapshot, [scope], () => withPart(scope, captureScope(scope), snapshot.scopes[scope], key), now, label)
}

function findSnapshot(id: string): ConfigSnapshot {
  const snapshot = timeMachineStore.getSnapshot().snapshots.find((s) => s.id === id)
  if (!snapshot) throw new Error('Dit herstelpunt bestaat niet meer.')
  return snapshot
}

function runRestore(snapshot: ConfigSnapshot, chosen: SnapshotScope[], payloadFor: (scope: SnapshotScope) => unknown, now: number, part?: string): RestoreResult {
  const snapshotId = snapshot.id
  const before = captureAll()
  // Worked out before anything changes: a part goes into the configuration as it is now.
  const payloads = new Map(chosen.map((scope) => [scope, payloadFor(scope)]))
  restoring = true
  let job!: RestoreJob
  try {
    takeSnapshot('before_restore', part ? `Voor herstel van ${part}` : `Voor herstel van "${snapshot.label}"`, now)
    let problem: string | null = null
    try {
      const otherVersion = snapshot.appVersion !== __APP_VERSION__
      const expected = new Map(chosen.map((scope) => [scope, applyScope(scope, payloads.get(scope), now, otherVersion)]))
      const wrong = chosen.filter((scope) => !sameScope(scope, captureScope(scope), expected.get(scope)))
      if (wrong.length) problem = `${wrong.map((s) => SCOPE_NAMES[s]).join(', ')} kwam${wrong.length > 1 ? 'en' : ''} niet exact terug.`
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err)
    }
    if (problem) {
      for (const scope of chosen) applyScope(scope, before[scope], now, false)
      logEvent('system', `Time Machine: herstel teruggedraaid: ${problem}`)
    }
    job = {
      id: newId(),
      snapshotId,
      snapshotLabel: snapshot.label,
      at: now,
      scopes: chosen,
      status: problem ? 'rolled_back' : 'done',
      ...(problem ? { detail: `${problem} Alles staat weer zoals voor het herstel.` } : {}),
      ...(part ? { part } : {}),
    }
    timeMachineStore.update((s) => addRestoreJob(s, job))
  } finally {
    restoring = false
  }
  eventBus.publish({
    id: `timemachine:${job.id}`,
    source: 'system',
    type: job.status === 'done' ? 'timemachine.restored' : 'timemachine.rolled_back',
    at: now,
    title: job.status === 'done' ? `Hersteld: ${part ?? snapshot.label}` : `Herstel van ${part ?? snapshot.label} teruggedraaid`,
    priority: job.status === 'done' ? 'low' : 'high',
    link: { app: 'timemachine' },
  })
  return { ok: job.status === 'done', job }
}

/** How long a change has to stay before it becomes a restore point, so typing a name is one point. */
export const SETTLE_MS = 30_000

/**
 * While the module is on: a restore point when NEXUS opens (or a new version starts) and after
 * each change to profiles, flows or Spaces once it settled. Identical ones are skipped.
 */
export function startTimeMachine(enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const auto = () => enabled() && timeMachineStore.getSnapshot().settings.auto
  const atStart = () => {
    if (!auto()) return
    const state = timeMachineStore.getSnapshot()
    const updated = state.lastVersion !== '' && state.lastVersion !== __APP_VERSION__
    if (state.lastVersion !== __APP_VERSION__) timeMachineStore.update((s) => ({ ...s, lastVersion: __APP_VERSION__ }))
    takeSnapshot(updated ? 'update' : 'start', updated ? `Na de update naar ${__APP_VERSION__}` : undefined)
  }
  const changed = () => {
    if (restoring || !auto()) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (auto()) takeSnapshot('auto')
    }, SETTLE_MS)
  }
  atStart()
  const offs = [profilesStore.subscribe(changed), flowsStore.subscribe(changed), spacesStore.subscribe(changed), onEnabled(atStart)]
  return () => {
    clearTimeout(timer)
    offs.forEach((off) => off())
  }
}
