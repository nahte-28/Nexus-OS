import type { AppId } from './windows'

/**
 * The sidebar in groups: apps that belong together sit under one heading you can fold away.
 * Every app has a group; inside a group the active profile's order stays.
 */
export type AppGroupId = 'school' | 'planning' | 'samen' | 'persoonlijk' | 'systeem'

export const APP_GROUPS: Array<{ id: AppGroupId; title: string }> = [
  { id: 'school', title: 'School' },
  { id: 'planning', title: 'Planning' },
  { id: 'samen', title: 'Samen' },
  { id: 'persoonlijk', title: 'Persoonlijk' },
  { id: 'systeem', title: 'Systeem' },
]

export const APP_GROUP: Record<AppId, AppGroupId> = {
  study: 'school',
  grades: 'school',
  flashcards: 'school',
  studylab: 'school',
  klashub: 'school',
  agenda: 'planning',
  reminders: 'planning',
  notes: 'planning',
  files: 'planning',
  inbox: 'planning',
  capture: 'planning',
  briefing: 'planning',
  projecthub: 'planning',
  knowledge: 'planning',
  spaces: 'planning',
  assistant: 'planning',
  teams: 'samen',
  friends: 'samen',
  bridge: 'samen',
  contacts: 'samen',
  habits: 'persoonlijk',
  journal: 'persoonlijk',
  insights: 'persoonlijk',
  finance: 'persoonlijk',
  gaming: 'persoonlijk',
  darts: 'persoonlijk',
  weather: 'persoonlijk',
  clock: 'persoonlijk',
  calculator: 'persoonlijk',
  browser: 'persoonlijk',
  notifications: 'systeem',
  devices: 'systeem',
  account: 'systeem',
  flows: 'systeem',
  timemachine: 'systeem',
  intelligence: 'systeem',
  devhub: 'systeem',
  controlcenter: 'systeem',
  sentinel: 'systeem',
  offline: 'systeem',
  marketplace: 'systeem',
  profiles: 'systeem',
  settings: 'systeem',
  developer: 'systeem',
  help: 'systeem',
  about: 'systeem',
  admin: 'systeem',
  linuxapps: 'systeem',
  system: 'systeem',
}

/** The apps per group, groups in the fixed order, apps in the given order; empty groups left out. */
export function groupApps<T extends { id: AppId }>(apps: T[]): Array<{ id: AppGroupId; title: string; apps: T[] }> {
  return APP_GROUPS.map((g) => ({ ...g, apps: apps.filter((a) => APP_GROUP[a.id] === g.id) })).filter((g) => g.apps.length > 0)
}
