import { useSyncExternalStore } from 'react'
import type { AppId } from '@nexus/core'

/** A suggestion from a flow. Flows never open apps or install updates themselves: you choose. */
export interface FlowPrompt {
  id: string
  flowName: string
  kind: 'app' | 'update'
  app?: AppId
  at: number
}

const MAX_PROMPTS = 5
let prompts: FlowPrompt[] = []
const listeners = new Set<() => void>()

export function addPrompt(prompt: FlowPrompt): void {
  // One suggestion per app or update at a time.
  prompts = [prompt, ...prompts.filter((p) => p.kind !== prompt.kind || p.app !== prompt.app)].slice(0, MAX_PROMPTS)
  listeners.forEach((l) => l())
}

export function dismissPrompt(id: string): void {
  prompts = prompts.filter((p) => p.id !== id)
  listeners.forEach((l) => l())
}

export function usePrompts(): FlowPrompt[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => prompts,
  )
}
