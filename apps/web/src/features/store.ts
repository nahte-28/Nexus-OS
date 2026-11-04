import { useSyncExternalStore } from 'react'
import { featureOn, parseSwitches, type FeatureId, type FeatureSwitches } from '@nexus/core'
import { profilesStore } from '../profiles/store'
import { readStorage, writeStorage } from '../state/storage'

/**
 * The module switches in Instellingen > Nieuwe modules. They travel with your profiles, so they are
 * the same on every device with your account; this key is the copy from before that, taken over once.
 */
const KEY = 'nexus.features'
const listeners = new Set<() => void>()

function fromProfiles(): FeatureSwitches {
  return profilesStore.getSnapshot().state.features
}

// Switches set on this device before they travelled with the profiles: take them over once.
;(() => {
  try {
    const local = parseSwitches(JSON.parse(readStorage(KEY) ?? '{}'))
    if (Object.keys(local).length > 0 && Object.keys(fromProfiles()).length === 0) profilesStore.update((s) => ({ ...s, features: local }))
  } catch {
    // Unreadable old copy: nothing to take over.
  }
})()

let switches: FeatureSwitches = fromProfiles()
profilesStore.subscribe(() => {
  const next = fromProfiles()
  if (next === switches) return
  switches = next
  writeStorage(KEY, JSON.stringify(switches))
  listeners.forEach((l) => l())
})

export function setFeature(id: FeatureId, on: boolean): void {
  profilesStore.update((s) => ({ ...s, features: { ...s.features, [id]: on } }))
}

/** Whether a module is on right now, outside React. */
export const isFeatureOn = (id: FeatureId) => featureOn(switches, id)

export function onFeaturesChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
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
