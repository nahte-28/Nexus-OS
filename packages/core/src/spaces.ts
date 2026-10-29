/**
 * NEXUS Spaces (blueprint module 1): workspaces inside a profile. A Space remembers which apps
 * were open and where their windows stood, so switching brings a whole setup back at once.
 * Pure logic; the web app stores it as user_settings key 'spaces'.
 */
import { PROFILE_IDS, type ProfileId } from './profiles'
import type { AppId, Rect } from './windows'

export interface SpaceWindow {
  appId: AppId
  rect: Rect
  minimized: boolean
  maximized: boolean
}

export interface Space {
  id: string
  profileId: ProfileId
  name: string
  /** One emoji. */
  icon: string
  windows: SpaceWindow[]
  archived: boolean
  createdAt: number
  updatedAt: number
  /** Kept as a tombstone so a delete reaches every device. */
  deletedAt: number | null
  /** Goes up with every saved layout; shown when two devices disagree. */
  version: number
}

export interface SpacesState {
  revision: number
  spaces: Space[]
  /** The Space used last per profile, for the suggestion when the profile turns on. */
  lastUsed: Partial<Record<ProfileId, { id: string; at: number }>>
  /** Rules tab: offer the last Space of a profile when that profile turns on. */
  suggestOnProfile: boolean
  settingsUpdatedAt: number
}

export const MAX_SPACES = 30
export const MAX_SPACE_WINDOWS = 12
export const MAX_SPACE_NAME = 60

export const emptySpaces = (): SpacesState => ({ revision: 0, spaces: [], lastUsed: {}, suggestOnProfile: true, settingsUpdatedAt: 0 })

export interface SpaceTemplate {
  id: string
  name: string
  icon: string
  profileId: ProfileId
  description: string
  apps: AppId[]
}

export const SPACE_TEMPLATES: SpaceTemplate[] = [
  { id: 'studeren', name: 'Studeren', icon: '📚', profileId: 'school', description: 'Agenda, Studie en Notities naast elkaar.', apps: ['agenda', 'study', 'notes'] },
  { id: 'examens', name: 'Examens', icon: '🎯', profileId: 'school', description: 'Studie, Leerkaarten en Agenda voor de blokperiode.', apps: ['study', 'flashcards', 'agenda'] },
  { id: 'geld', name: 'Geld en planning', icon: '💶', profileId: 'personal', description: 'Financiën, Agenda en Notities.', apps: ['finance', 'agenda', 'notes'] },
]

/** Windows side by side in [area], left to right, for a template or "Netjes schikken". */
export function tileWindows(apps: AppId[], area: { width: number; height: number }): SpaceWindow[] {
  const n = Math.min(apps.length, MAX_SPACE_WINDOWS)
  if (n === 0) return []
  const gap = 12
  const cols = n <= 3 ? n : Math.ceil(n / 2)
  const rows = Math.ceil(n / cols)
  const width = Math.max(280, Math.floor((area.width - gap * (cols + 1)) / cols))
  const height = Math.max(180, Math.floor((area.height - gap * (rows + 1)) / rows))
  return apps.slice(0, n).map((appId, i) => ({
    appId,
    rect: { x: gap + (i % cols) * (width + gap), y: gap + Math.floor(i / cols) * (height + gap), width, height },
    minimized: false,
    maximized: false,
  }))
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseWindow(raw: unknown): SpaceWindow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const w = raw as Record<string, unknown>
  const r = w.rect as Record<string, unknown> | undefined
  if (typeof w.appId !== 'string' || !r || ![r.x, r.y, r.width, r.height].every(isNum)) return null
  return {
    appId: w.appId as AppId,
    rect: { x: r.x as number, y: r.y as number, width: r.width as number, height: r.height as number },
    minimized: w.minimized === true,
    maximized: w.maximized === true,
  }
}

export function parseSpace(raw: unknown): Space | null {
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Record<string, unknown>
  if (typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' || !PROFILE_IDS.includes(s.profileId as ProfileId)) return null
  if (!isNum(s.createdAt) || !isNum(s.updatedAt)) return null
  return {
    id: s.id,
    profileId: s.profileId as ProfileId,
    name: s.name.slice(0, MAX_SPACE_NAME),
    icon: typeof s.icon === 'string' && s.icon ? s.icon.slice(0, 8) : '🗂️',
    windows: Array.isArray(s.windows) ? s.windows.map(parseWindow).filter((w): w is SpaceWindow => w !== null).slice(0, MAX_SPACE_WINDOWS) : [],
    archived: s.archived === true,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    deletedAt: isNum(s.deletedAt) ? s.deletedAt : null,
    version: isNum(s.version) ? s.version : 1,
  }
}

export function parseSpacesState(raw: unknown): SpacesState {
  if (typeof raw !== 'object' || raw === null) return emptySpaces()
  const s = raw as Record<string, unknown>
  const lastUsed: SpacesState['lastUsed'] = {}
  if (typeof s.lastUsed === 'object' && s.lastUsed !== null) {
    for (const p of PROFILE_IDS) {
      const v = (s.lastUsed as Record<string, unknown>)[p] as { id?: unknown; at?: unknown } | undefined
      if (v && typeof v.id === 'string' && isNum(v.at)) lastUsed[p] = { id: v.id, at: v.at }
    }
  }
  return {
    revision: isNum(s.revision) ? s.revision : 0,
    spaces: Array.isArray(s.spaces) ? s.spaces.map(parseSpace).filter((x): x is Space => x !== null) : [],
    lastUsed,
    suggestOnProfile: s.suggestOnProfile !== false,
    settingsUpdatedAt: isNum(s.settingsUpdatedAt) ? s.settingsUpdatedAt : 0,
  }
}

/** Both copies together: per Space the newest change wins, per profile the latest use. */
export function mergeSpaces(a: SpacesState, b: SpacesState): SpacesState {
  const byId = new Map<string, Space>()
  for (const s of [...a.spaces, ...b.spaces]) {
    const old = byId.get(s.id)
    if (!old || s.updatedAt > old.updatedAt || (s.updatedAt === old.updatedAt && s.version > old.version)) byId.set(s.id, s)
  }
  const lastUsed: SpacesState['lastUsed'] = { ...a.lastUsed }
  for (const p of PROFILE_IDS) {
    const other = b.lastUsed[p]
    if (other && (!lastUsed[p] || other.at > lastUsed[p]!.at)) lastUsed[p] = other
  }
  const settings = b.settingsUpdatedAt > a.settingsUpdatedAt ? b : a
  return {
    revision: Math.max(a.revision, b.revision),
    spaces: [...byId.values()].sort((x, y) => x.createdAt - y.createdAt),
    lastUsed,
    suggestOnProfile: settings.suggestOnProfile,
    settingsUpdatedAt: settings.settingsUpdatedAt,
  }
}

/** The Spaces that are still there (not deleted), archived ones included. */
export const liveSpaces = (s: SpacesState): Space[] => s.spaces.filter((x) => x.deletedAt === null)

export function createSpace(
  state: SpacesState,
  input: { id: string; name: string; icon?: string; profileId: ProfileId; windows: SpaceWindow[] },
  now: number,
): SpacesState {
  if (liveSpaces(state).length >= MAX_SPACES) throw new Error(`Je hebt al ${MAX_SPACES} Spaces.`)
  const name = input.name.trim().slice(0, MAX_SPACE_NAME) || 'Nieuwe Space'
  const space: Space = {
    id: input.id,
    profileId: input.profileId,
    name,
    icon: input.icon || '🗂️',
    windows: input.windows.slice(0, MAX_SPACE_WINDOWS),
    archived: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
  }
  return { ...state, spaces: [...state.spaces, space] }
}

export function changeSpace(state: SpacesState, id: string, patch: Partial<Pick<Space, 'name' | 'icon' | 'archived' | 'windows' | 'profileId'>>, now: number): SpacesState {
  return {
    ...state,
    spaces: state.spaces.map((s) =>
      s.id === id
        ? {
            ...s,
            ...patch,
            name: patch.name !== undefined ? patch.name.trim().slice(0, MAX_SPACE_NAME) || s.name : s.name,
            windows: patch.windows ? patch.windows.slice(0, MAX_SPACE_WINDOWS) : s.windows,
            updatedAt: now,
            version: patch.windows ? s.version + 1 : s.version,
          }
        : s,
    ),
  }
}

export function duplicateSpace(state: SpacesState, id: string, newId: string, now: number): SpacesState {
  const src = state.spaces.find((s) => s.id === id && s.deletedAt === null)
  if (!src) return state
  return createSpace(state, { id: newId, name: `${src.name} (kopie)`.slice(0, MAX_SPACE_NAME), icon: src.icon, profileId: src.profileId, windows: src.windows }, now)
}

export function deleteSpace(state: SpacesState, id: string, now: number): SpacesState {
  return { ...state, spaces: state.spaces.map((s) => (s.id === id ? { ...s, windows: [], deletedAt: now, updatedAt: now } : s)) }
}

export function markUsed(state: SpacesState, space: Space, now: number): SpacesState {
  return { ...state, lastUsed: { ...state.lastUsed, [space.profileId]: { id: space.id, at: now } } }
}

/** The Space to offer when [profile] turns on: the one used last, if it still exists. */
export function suggestedSpace(state: SpacesState, profile: ProfileId): Space | null {
  if (!state.suggestOnProfile) return null
  const last = state.lastUsed[profile]
  return liveSpaces(state).find((s) => s.id === last?.id && !s.archived) ?? null
}

/** Whether the open windows differ from what the Space has saved (same apps in the same places). */
export function layoutChanged(saved: SpaceWindow[], open: SpaceWindow[]): boolean {
  const key = (w: SpaceWindow) => `${w.appId}:${w.rect.x},${w.rect.y},${w.rect.width},${w.rect.height}:${w.minimized}:${w.maximized}`
  return saved.map(key).join('|') !== open.map(key).join('|')
}
