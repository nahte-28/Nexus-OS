import { use, type ComponentType, type SVGProps } from 'react'
import { featureOn, profileApps, type AppId, type FeatureId } from '@nexus/core'
import { useDeveloperMode } from '../devtools/log'
import { openWebApp } from '../platform/desktop'
import { useFlowStudioEnabled } from '../flows/store'
import { useFeatureSwitches } from '../features/store'
import { profilesStore, useProfiles } from '../profiles/store'
import { AccountIcon, AlarmIcon, BellIcon, BookIcon, CalendarIcon, FolderIcon, CodeIcon, GradesIcon, HabitIcon,
  CardsIcon, ChartIcon, JournalIcon, WalletIcon, DevicesIcon, FlowIcon, HelpIcon, InboxIcon, SpacesIcon, HistoryIcon, BridgeIcon, BulbIcon, PuzzleIcon, InfoIcon, LayersIcon, NotesIcon, QuickNoteIcon, SettingsIcon, SunIcon, BoardIcon, LibraryIcon, FlaskIcon, GamepadIcon, SparkIcon, TimerIcon } from './icons'

/** Each app's code loads the first time it opens, so NEXUS itself starts faster. */
const preloads: Array<() => Promise<void>> = []
function load<K extends string>(name: K, loader: () => Promise<Record<K, ComponentType>>): ComponentType {
  let loaded: ComponentType | undefined
  let pending: Promise<void> | undefined
  const start = () => (pending ??= loader().then((m) => { loaded = m[name] }))
  preloads.push(start)
  function LazyApp() {
    // Suspends only until the first load; after that the app renders at once.
    if (!loaded) use(start())
    const Loaded = loaded!
    return <Loaded />
  }
  return LazyApp
}

/** Loads every app's code ahead of time (tests, and once NEXUS is idle). */
export const preloadApps = () => Promise.all(preloads.map((start) => start())).then(() => undefined)

const About = load('About', () => import('./About'))
const Account = load('Account', () => import('./Account'))
const Agenda = load('Agenda', () => import('./Agenda'))
const Assistant = load('Assistant', () => import('./Assistant'))
const Developer = load('Developer', () => import('./Developer'))
const Devices = load('Devices', () => import('./Devices'))
const Files = load('Files', () => import('./Files'))
const FlowStudio = load('FlowStudio', () => import('./FlowStudio'))
const Grades = load('Grades', () => import('./Grades'))
const Help = load('Help', () => import('./Help'))
const Habits = load('Habits', () => import('./Habits'))
const Flashcards = load('Flashcards', () => import('./Flashcards'))
const Insights = load('Insights', () => import('./Insights'))
const Finance = load('Finance', () => import('./Finance'))
const Inbox = load('Inbox', () => import('./Inbox'))
const Journal = load('Journal', () => import('./Journal'))
const Notes = load('Notes', () => import('./Notes'))
const Profiles = load('Profiles', () => import('./Profiles'))
const Reminders = load('Reminders', () => import('./Reminders'))
const Settings = load('Settings', () => import('./Settings'))
const UniversalInbox = load('UniversalInbox', () => import('./UniversalInbox'))
const Spaces = load('Spaces', () => import('./Spaces'))
const TimeMachine = load('TimeMachine', () => import('./TimeMachine'))
const Bridge = load('Bridge', () => import('./Bridge'))
const Intelligence = load('Intelligence', () => import('./Intelligence'))
const DeveloperHub = load('DeveloperHub', () => import('./DeveloperHub'))
const CaptureHub = load('CaptureHub', () => import('./CaptureHub'))
const Briefing = load('Briefing', () => import('./Briefing'))
const ProjectHub = load('ProjectHub', () => import('./ProjectHub'))
const Knowledge = load('Knowledge', () => import('./Knowledge'))
const StudyLab = load('StudyLab', () => import('./StudyLab'))
const Gaming = load('Gaming', () => import('./Gaming'))
const Study = load('Study', () => import('./Study'))

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
  /** A blueprint module: shown in every profile while its switch in Nieuwe modules is on. */
  feature?: FeatureId
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
  { id: 'journal', title: 'Dagboek', icon: JournalIcon, component: Journal, defaultSize: { width: 600, height: 640 } },
  { id: 'flashcards', title: 'Leerkaarten', icon: CardsIcon, component: Flashcards, defaultSize: { width: 640, height: 620 } },
  { id: 'insights', title: 'Inzichten', icon: ChartIcon, component: Insights, defaultSize: { width: 720, height: 640 } },
  { id: 'finance', title: 'Financiën', icon: WalletIcon, component: Finance, defaultSize: { width: 720, height: 680 } },
  { id: 'files', title: 'Bestanden', icon: FolderIcon, component: Files, defaultSize: { width: 780, height: 580 } },
  { id: 'notes', title: 'Notities', icon: NotesIcon, component: Notes, defaultSize: { width: 720, height: 460 } },
  { id: 'notifications', title: 'Meldingen', icon: BellIcon, component: Inbox, defaultSize: { width: 680, height: 480 } },
  { id: 'assistant', title: 'NEXUS AI', icon: SparkIcon, component: Assistant, defaultSize: { width: 560, height: 560 } },
  { id: 'reminders', title: 'Herinneringen', icon: AlarmIcon, component: Reminders, defaultSize: { width: 560, height: 520 } },
  { id: 'devices', title: 'Apparaten', icon: DevicesIcon, component: Devices, defaultSize: { width: 560, height: 520 } },
  { id: 'account', title: 'Account', icon: AccountIcon, component: Account, defaultSize: { width: 480, height: 340 } },
  { id: 'klashub', title: 'KlasHub', icon: BookIcon, component: KlasHubLauncher, defaultSize: { width: 420, height: 200 }, launch: openKlasHub },
  { id: 'flows', title: 'Flow Studio', icon: FlowIcon, component: FlowStudio, defaultSize: { width: 900, height: 620 }, beta: true },
  { id: 'inbox', title: 'Inbox', icon: InboxIcon, component: UniversalInbox, defaultSize: { width: 640, height: 560 }, feature: 'inbox' },
  { id: 'spaces', title: 'Spaces', icon: SpacesIcon, component: Spaces, defaultSize: { width: 680, height: 560 }, feature: 'spaces' },
  { id: 'timemachine', title: 'Time Machine', icon: HistoryIcon, component: TimeMachine, defaultSize: { width: 680, height: 600 }, feature: 'timeMachine' },
  { id: 'bridge', title: 'Bridge', icon: BridgeIcon, component: Bridge, defaultSize: { width: 620, height: 600 }, feature: 'bridge' },
  { id: 'intelligence', title: 'Intelligence', icon: BulbIcon, component: Intelligence, defaultSize: { width: 640, height: 620 }, feature: 'intelligence' },
  { id: 'devhub', title: 'Developer Hub', icon: PuzzleIcon, component: DeveloperHub, defaultSize: { width: 760, height: 660 }, feature: 'devHub' },
  { id: 'capture', title: 'Snel vastleggen', icon: QuickNoteIcon, component: CaptureHub, defaultSize: { width: 620, height: 580 }, feature: 'capture' },
  { id: 'briefing', title: 'Dagbriefing', icon: SunIcon, component: Briefing, defaultSize: { width: 640, height: 600 }, feature: 'briefing' },
  { id: 'projecthub', title: 'Project Hub', icon: BoardIcon, component: ProjectHub, defaultSize: { width: 900, height: 640 }, feature: 'projectHub' },
  { id: 'knowledge', title: 'Kennis', icon: LibraryIcon, component: Knowledge, defaultSize: { width: 820, height: 640 }, feature: 'knowledge' },
  { id: 'studylab', title: 'Study Lab', icon: FlaskIcon, component: StudyLab, defaultSize: { width: 760, height: 640 }, feature: 'studyLab' },
  { id: 'gaming', title: 'Gaming Companion', icon: GamepadIcon, component: Gaming, defaultSize: { width: 720, height: 620 }, feature: 'gaming' },
  { id: 'profiles', title: 'Profielen', icon: LayersIcon, component: Profiles, defaultSize: { width: 620, height: 540 } },
  { id: 'settings', title: 'Instellingen', icon: SettingsIcon, component: Settings, defaultSize: { width: 520, height: 420 } },
  { id: 'developer', title: 'Ontwikkelaar', icon: CodeIcon, component: Developer, defaultSize: { width: 640, height: 480 }, developer: true },
  { id: 'help', title: 'Help', icon: HelpIcon, component: Help, defaultSize: { width: 620, height: 600 } },
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
  const switches = useFeatureSwitches()
  const { active } = useProfiles()
  const ids = profileApps(active)
  if (developerMode && !ids.includes('developer')) ids.unshift('developer')
  // Flow Studio sits with the apps every profile shows, right before Profielen.
  if (flowStudio && !ids.includes('flows')) ids.splice(Math.max(ids.indexOf('profiles'), 0), 0, 'flows')
  // Modules that are switched on, likewise right before Profielen.
  const modules = APPS.filter((a) => a.feature && featureOn(switches, a.feature) && !ids.includes(a.id)).map((a) => a.id)
  ids.splice(Math.max(ids.indexOf('profiles'), 0), 0, ...modules)
  return ids.flatMap((id) =>
    APPS.filter((a) => a.id === id && (!a.developer || developerMode || active.id === 'developer') && (!a.beta || flowStudio) && (!a.feature || featureOn(switches, a.feature))),
  )
}
