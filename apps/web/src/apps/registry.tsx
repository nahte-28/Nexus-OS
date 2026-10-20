import type { ComponentType, SVGProps } from 'react'
import { profileApps, type AppId } from '@nexus/core'
import { About } from './About'
import { useDeveloperMode } from '../devtools/log'
import { useProfiles } from '../profiles/store'
import { Account } from './Account'
import { Assistant } from './Assistant'
import { Developer } from './Developer'
import { Devices } from './Devices'
import { AccountIcon, AlarmIcon, BellIcon, CodeIcon, DevicesIcon, InfoIcon, LayersIcon, NotesIcon, SettingsIcon, SparkIcon } from './icons'
import { Inbox } from './Inbox'
import { Notes } from './Notes'
import { Profiles } from './Profiles'
import { Reminders } from './Reminders'
import { Settings } from './Settings'

export interface AppDefinition {
  id: AppId
  title: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  component: ComponentType
  defaultSize: { width: number; height: number }
  /** Only listed while developer mode is on. */
  developer?: boolean
}

/** Every app in NEXUS. New modules (Life, Gaming, Network...) register here. */
export const APPS: AppDefinition[] = [
  { id: 'notes', title: 'Notities', icon: NotesIcon, component: Notes, defaultSize: { width: 720, height: 460 } },
  { id: 'notifications', title: 'Meldingen', icon: BellIcon, component: Inbox, defaultSize: { width: 680, height: 480 } },
  { id: 'assistant', title: 'NEXUS AI', icon: SparkIcon, component: Assistant, defaultSize: { width: 560, height: 560 } },
  { id: 'reminders', title: 'Herinneringen', icon: AlarmIcon, component: Reminders, defaultSize: { width: 560, height: 520 } },
  { id: 'devices', title: 'Apparaten', icon: DevicesIcon, component: Devices, defaultSize: { width: 560, height: 520 } },
  { id: 'account', title: 'Account', icon: AccountIcon, component: Account, defaultSize: { width: 480, height: 340 } },
  { id: 'profiles', title: 'Profielen', icon: LayersIcon, component: Profiles, defaultSize: { width: 620, height: 540 } },
  { id: 'settings', title: 'Instellingen', icon: SettingsIcon, component: Settings, defaultSize: { width: 520, height: 420 } },
  { id: 'developer', title: 'Ontwikkelaar', icon: CodeIcon, component: Developer, defaultSize: { width: 640, height: 480 }, developer: true },
  { id: 'about', title: 'Over NEXUS', icon: InfoIcon, component: About, defaultSize: { width: 460, height: 360 } },
]

export function getApp(id: AppId): AppDefinition {
  const app = APPS.find((a) => a.id === id)
  if (!app) throw new Error(`Unknown app: ${id}`)
  return app
}

/**
 * The apps to show in menus, the sidebar and grids, in the active profile's order. Developer tools
 * show in developer mode or the Developer profile.
 */
export function useVisibleApps(): AppDefinition[] {
  const developerMode = useDeveloperMode()
  const { active } = useProfiles()
  const ids = profileApps(active)
  if (developerMode && !ids.includes('developer')) ids.unshift('developer')
  return ids.flatMap((id) => APPS.filter((a) => a.id === id && (!a.developer || developerMode || active.id === 'developer')))
}
