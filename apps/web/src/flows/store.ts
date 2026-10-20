import { useSyncExternalStore } from 'react'
import { emptyRuntime, isFlowDefinition, isTime, type FlowDefinition, type FlowRuntime } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

const STORAGE_KEY = 'nexus.flows'
const RUNS_KEY = 'nexus.flows.runs'
const ENABLED_KEY = 'nexus.flows.enabled'
const MAX_RUNS = 100
const KEEP_RUNS_MS = 30 * 24 * 60 * 60_000

export interface FlowSettings {
  /** Pause all: nothing runs, events are skipped. */
  paused: boolean
  /** Quiet hours: flows still run, but send no notifications. */
  quiet: { enabled: boolean; start: string; end: string }
}

export interface FlowStepResult {
  action: string
  status: 'ok' | 'failed' | 'skipped'
  detail?: string
}

/** One run in the history, with what each action did. Never the content of messages. */
export interface FlowRun {
  id: string
  flowId: string
  flowName: string
  event: string
  at: number
  status: 'ok' | 'failed' | 'skipped'
  reason?: string
  manual?: boolean
  steps: FlowStepResult[]
}

export interface FlowsState {
  flows: FlowDefinition[]
  settings: FlowSettings
  runtime: FlowRuntime
}

const DEFAULT_SETTINGS: FlowSettings = { paused: false, quiet: { enabled: false, start: '22:00', end: '07:00' } }

function readJson(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function parseFlowsState(raw: unknown): FlowsState {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<FlowsState>
  const s = (r.settings ?? {}) as Partial<FlowSettings>
  const quiet = { ...DEFAULT_SETTINGS.quiet, ...(typeof s.quiet === 'object' ? s.quiet : {}) }
  return {
    // A flow that no longer passes validation is dropped instead of half running.
    flows: Array.isArray(r.flows) ? r.flows.filter(isFlowDefinition) : [],
    settings: {
      paused: s.paused === true,
      quiet: isTime(quiet.start) && isTime(quiet.end) ? { ...quiet, enabled: quiet.enabled === true } : DEFAULT_SETTINGS.quiet,
    },
    runtime:
      r.runtime && typeof r.runtime.handled === 'object' && typeof r.runtime.recent === 'object' ? r.runtime : emptyRuntime(),
  }
}

/** Flow Studio on this device, in localStorage so flows keep working offline. */
export class FlowsStore {
  private state: FlowsState
  private runs: FlowRun[]
  private listeners = new Set<() => void>()

  constructor() {
    this.state = parseFlowsState(readJson(readStorage(STORAGE_KEY)))
    const runs = readJson(readStorage(RUNS_KEY))
    this.runs = Array.isArray(runs) ? (runs as FlowRun[]) : []
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): FlowsState => this.state
  getRuns = (): FlowRun[] => this.runs

  update(change: (state: FlowsState) => FlowsState): void {
    this.state = change(this.state)
    writeStorage(STORAGE_KEY, JSON.stringify(this.state))
    this.listeners.forEach((l) => l())
  }

  /** Saves a flow from the builder; a changed flow gets a new version. */
  save(flow: FlowDefinition, now = Date.now()): FlowDefinition {
    const existing = this.state.flows.find((f) => f.id === flow.id)
    const saved = { ...flow, version: (existing?.version ?? 0) + 1, updatedAt: now }
    this.update((s) => ({ ...s, flows: existing ? s.flows.map((f) => (f.id === flow.id ? saved : f)) : [...s.flows, saved] }))
    return saved
  }

  remove(id: string): void {
    this.update((s) => ({ ...s, flows: s.flows.filter((f) => f.id !== id) }))
  }

  setEnabled(id: string, enabled: boolean): void {
    this.update((s) => ({ ...s, flows: s.flows.map((f) => (f.id === id ? { ...f, enabled } : f)) }))
  }

  addRuns(runs: FlowRun[], now = Date.now()): void {
    if (runs.length === 0) return
    this.runs = [...runs, ...this.runs].filter((r) => now - r.at < KEEP_RUNS_MS).slice(0, MAX_RUNS)
    writeStorage(RUNS_KEY, JSON.stringify(this.runs))
    this.listeners.forEach((l) => l())
  }

  clearRuns(): void {
    this.runs = []
    writeStorage(RUNS_KEY, '[]')
    this.listeners.forEach((l) => l())
  }

  /** Another tab changed flows: read them again. */
  reload(): void {
    this.state = parseFlowsState(readJson(readStorage(STORAGE_KEY)))
    const runs = readJson(readStorage(RUNS_KEY))
    this.runs = Array.isArray(runs) ? (runs as FlowRun[]) : []
    this.listeners.forEach((l) => l())
  }
}

export const flowsStore = new FlowsStore()

export function useFlows(): FlowsState {
  return useSyncExternalStore(flowsStore.subscribe, flowsStore.getSnapshot)
}

export function useFlowRuns(): FlowRun[] {
  return useSyncExternalStore(flowsStore.subscribe, flowsStore.getRuns)
}

/** Flow Studio is a beta behind a switch in Instellingen; on unless switched off. */
let enabled = readStorage(ENABLED_KEY) !== 'off'
const enabledListeners = new Set<() => void>()

export function flowStudioEnabled(): boolean {
  return enabled
}

export function setFlowStudioEnabled(on: boolean): void {
  enabled = on
  writeStorage(ENABLED_KEY, on ? 'on' : 'off')
  enabledListeners.forEach((l) => l())
}

export function useFlowStudioEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      enabledListeners.add(l)
      return () => enabledListeners.delete(l)
    },
    () => enabled,
  )
}

export { STORAGE_KEY as FLOWS_STORAGE_KEY, RUNS_KEY as FLOW_RUNS_STORAGE_KEY }
