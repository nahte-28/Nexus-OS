/**
 * NEXUS Marketplace (Next Frontier C): a catalog of extras made by NEXUS itself: widgets that run
 * in the Developer Hub sandbox, colour themes, Flow Studio recipes and capture templates. Nothing
 * from third parties and nothing downloaded: every item ships with NEXUS and is reviewed by the
 * same checks as your own widgets. Installing a widget shows its permissions first. Pure logic.
 */
import { addProject, installVersion, publishVersion, reviewProject, uninstall, type DevHubState, type ExtPermission } from './extensions'
import { FLOW_TEMPLATES } from './flows'
import type { AccentId } from './profiles'
import type { ThemeId } from './theme'
import type { CaptureTarget } from './captureHub'

export type MarketKind = 'widget' | 'theme' | 'flow' | 'capture'

export const MARKET_KINDS: Array<{ id: MarketKind; label: string }> = [
  { id: 'widget', label: 'Widgets' },
  { id: 'theme', label: "Thema's" },
  { id: 'flow', label: 'Flow-recepten' },
  { id: 'capture', label: 'Sjablonen' },
]

interface Base {
  id: string
  title: string
  description: string
  /** Shown as the maker; always NEXUS. */
  by: 'NEXUS'
  version: string
}

export type MarketItem =
  | (Base & { kind: 'widget'; manifest: { id: string; name: string; version: string; description: string; permissions: ExtPermission[] }; code: string })
  | (Base & { kind: 'theme'; theme: ThemeId; accent: AccentId })
  | (Base & { kind: 'flow'; template: string })
  | (Base & { kind: 'capture'; template: { name: string; text: string; target: CaptureTarget } })

const widget = (id: string, title: string, description: string, permissions: ExtPermission[], code: string): MarketItem => ({
  id: `widget-${id}`,
  kind: 'widget',
  title,
  description,
  by: 'NEXUS',
  version: '1.0.0',
  manifest: { id: `nexus-${id}`, name: title, version: '1.0.0', description, permissions },
  code,
})

const theme = (id: string, title: string, description: string, t: ThemeId, accent: AccentId): MarketItem => ({ id: `theme-${id}`, kind: 'theme', title, description, by: 'NEXUS', version: '1.0.0', theme: t, accent })

/** The catalog. Every widget passes reviewProject (a test checks it). */
export const MARKET_ITEMS: MarketItem[] = [
  widget(
    'volgende-deadline',
    'Volgende deadline',
    'Je eerstvolgende deadline en hoeveel tijd je nog hebt.',
    ['agenda.read'],
    `const list = await nexus.call('agenda.deadlines')
const next = list[0]
const title = document.createElement('p')
const left = document.createElement('p')
left.className = 'big'
if (!next) {
  title.textContent = 'Geen open deadlines'
} else {
  title.textContent = next.title
  const hours = Math.round((next.dueAt - Date.now()) / 3600000)
  left.textContent = hours < 48 ? hours + ' u' : Math.round(hours / 24) + ' d'
}
document.body.append(left, title)
`,
  ),
  widget(
    'laatste-notities',
    'Laatste notities',
    'De titels van je drie laatst gewijzigde notities.',
    ['notes.read'],
    `const notes = await nexus.call('notes.recent')
const list = document.createElement('ul')
for (const n of notes.slice(0, 3)) {
  const li = document.createElement('li')
  li.textContent = n.title || 'Zonder titel'
  list.append(li)
}
if (!notes.length) list.textContent = 'Nog geen notities.'
document.body.append(list)
`,
  ),
  widget(
    'profielbadge',
    'Profielbadge',
    'Toont groot welk profiel nu aan staat.',
    ['profile.read'],
    `const p = await nexus.call('profile.active')
const big = document.createElement('p')
big.className = 'big'
big.textContent = p.name
document.body.append(big)
`,
  ),
  theme('nacht-violet', 'Nacht violet', 'Donker thema met een violet accent; rustig voor avondstudie.', 'pulse', 'violet'),
  theme('licht-groen', 'Licht groen', 'Licht thema met een groen accent.', 'focus', 'green'),
  theme('arcade', 'Arcade', 'Donker thema met een roze accent, voor je Gaming-profiel.', 'pulse', 'pink'),
  theme('zonsopgang', 'Zonsopgang', 'Licht thema met een oranje accent.', 'focus', 'orange'),
  ...FLOW_TEMPLATES.map((t): MarketItem => ({ id: `flow-${t.id}`, kind: 'flow', title: t.title, description: t.description, by: 'NEXUS', version: '1.0.0', template: t.id })),
  { id: 'capture-labo', kind: 'capture', title: 'Labo-verslag', description: 'Een deadline voor je labo-verslag, standaard tegen vrijdag.', by: 'NEXUS', version: '1.0.0', template: { name: 'Labo-verslag', text: 'Labo-verslag  indienen vrijdag', target: 'deadline' } },
  { id: 'capture-boek', kind: 'capture', title: 'Boek of artikel', description: 'Iets om later te lezen, in Te sorteren.', by: 'NEXUS', version: '1.0.0', template: { name: 'Lezen', text: 'Lezen: ', target: 'later' } },
  { id: 'capture-vraag', kind: 'capture', title: 'Vraag voor de les', description: 'Een notitie met een vraag om in de les te stellen.', by: 'NEXUS', version: '1.0.0', template: { name: 'Vraag voor de les', text: 'Vraag: ', target: 'note' } },
]

export const marketItem = (id: string) => MARKET_ITEMS.find((i) => i.id === id) ?? null

/** What you added from the Marketplace, on this device. */
export interface MarketState {
  installed: Array<{ itemId: string; version: string; at: number }>
}

export const emptyMarket = (): MarketState => ({ installed: [] })

export function parseMarket(raw: unknown): MarketState {
  const v = raw as { installed?: unknown }
  const installed = (Array.isArray(v?.installed) ? v.installed : []).flatMap((x) => {
    const i = x as Record<string, unknown>
    return typeof i?.itemId === 'string' && marketItem(i.itemId) && typeof i.version === 'string' && typeof i.at === 'number' ? [{ itemId: i.itemId, version: i.version, at: i.at }] : []
  })
  return { installed }
}

export const isInstalled = (s: MarketState, id: string) => s.installed.some((i) => i.itemId === id)
export const markInstalled = (s: MarketState, item: MarketItem, now: number): MarketState => ({ installed: [...s.installed.filter((i) => i.itemId !== item.id), { itemId: item.id, version: item.version, at: now }] })
export const markRemoved = (s: MarketState, id: string): MarketState => ({ installed: s.installed.filter((i) => i.itemId !== id) })

/** Items of one kind matching [query]. */
export function marketView(kind: MarketKind | 'all', query: string, items = MARKET_ITEMS): MarketItem[] {
  const q = query.trim().toLowerCase()
  return items.filter((i) => (kind === 'all' || i.kind === kind) && (!q || `${i.title} ${i.description}`.toLowerCase().includes(q)))
}

/** The project id a Marketplace widget gets in the Developer Hub. */
export const widgetProjectId = (item: MarketItem) => `market-${item.id}`

/** Review result of a widget item: the same checks your own widgets go through. */
export function reviewMarketWidget(item: MarketItem) {
  if (item.kind !== 'widget') return []
  return reviewProject(JSON.stringify(item.manifest), item.code)
}

/**
 * Puts a widget item in the Developer Hub as a published, installed project with exactly the
 * permissions its manifest lists (shown to you before this runs). Reinstalling replaces it.
 */
export function installMarketWidget(state: DevHubState, item: MarketItem, now: number): DevHubState {
  if (item.kind !== 'widget') throw new Error('Dit is geen widget.')
  const id = widgetProjectId(item)
  const without: DevHubState = { projects: state.projects.filter((p) => p.id !== id), installs: state.installs.filter((i) => i.projectId !== id) }
  const added = addProject(without, id, now, JSON.stringify(item.manifest, null, 2), item.code)
  const published = publishVersion(added, id, now)
  return installVersion(published, id, item.manifest.version, now)
}

export function removeMarketWidget(state: DevHubState, item: MarketItem): DevHubState {
  const id = widgetProjectId(item)
  const s = uninstall(state, id)
  return { ...s, projects: s.projects.filter((p) => p.id !== id) }
}
