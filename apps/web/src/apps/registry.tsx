import type { ComponentType, SVGProps } from 'react'
import { profileApps, type AppId } from '@nexus/core'
import { About } from './About'
import { useDeveloperMode } from '../devtools/log'
import { openWebApp } from '../platform/desktop'
import { useFlowStudioEnabled } from '../flows/store'
import { profilesStore, useProfiles } from '../profiles/store'
import { Account } from './Account'
import { Agenda } from './Agenda'
import { Assistant } from './Assistant'
import { Developer } from './Developer'
import { Devices } from './Devices'
import { Files } from './Files'
import { FlowStudio } from './FlowStudio'
import { AccountIcon, AlarmIcon, BellIcon, BookIcon, CalendarIcon, FolderIcon, CodeIcon, GradesIcon, HabitIcon,
  CardsIcon, ChartIcon, WalletIcon, DevicesIcon, FlowIcon, InfoIcon, LayersIcon, NotesIcon, SettingsIcon, SparkIcon, TimerIcon } from './icons'
import { Grades } from './Grades'
import { Habits } from './Habits'
import { Flashcards } from './Flashcards'
import { Insights } from './Insights'
import { Budget } from './Budget'
import { Inbox } from './Inbox'
import { Notes } from './Notes'
import { Profiles } from './Profiles'
import { Reminders } from './Reminders'
import { Settings } from './Settings'
import { Study } from './Study'

export interface AppDefinition {
  id: AppId
  title: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  component: ComponentType
  defaultSize: { width: number; height: number }
  /** Only listed while developer mode is on. */
  developer?: boolean
  /** A beta behind its own switch in Instellingen. */
  beta?: boolean
  /** Opens outside NEXUS's own windows (a website app) instead of showing [component]. */
  launch?: () => void
}

/** KlasHub (Remo's study hub) opens in the browser, where you stay logged in. */
export function openKlasHub(): void {
  void openWebApp(profilesStore.getSnapshot().state.klashubUrl)
}

function KlasHubLauncher() {
  return (
    <div className="space-y-2 p-4 text-sm">
      <p>KlasHub opent in je browser.</p>
      <button type="button" onClick={openKlasHub} className="rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text">
        KlasHub openen
      </button>
    </div>
  )
}

/** Every app in NEXUS. New modules (Life, Gaming, Network...) register here. */
export const APPS: AppDefinition[] = [
  { id: 'agenda', title: 'Agenda', icon: CalendarIcon, component: Agenda, defaultSize: { width: 760, height: 580 } },
  { id: 'study', title: 'Studie', icon: TimerIcon, component: Study, defaultSize: { width: 640, height: 600 } },
  { id: 'grades', title: 'Cijfers', icon: GradesIcon, component: Grades, defaultSize: { width: 680, height: 600 } },
  { id: 'habits', title: 'Gewoontes', icon: HabitIcon, component: Habits, defaultSize: { width: 620, height: 580 } },
  { id: 'flashcards', title: 'Leerkaarten', icon: CardsIcon, component: Flashcards, defaultSize: { width: 640, height: 620 } },
  { id: 'insights', title: 'Inzichten', icon: ChartIcon, component: Insights, defaultSize: { width: 720, height: 640 } },
  { id: 'budget', title: 'Budget', icon: WalletIcon, component: Budget, defaultSize: { width: 640, height: 640 } },
  { id: 'files', title: 'Bestanden', icon: FolderIcon, component: Files, defaultSize: { width: 780, height: 580 } },
  { id: 'notes', title: 'Notities', icon: NotesIcon, component: Notes, defaultSize: { width: 720, height: 460 } },
  { id: 'notifications', title: 'Meldingen', icon: BellIcon, component: Inbox, defaultSize: { width: 680, height: 480 } },
  { id: 'assistant', title: 'NEXUS AI', icon: SparkIcon, component: Assistant, defaultSize: { width: 560, height: 560 } },
  { id: 'reminders', title: 'Herinneringen', icon: AlarmIcon, component: Reminders, defaultSize: { width: 560, height: 520 } },
  { id: 'devices', title: 'Apparaten', icon: DevicesIcon, component: Devices, defaultSize: { width: 560, height: 520 } },
  { id: 'account', title: 'Account', icon: AccountIcon, component: Account, defaultSize: { width: 480, height: 340 } },
  { id: 'klashub', title: 'KlasHub', icon: BookIcon, component: KlasHubLauncher, defaultSize: { width: 420, height: 200 }, launch: openKlasHub },
  { id: 'flows', title: 'Flow Studio', icon: FlowIcon, component: FlowStudio, defaultSize: { width: 900, height: 620 }, beta: true },
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
  const flowStudio = useFlowStudioEnabled()
  const { active } = useProfiles()
  const ids = profileApps(active)
  if (developerMode && !ids.includes('developer')) ids.unshift('developer')
  // Flow Studio sits with the apps every profile shows, right before Profielen.
  if (flowStudio && !ids.includes('flows')) ids.splice(Math.max(ids.indexOf('profiles'), 0), 0, 'flows')
  return ids.flatMap((id) => APPS.filter((a) => a.id === id && (!a.developer || developerMode || active.id === 'developer') && (!a.beta || flowStudio)))
}
