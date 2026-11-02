import { useSyncExternalStore } from 'react'
import { addApproval, fullAiContext, parseAiContext, parseApprovals, type AiContext, type AiModule, type ApprovalEntry } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

const CONTEXT_KEY = 'nexus.ai.context'
const APPROVALS_KEY = 'nexus.ai.approvals'

function read<T>(key: string, parse: (raw: unknown) => T, fallback: T): T {
  try {
    const raw = readStorage(key)
    return raw === null ? fallback : parse(JSON.parse(raw))
  } catch {
    return fallback
  }
}

/** What NEXUS AI may see per module. Kept on this device, like the "altijd toestaan" choices. */
export class AiContextStore {
  private state: AiContext
  private listeners = new Set<() => void>()

  constructor(private persist = true) {
    this.state = persist ? read(CONTEXT_KEY, parseAiContext, fullAiContext()) : fullAiContext()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): AiContext => this.state

  set(module: AiModule, on: boolean): void {
    if (this.state[module] === on) return
    this.state = { ...this.state, [module]: on }
    if (this.persist) writeStorage(CONTEXT_KEY, JSON.stringify(this.state))
    this.listeners.forEach((l) => l())
  }
}

/** Every approval, of NEXUS AI and of Intelligence, newest first. Kept on this device. */
export class ApprovalLog {
  private list: ApprovalEntry[]
  private listeners = new Set<() => void>()

  constructor(private persist = true) {
    this.list = persist ? read(APPROVALS_KEY, parseApprovals, []) : []
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ApprovalEntry[] => this.list

  private save(next: ApprovalEntry[]): void {
    this.list = next
    if (this.persist) writeStorage(APPROVALS_KEY, JSON.stringify(next))
    this.listeners.forEach((l) => l())
  }

  add(entry: Omit<ApprovalEntry, 'id' | 'at'> & { at?: number; id?: string }): void {
    const at = entry.at ?? Date.now()
    const id = entry.id ?? `${at}-${Math.random().toString(36).slice(2, 8)}`
    this.save(addApproval(this.list, { ...entry, id, at }))
  }

  clear(): void {
    this.save([])
  }
}

const browser = typeof window !== 'undefined'
export const aiContextStore = new AiContextStore(browser)
export const approvalLog = new ApprovalLog(browser)

export const useAiContext = () => useSyncExternalStore(aiContextStore.subscribe, aiContextStore.getSnapshot)
export const useApprovals = () => useSyncExternalStore(approvalLog.subscribe, approvalLog.getSnapshot)
