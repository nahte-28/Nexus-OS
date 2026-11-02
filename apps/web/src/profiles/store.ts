import { useSyncExternalStore } from 'react'
import {
  activeProfile,
  addProfileChange,
  explainActive,
  isThemeId,
  chooseProfile,
  parseProfileHistory,
  parseProfilesState,
  type ActiveReason,
  type ProfileChange,
  type Profile,
  type ProfileId,
  type ProfileOverride,
  type ProfilesState,
} from '@nexus/core'
import { logEvent } from '../devtools/log'
import { readStorage, writeStorage } from '../state/storage'

const STORAGE_KEY = 'nexus.profiles'
/** Profiles 2.0: when and why the active profile changed, on this device. */
const HISTORY_KEY = 'nexus.profiles.history'
/** How often the schedule is checked while NEXUS is open; also on focus and when the tab returns. */
const TICK_MS = 30_000

export interface ProfilesSnapshot {
  state: ProfilesState
  active: Profile
  reason: ActiveReason
}

/** NEXUS Profiles on this device. Stored locally so they work offline; sync comes later. */
export class ProfilesStore {
  private snapshot: ProfilesSnapshot
  private listeners = new Set<() => void>()
  private history: ProfileChange[]

  constructor(
    private now: () => number = Date.now,
    initial: ProfilesState = loadInitial(),
    private persistHistory = true,
  ) {
    this.snapshot = this.compute(initial)
    this.history = persistHistory ? parseProfileHistory(readJson(readStorage(HISTORY_KEY))) : []
    this.record(this.snapshot)
  }

  getHistory = (): ProfileChange[] => this.history

  /** Notes a switch, or a new reason for the same profile (a lesson starts, a choice ends). */
  private record(next: ProfilesSnapshot): void {
    const at = this.now()
    const last = this.history[0]
    const updated = addProfileChange(this.history, { at, profile: next.active.id, from: last ? last.profile : null, reason: next.reason, why: explainActive(next.state, at, next.reason) })
    if (updated === this.history) return
    this.history = updated
    if (this.persistHistory) writeStorage(HISTORY_KEY, JSON.stringify(updated))
  }

  clearHistory(): void {
    this.history = []
    if (this.persistHistory) writeStorage(HISTORY_KEY, '[]')
    this.record(this.snapshot)
    this.listeners.forEach((l) => l())
  }

  private compute(state: ProfilesState): ProfilesSnapshot {
    const { id, reason } = activeProfile(state, this.now())
    return { state, active: state.profiles[id], reason }
  }

  private emit(next: ProfilesSnapshot): void {
    const before = this.snapshot
    this.snapshot = next
    if (before.active.id !== next.active.id) logEvent('system', `Profiel: ${next.active.name} (${next.reason})`)
    this.record(next)
    this.listeners.forEach((l) => l())
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ProfilesSnapshot => this.snapshot

  /** Re-evaluates the schedule; only notifies when the active profile or the reason for it changed. */
  tick = (): void => {
    const next = this.compute(this.snapshot.state)
    const at = this.now()
    const whyChanged = next.reason === 'agenda' && this.history[0]?.why !== explainActive(next.state, at, next.reason)
    if (next.active !== this.snapshot.active || next.reason !== this.snapshot.reason || whyChanged) this.emit(next)
  }

  /** Applies a change made on this device and stores it. */
  update(change: (state: ProfilesState) => ProfilesState): void {
    const changed = change(this.snapshot.state)
    const state = {
      ...changed,
      revision: Math.max(changed.revision, this.snapshot.state.revision + 1),
    }
    writeStorage(STORAGE_KEY, JSON.stringify(state))
    this.emit(this.compute(state))
  }

  choose(profile: ProfileId, mode: ProfileOverride['mode'] = 'until-change', until?: number, by?: string): void {
    this.update((s) => chooseProfile(s, profile, this.now(), mode, until, by))
  }

  updateProfile(id: ProfileId, patch: Partial<Profile>): void {
    this.update((s) => ({
      ...s,
      profiles: { ...s.profiles, [id]: { ...s.profiles[id], ...patch, id } },
    }))
  }

  /** Takes over a copy from the account (another device), as is: no new revision, so no echo. */
  adopt(state: ProfilesState): void {
    writeStorage(STORAGE_KEY, JSON.stringify(state))
    this.emit(this.compute(state))
  }

  /** Another tab or window changed the stored copy. */
  reload(raw: string | null): void {
    const state = parseProfilesState(readJson(raw))
    if (state.revision > this.snapshot.state.revision) this.emit(this.compute(state))
  }
}

/** The first time, the everyday profiles keep the theme you already picked. */
function loadInitial(): ProfilesState {
  const raw = readStorage(STORAGE_KEY)
  const state = parseProfilesState(readJson(raw))
  const theme = readStorage('nexus.theme')
  if (!raw && isThemeId(theme)) {
    state.profiles.school.theme = theme
    state.profiles.personal.theme = theme
  }
  return state
}

function readJson(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const profilesStore = new ProfilesStore()

export type ChoiceDuration = 'until-change' | 'hour' | 'today' | 'until-manual'

/** Picks a profile by hand (or from a flow, then [by] names it) for the chosen duration. */
export function chooseFor(profile: ProfileId, duration: ChoiceDuration, now = Date.now(), store = profilesStore, by?: string): void {
  if (duration === 'hour') return store.choose(profile, 'until-time', now + 60 * 60_000, by)
  if (duration === 'today') {
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    return store.choose(profile, 'until-time', midnight.getTime(), by)
  }
  store.choose(profile, duration, undefined, by)
}

/** Keeps the active profile right while NEXUS runs, after sleep and across tabs. */
export function startProfileClock(store = profilesStore): () => void {
  const timer = setInterval(store.tick, TICK_MS)
  const onVisible = () => document.visibilityState === 'visible' && store.tick()
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && store.reload(e.newValue)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', store.tick)
  window.addEventListener('storage', onStorage)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', store.tick)
    window.removeEventListener('storage', onStorage)
  }
}

export function useProfiles(): ProfilesSnapshot {
  return useSyncExternalStore(profilesStore.subscribe, profilesStore.getSnapshot)
}

export function useProfileHistory(): ProfileChange[] {
  return useSyncExternalStore(profilesStore.subscribe, profilesStore.getHistory)
}
