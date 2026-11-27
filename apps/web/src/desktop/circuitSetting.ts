import { useSyncExternalStore } from 'react'
import { readStorage, writeStorage } from '../state/storage'

/** Pulses on the desktop's copper traces (Circuit Flow); on unless you switch them off. Per device. */
const KEY = 'nexus.circuitFlow'
let moving = readStorage(KEY) !== 'off'
const listeners = new Set<() => void>()

export function setCircuitMotion(on: boolean): void {
  moving = on
  writeStorage(KEY, on ? 'on' : 'off')
  listeners.forEach((l) => l())
}

export function useCircuitMotion(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => moving,
  )
}
