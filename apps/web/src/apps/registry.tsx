import type { ComponentType, SVGProps } from 'react'
import type { AppId } from '@nexus/core'
import { About } from './About'
import { InfoIcon, NotesIcon, SettingsIcon } from './icons'
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
  { id: 'settings', title: 'Instellingen', icon: SettingsIcon, component: Settings, defaultSize: { width: 520, height: 420 } },
  { id: 'about', title: 'Over NEXUS', icon: InfoIcon, component: About, defaultSize: { width: 460, height: 360 } },
]

export function getApp(id: AppId): AppDefinition {
  const app = APPS.find((a) => a.id === id)
  if (!app) throw new Error(`Unknown app: ${id}`)
  return app
}
