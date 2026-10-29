import { useSyncExternalStore } from 'react'
import {
  addProject,
  editProject,
  installVersion,
  noteTitle,
  openDeadlines,
  parseDevHub,
  publishVersion,
  removeProject,
  uninstall,
  type DevHubState,
} from '@nexus/core'
import { logEvent } from '../devtools/log'
import { lifeStore } from '../life/store'
import { profilesStore } from '../profiles/store'
import { notesStore } from '../state/notesStore'
import { readStorage, writeStorage } from '../state/storage'

const KEY = 'nexus.devhub'

/** Your extension projects, their published versions and what is installed; on this device only. */
export class DevHubStore {
  private state: DevHubState
  private listeners = new Set<() => void>()

  constructor(private persist = true) {
    let raw: unknown = null
    try {
      raw = persist ? JSON.parse(readStorage(KEY) ?? 'null') : null
    } catch {
      raw = null
    }
    this.state = parseDevHub(raw)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): DevHubState => this.state

  update(change: (s: DevHubState) => DevHubState): void {
    const next = change(this.state)
    if (next === this.state) return
    this.state = next
    if (this.persist) writeStorage(KEY, JSON.stringify(next))
    this.listeners.forEach((l) => l())
  }
}

export const devHubStore = new DevHubStore(typeof window !== 'undefined')

export function useDevHub(): DevHubState {
  return useSyncExternalStore(devHubStore.subscribe, devHubStore.getSnapshot)
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ext-${Date.now()}-${Math.random().toString(36).slice(2)}`)

export function createProject(now = Date.now(), store = devHubStore): string {
  const id = newId()
  store.update((s) => addProject(s, id, now))
  return id
}

export const saveProject = (id: string, patch: { manifest?: string; code?: string }, now = Date.now(), store = devHubStore) => store.update((s) => editProject(s, id, patch, now))
export const deleteProject = (id: string, store = devHubStore) => store.update((s) => removeProject(s, id))
export const removeWidget = (id: string, store = devHubStore) => store.update((s) => uninstall(s, id))

export function publish(id: string, now = Date.now(), store = devHubStore): void {
  store.update((s) => publishVersion(s, id, now))
  const p = store.getSnapshot().projects.find((x) => x.id === id)
  logEvent('system', `Developer Hub: ${p?.versions.at(-1)?.manifest.name} ${p?.versions.at(-1)?.version} gepubliceerd`)
}

/** Only after the permission dialog. */
export function install(id: string, version: string, now = Date.now(), store = devHubStore): void {
  store.update((s) => installVersion(s, id, version, now))
  logEvent('system', `Developer Hub: versie ${version} geïnstalleerd`)
}

/**
 * What the SDK methods return. Deliberately little: titles and times, never note text, tokens
 * or anything from your account.
 */
export const SDK_DATA = {
  'agenda.deadlines': (now = Date.now()) =>
    openDeadlines(lifeStore.getSnapshot())
      .filter((d) => d.dueAt > now)
      .sort((a, b) => a.dueAt - b.dueAt)
      .slice(0, 5)
      .map((d) => ({ title: d.title, dueAt: d.dueAt })),
  'notes.recent': () =>
    [...notesStore.getSnapshot()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5)
      .map((n) => ({ title: noteTitle(n), updatedAt: n.updatedAt })),
  'profile.active': () => {
    const { active } = profilesStore.getSnapshot()
    return { id: active.id, name: active.name }
  },
}
