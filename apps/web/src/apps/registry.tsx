import type { ComponentType, SVGProps } from 'react'
import type { AppId } from '@nexus/core'
import { About } from './About'
import { Account } from './Account'
import { Devices } from './Devices'
import { AccountIcon, BellIcon, DevicesIcon, InfoIcon, NotesIcon, SettingsIcon } from './icons'
import { Inbox } from './Inbox'
import { Notes } from './Notes'
import { Settings } from './Settings'

export interface AppDefinition {
  id: AppId
  title: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  component: ComponentType
  defaultSize: { width: number; height: number }
}

/** Every app in NEXUS. New modules (Life, Gaming, Network...) register here. */
export const APPS: AppDefinition[] = [
  { id: 'notes', title: 'Notities', icon: NotesIcon, component: Notes, defaultSize: { width: 720, height: 460 } },
  { id: 'notifications', title: 'Meldingen', icon: BellIcon, component: Inbox, defaultSize: { width: 680, height: 480 } },
  { id: 'devices', title: 'Apparaten', icon: DevicesIcon, component: Devices, defaultSize: { width: 560, height: 520 } },
  { id: 'account', title: 'Account', icon: AccountIcon, component: Account, defaultSize: { width: 480, height: 340 } },
  { id: 'settings', title: 'Instellingen', icon: SettingsIcon, component: Settings, defaultSize: { width: 520, height: 420 } },
  { id: 'about', title: 'Over NEXUS', icon: InfoIcon, component: About, defaultSize: { width: 460, height: 360 } },
]

export function getApp(id: AppId): AppDefinition {
  const app = APPS.find((a) => a.id === id)
  if (!app) throw new Error(`Unknown app: ${id}`)
  return app
}
