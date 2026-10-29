import { useSyncExternalStore } from 'react'
import { featureOn, parseSwitches, type FeatureId, type FeatureSwitches } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

/** The module switches in Instellingen > Nieuwe modules, kept per device. */
const KEY = 'nexus.features'
let switches: FeatureSwitches = (() => {
  try {
    return parseSwitches(JSON.parse(readStorage(KEY) ?? '{}'))
  } catch {
    return {}
  }
})()
const listeners = new Set<() => void>()

export function setFeature(id: FeatureId, on: boolean): void {
  switches = { ...switches, [id]: on }
  writeStorage(KEY, JSON.stringify(switches))
  listeners.forEach((l) => l())
}

export function useFeatureSwitches(): FeatureSwitches {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => switches,
  )
}

export function useFeature(id: FeatureId): boolean {
  return featureOn(useFeatureSwitches(), id)
}
