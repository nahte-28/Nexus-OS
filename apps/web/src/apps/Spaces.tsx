import { useState, useSyncExternalStore } from 'react'
import {
  changeSpace,
  deleteSpace,
  duplicateSpace,
  layoutChanged,
  liveSpaces,
  PROFILE_IDS,
  SPACE_TEMPLATES,
  tileWindows,
  type AppId,
  type Space,
} from '@nexus/core'
import { SIDEBAR_WIDTH } from '../desktop/Desktop'
import { TASKBAR_HEIGHT } from '../desktop/Taskbar'
import { useProfiles } from '../profiles/store'
import { newSpace, openLayout, saveLayout, switchToSpace } from '../spaces/actions'
import { setCurrentSpace, spacesStore, spacesSyncProblem, useCurrentSpace, useSpaces } from '../spaces/store'
import { readStorage, writeStorage } from '../state/storage'
import { useOptionalWindows } from '../state/WindowsContext'
import { APPS } from './registry'

const TABS = ['Mijn Spaces', 'Templates', 'Indeling', 'Regels'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.spaces.tab'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2'
const field = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5'

/** Spaces: workspaces inside a profile that remember their apps and window layout. */
export function Spaces() {
  const [tab, setTabState] = useState<Tab>(() => (TABS as readonly string[]).includes(readStorage(TAB_KEY) ?? '') ? (readStorage(TAB_KEY) as Tab) : 'Mijn Spaces')
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  const problem = useSyncExternalStore(spacesSyncProblem.subscribe, spacesSyncProblem.getSnapshot)
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Spaces" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {problem && (
          <p role="alert" className="rounded-md border border-nx-border p-2 text-nx-muted">
            {problem.startsWith('setup:')
              ? `Spaces syncen heeft nog een stap in de database nodig: voer ${problem.slice(6).split('/').pop()} uit in de SQL Editor van Supabase. Op dit toestel werken ze al.`
              : `Spaces syncen lukte niet: ${problem}`}
          </p>
        )}
        {tab === 'Mijn Spaces' ? <MySpaces /> : tab === 'Templates' ? <Templates onDone={() => setTab('Mijn Spaces')} /> : tab === 'Indeling' ? <Layout /> : <Rules />}
      </div>
    </div>
  )
}

const appName = (id: AppId) => APPS.find((a) => a.id === id)?.title ?? id
const apps = (s: Space) => (s.windows.length === 0 ? 'geen apps' : s.windows.map((w) => appName(w.appId)).join(', '))
const profileName = (id: string) => ({ school: 'School', personal: 'Persoonlijk', gaming: 'Gaming', developer: 'Developer' })[id] ?? id

function MySpaces() {
  const state = useSpaces()
  const { active } = useProfiles()
  const windows = useOptionalWindows()
  const current = useCurrentSpace()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const all = liveSpaces(state)
  const open = all.filter((s) => !s.archived)
  const archived = all.filter((s) => s.archived)
  const sorted = [...open].sort((a, b) => Number(b.profileId === active.id) - Number(a.profileId === active.id))

  const create = () => {
    try {
      const id = newSpace({ name, profileId: active.id, windows: windows ? openLayout(windows.state) : [] })
      setName('')
      setError(null)
      // The new Space holds exactly what is open, so it is the one open now.
      if (windows) setCurrentSpace(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      {!windows && <p className="text-nx-muted">Op een gsm toont NEXUS één app tegelijk. Hier beheer je je Spaces; openen doe je op een groter scherm.</p>}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Naam van de Space" aria-label="Naam van de nieuwe Space" className={`${field} flex-1`} />
        <button type="submit" className={button}>
          {windows ? 'Huidige vensters bewaren als Space' : 'Lege Space maken'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {open.length === 0 && <p className="text-nx-muted">Nog geen Spaces. Bewaar je open vensters hierboven, of begin met een template.</p>}
      <ul className="space-y-2">
        {sorted.map((s) => (
          <li key={s.id} className={`rounded-lg border p-3 ${s.id === current ? 'border-nx-accent' : 'border-nx-border'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden className="text-lg">{s.icon}</span>
              {renaming === s.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const value = new FormData(e.currentTarget).get('name')
                    spacesStore.update((st) => changeSpace(st, s.id, { name: String(value ?? '') }, Date.now()))
                    setRenaming(null)
                  }}
                >
                  <input name="name" defaultValue={s.name} maxLength={60} aria-label="Nieuwe naam" className={`${field} flex-1`} autoFocus />
                  <button type="submit" className={small}>Bewaren</button>
                </form>
              ) : (
                <span className="flex-1 font-medium">
                  {s.name}
                  {s.id === current && <span className="ml-2 text-xs text-nx-muted">open</span>}
                </span>
              )}
              <span className="text-xs text-nx-muted">{profileName(s.profileId)}</span>
            </div>
            <p className="mt-1 text-nx-muted">{apps(s)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {windows && (
                <button type="button" className={small} onClick={() => switchToSpace(s, windows.dispatch)}>
                  Openen
                </button>
              )}
              <button type="button" className={small} onClick={() => setRenaming(s.id)}>Hernoemen</button>
              <button type="button" className={small} onClick={() => tryUpdate(setError, (st) => duplicateSpace(st, s.id, crypto.randomUUID(), Date.now()))}>Dupliceren</button>
              <button type="button" className={small} onClick={() => spacesStore.update((st) => changeSpace(st, s.id, { archived: true }, Date.now()))}>Archiveren</button>
              {deleting === s.id ? (
                <>
                  <button type="button" className={small} onClick={() => spacesStore.update((st) => deleteSpace(st, s.id, Date.now()))}>Ja, verwijderen</button>
                  <button type="button" className={small} onClick={() => setDeleting(null)}>Toch niet</button>
                </>
              ) : (
                <button type="button" className={small} onClick={() => setDeleting(s.id)}>Verwijderen</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {archived.length > 0 && (
        <details>
          <summary className="cursor-pointer text-nx-muted">Gearchiveerd ({archived.length})</summary>
          <ul className="mt-2 space-y-1">
            {archived.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="flex-1">{s.icon} {s.name}</span>
                <button type="button" className={small} onClick={() => spacesStore.update((st) => changeSpace(st, s.id, { archived: false }, Date.now()))}>Terugzetten</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function tryUpdate(setError: (e: string | null) => void, change: Parameters<typeof spacesStore.update>[0]) {
  try {
    spacesStore.update(change)
    setError(null)
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err))
  }
}

function Templates({ onDone }: { onDone: () => void }) {
  const windows = useOptionalWindows()
  const [error, setError] = useState<string | null>(null)
  const use = (t: (typeof SPACE_TEMPLATES)[number]) => {
    try {
      const area = { width: window.innerWidth - SIDEBAR_WIDTH, height: window.innerHeight - TASKBAR_HEIGHT }
      const id = newSpace({ name: t.name, icon: t.icon, profileId: t.profileId, windows: tileWindows(t.apps, area) })
      const space = liveSpaces(spacesStore.getSnapshot()).find((s) => s.id === id)
      if (space && windows) switchToSpace(space, windows.dispatch)
      else onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <>
      <p className="text-nx-muted">Een template maakt een Space met de juiste apps naast elkaar. Je kunt hem daarna aanpassen en bewaren.</p>
      {error && <p role="alert">{error}</p>}
      <ul className="grid gap-2 sm:grid-cols-3">
        {SPACE_TEMPLATES.map((t) => (
          <li key={t.id} className="flex flex-col gap-2 rounded-lg border border-nx-border p-3">
            <span className="font-medium">
              {t.icon} {t.name}
            </span>
            <span className="flex-1 text-nx-muted">{t.description}</span>
            <span className="text-xs text-nx-muted">Profiel {profileName(t.profileId)}</span>
            <button type="button" className={small} onClick={() => use(t)}>
              Gebruiken
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function Layout() {
  const state = useSpaces()
  const windows = useOptionalWindows()
  const currentId = useCurrentSpace()
  const space = liveSpaces(state).find((s) => s.id === currentId)
  if (!windows) return <p className="text-nx-muted">De indeling van een Space bewaar je op een groter scherm, waar vensters naast elkaar staan.</p>
  if (!space) return <p className="text-nx-muted">Er is geen Space open. Open er een in Mijn Spaces, of maak er een van je huidige vensters.</p>
  const open = openLayout(windows.state)
  const changed = layoutChanged(space.windows, open)
  return (
    <>
      <p>
        <span className="font-medium">
          {space.icon} {space.name}
        </span>{' '}
        <span className="text-nx-muted">bewaard met {apps(space)}.</span>
      </p>
      {changed ? (
        <div role="status" className="space-y-2 rounded-lg border border-nx-border p-3">
          <p>Je vensters zijn veranderd sinds je deze Space bewaarde. Dat geldt pas als je het bewaart.</p>
          <p className="text-nx-muted">Nu open: {open.length === 0 ? 'geen apps' : open.map((w) => appName(w.appId)).join(', ')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} onClick={() => saveLayout(space.id, open)}>
              Indeling bewaren
            </button>
            <button type="button" className={button} onClick={() => switchToSpace(space, windows.dispatch)}>
              Bewaarde indeling terugzetten
            </button>
          </div>
        </div>
      ) : (
        <p className="text-nx-muted">✓ Je vensters staan zoals bewaard.</p>
      )}
      <button
        type="button"
        className={button}
        onClick={() => {
          const area = { width: window.innerWidth - SIDEBAR_WIDTH, height: window.innerHeight - TASKBAR_HEIGHT }
          windows.dispatch({ type: 'restore', windows: tileWindows(open.map((w) => w.appId), area).map((w) => ({ ...w, title: appName(w.appId) })) })
        }}
      >
        Netjes naast elkaar zetten
      </button>
    </>
  )
}

function Rules() {
  const state = useSpaces()
  return (
    <>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={state.suggestOnProfile}
          onChange={(e) => spacesStore.update((s) => ({ ...s, suggestOnProfile: e.target.checked, settingsUpdatedAt: Date.now() }))}
          className="mt-1 accent-[var(--nx-accent)]"
        />
        <span>
          Als een profiel aangaat (ook School Mode), stel de Space voor die ik in dat profiel het laatst gebruikte.
          <span className="block text-nx-muted">NEXUS vraagt het eerst; het opent niets zonder jouw klik.</span>
        </span>
      </label>
      <p className="text-nx-muted">Laatst gebruikt per profiel:</p>
      <ul className="space-y-1">
        {PROFILE_IDS.map((p) => {
          const last = liveSpaces(state).find((s) => s.id === state.lastUsed[p]?.id)
          return (
            <li key={p}>
              {profileName(p)}: {last ? `${last.icon} ${last.name}` : <span className="text-nx-muted">nog geen</span>}
            </li>
          )
        })}
      </ul>
    </>
  )
}
