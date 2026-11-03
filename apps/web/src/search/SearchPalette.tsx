import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  checkCommand,
  FINANCE_ACTIONS,
  isPinned,
  LAUNCHER_COMMANDS,
  launcherResults,
  previewCommand,
  SEARCH_KIND_LABELS,
  searchAll,
  type AppId,
  type CommandValues,
  type LauncherCommand,
  type LauncherRef,
  type SearchResult,
} from '@nexus/core'
import { useVisibleApps } from '../apps/registry'
import { useFeature } from '../features/store'
import { runCommand } from '../launcher/commands'
import { launcherStore, useLauncher } from '../launcher/store'
import { SearchIcon } from '../apps/icons'
import { filesStore } from '../files/store'
import { lifeStore } from '../life/store'
import { remindersStore } from '../reminders/store'
import { useNotes } from '../state/useNotes'
import { reveal } from './reveal'

/** Opens the search window on Ctrl+K / Cmd+K from anywhere. */
export function useSearchShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
}

export function SearchButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Zoeken (Ctrl+K)"
      title="Zoeken (Ctrl+K)"
      onClick={onClick}
      className={`grid size-10 place-items-center rounded-lg text-nx-muted hover:bg-nx-surface-2 ${className}`}
    >
      <SearchIcon className="size-5" />
    </button>
  )
}

type LauncherTab = 'Recent' | 'Vastgezet' | 'Opdrachten'
const LAUNCHER_TABS: LauncherTab[] = ['Recent', 'Vastgezet', 'Opdrachten']
const TAB_KEY = 'nexus.launcher.tab'
const readTab = (): LauncherTab => {
  try {
    const t = localStorage.getItem(TAB_KEY) as LauncherTab | null
    return t && LAUNCHER_TABS.includes(t) ? t : 'Recent'
  } catch {
    return 'Recent'
  }
}

/**
 * Zoeken overal: one box over apps, notes, files, the agenda and reminders. With the Launcher module
 * on, it also shows what you opened recently and pinned, settings pages and commands.
 */
export function SearchPalette({ onClose, onOpenApp }: { onClose: () => void; onOpenApp: (id: AppId) => void }) {
  const launcher = useFeature('launcher')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [tab, setTabState] = useState<LauncherTab>(readTab)
  const [command, setCommand] = useState<LauncherCommand | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const apps = useVisibleApps()
  const { notes } = useNotes()
  const files = useSyncExternalStore(filesStore.subscribe, filesStore.getSnapshot)
  const life = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  const saved = useLauncher()

  const appIds = useMemo(() => new Set(apps.map((a) => a.id)), [apps])
  // Commands only for apps this profile shows.
  const commands = useMemo(() => LAUNCHER_COMMANDS.filter((c) => appIds.has(c.app)), [appIds])

  const results = useMemo(() => {
    const found = searchAll(query, {
      apps: apps.map((a) => ({ id: a.id, title: a.title })),
      notes,
      files,
      life,
      reminders,
      actions: appIds.has('finance') ? FINANCE_ACTIONS.map((a) => ({ ...a, app: 'finance' as const })) : [],
    })
    if (!launcher) return found
    return [...found, ...launcherResults(query, commands)].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'nl')).slice(0, 50)
  }, [query, apps, appIds, notes, files, life, reminders, launcher, commands])

  /** A recent or pinned item that still exists and may be shown in this profile. */
  const exists = useMemo(() => {
    const ids = {
      note: new Set(notes.filter((n) => n.deletedAt === null).map((n) => n.id)),
      file: new Set(files.map((f) => f.id)),
      life: new Set(life.filter((i) => i.deletedAt === null).map((i) => i.id)),
      reminder: new Set(reminders.map((r) => r.id)),
    }
    return (r: LauncherRef) => {
      if (!appIds.has(r.app)) return false
      if (r.kind === 'note') return ids.note.has(r.id)
      if (r.kind === 'file') return ids.file.has(r.id)
      if (r.kind === 'deadline' || r.kind === 'appointment' || r.kind === 'project') return ids.life.has(r.id)
      if (r.kind === 'reminder') return ids.reminder.has(r.id)
      if (r.kind === 'command') return commands.some((c) => c.id === r.id)
      return true
    }
  }, [notes, files, life, reminders, appIds, commands])

  const browsing = launcher && query.trim() === ''
  const tabItems: LauncherRef[] = useMemo(() => {
    if (!browsing) return []
    if (tab === 'Recent') return saved.recent.filter(exists)
    if (tab === 'Vastgezet') return saved.pinned.filter(exists)
    return commands.map((c) => ({ kind: 'command' as const, id: c.id, title: c.label, detail: c.category, app: c.app }))
  }, [browsing, tab, saved, exists, commands])

  // Group by kind in the order the best match of each kind came in.
  const groups = useMemo(() => {
    const map = new Map<SearchResult['kind'], LauncherRef[]>()
    for (const r of results) map.set(r.kind, [...(map.get(r.kind) ?? []), r])
    return [...map.entries()]
  }, [results])
  const flat: LauncherRef[] = browsing ? tabItems : groups.flatMap(([, list]) => list)
  const current = Math.min(active, Math.max(flat.length - 1, 0))

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [current, query, tab])

  const setTab = (t: LauncherTab) => {
    setTabState(t)
    setActive(0)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // Only a preference.
    }
  }

  const choose = (r: LauncherRef) => {
    if (launcher) launcherStore.opened(r)
    if (r.kind === 'command') {
      const c = commands.find((x) => x.id === r.id)
      if (c) {
        setStatus(null)
        setCommand(c)
      }
      return
    }
    if (r.kind !== 'app' && r.kind !== 'setting') reveal(r.app, r.id)
    onOpenApp(r.app)
    onClose()
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') setActive((current + 1) % Math.max(flat.length, 1))
    else if (e.key === 'ArrowUp') setActive((current - 1 + flat.length) % Math.max(flat.length, 1))
    else if (e.key === 'Enter' && flat[current]) choose(flat[current])
    else if (launcher && e.altKey && e.key.toLowerCase() === 'p' && flat[current]) launcherStore.togglePin(flat[current])
    else if (browsing && e.key === 'Tab' && !e.shiftKey && e.ctrlKey) setTab(LAUNCHER_TABS[(LAUNCHER_TABS.indexOf(tab) + 1) % LAUNCHER_TABS.length])
    else return
    e.preventDefault()
  }

  const optionId = (r: LauncherRef) => `zoek-${r.kind}-${r.id}`
  const row = (r: LauncherRef) => {
    const selected = flat[current] === r
    return (
      <li
        key={optionId(r)}
        id={optionId(r)}
        role="option"
        aria-selected={selected}
        onPointerMove={() => setActive(flat.indexOf(r))}
        onClick={() => choose(r)}
        className={`cursor-pointer rounded-lg px-2 py-1.5 ${selected ? 'bg-nx-surface-2' : ''}`}
      >
        <span className="block truncate text-sm">
          {launcher && isPinned(saved, r) && <span aria-label="vastgezet">📌 </span>}
          {r.title}
        </span>
        {r.detail && <span className="block truncate text-xs text-nx-muted">{browsing ? `${SEARCH_KIND_LABELS[r.kind]} · ${r.detail}` : r.detail}</span>}
        {!r.detail && browsing && <span className="block truncate text-xs text-nx-muted">{SEARCH_KIND_LABELS[r.kind]}</span>}
      </li>
    )
  }
  const selected = flat[current]

  return (
    <div className="fixed inset-0 z-[20000] flex items-start justify-center bg-black/40 p-3 pt-[10vh]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={launcher ? 'Launcher' : 'Zoeken'} className="nx-glass flex max-h-[75vh] w-full max-w-xl flex-col rounded-xl border border-nx-border">
        {command ? (
          <CommandForm
            command={command}
            onBack={() => setCommand(null)}
            onClose={onClose}
            onDone={(message, open) => {
              setCommand(null)
              if (open) {
                onOpenApp(open)
                onClose()
              } else {
                setStatus(message)
              }
            }}
          />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-nx-border px-3">
              <SearchIcon className="size-5 shrink-0 text-nx-muted" />
              <input
                autoFocus
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls="zoekresultaten"
                aria-activedescendant={selected ? optionId(selected) : undefined}
                aria-label="Zoek overal"
                placeholder={launcher ? 'Zoek, open of typ een opdracht…' : 'Zoek in notities, bestanden, agenda, herinneringen en apps…'}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                  setStatus(null)
                }}
                onKeyDown={onKeyDown}
                className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-nx-muted"
              />
              <kbd className="hidden rounded border border-nx-border px-1.5 text-xs text-nx-muted sm:block">Esc</kbd>
            </div>
            {browsing && (
              <div role="tablist" aria-label="Launcher" className="flex gap-1 border-b border-nx-border px-2 py-1.5">
                {LAUNCHER_TABS.map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-2.5 py-1 text-sm ${tab === t ? 'bg-nx-surface-2 font-medium' : 'text-nx-muted hover:bg-nx-surface-2'}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            {status && (
              <p role="status" className="border-b border-nx-border px-3 py-2 text-sm">
                {status}
              </p>
            )}
            {browsing && flat.length === 0 && (
              <p className="px-4 py-3 text-sm text-nx-muted">
                {tab === 'Recent' ? 'Wat je via de Launcher opent, komt hier.' : tab === 'Vastgezet' ? 'Nog niets vastgezet. Kies een resultaat en druk Alt+P.' : 'Geen opdrachten voor de apps van dit profiel.'}
              </p>
            )}
            <ul id="zoekresultaten" ref={listRef} role="listbox" aria-label="Resultaten" hidden={browsing && flat.length === 0} className="min-h-0 flex-1 overflow-y-auto p-2">
              {browsing && flat.map(row)}
              {!launcher && query.trim() === '' && <li className="px-2 py-3 text-sm text-nx-muted">Typ om te zoeken. Pijltjes kiezen, Enter opent.</li>}
              {query.trim() !== '' && flat.length === 0 && <li className="px-2 py-3 text-sm text-nx-muted">Niets gevonden voor “{query.trim()}”.</li>}
              {!browsing &&
                groups.map(([kind, list]) => (
                  <li key={kind} role="presentation">
                    <p className="px-2 pt-2 pb-1 text-xs font-semibold text-nx-muted">{SEARCH_KIND_LABELS[kind]}</p>
                    <ul role="group" aria-label={SEARCH_KIND_LABELS[kind]}>
                      {list.map(row)}
                    </ul>
                  </li>
                ))}
            </ul>
            {launcher && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-nx-border px-3 py-1.5 text-xs text-nx-muted">
                <span>↑↓ kiezen · Enter openen · Alt+P vastzetten</span>
                <span className="flex gap-1">
                  {selected && (
                    <button type="button" className="rounded-md border border-nx-border px-2 py-0.5 hover:bg-nx-surface-2" onClick={() => launcherStore.togglePin(selected)}>
                      {isPinned(saved, selected) ? 'Losmaken' : 'Vastzetten'}
                    </button>
                  )}
                  {browsing && tab === 'Recent' && saved.recent.length > 0 && (
                    <button type="button" className="rounded-md border border-nx-border px-2 py-0.5 hover:bg-nx-surface-2" onClick={() => launcherStore.clearRecent()}>
                      Recent wissen
                    </button>
                  )}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const localNow = (t: number) => {
  const d = new Date(t)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

/** A command's inputs, the preview of what it will do, and Uitvoeren. */
function CommandForm({ command, onBack, onClose, onDone }: { command: LauncherCommand; onBack: () => void; onClose: () => void; onDone: (message: string, open?: AppId) => void }) {
  const [values, setValues] = useState<CommandValues>(() =>
    Object.fromEntries(command.inputs.map((i) => [i.name, i.type === 'datetime' ? localNow(Date.now() + 60 * 60_000) : i.type === 'choice' ? (i.choices?.[0]?.value ?? '') : ''])),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    const problem = checkCommand(command, values, Date.now())
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      const outcome = await runCommand(command.id, values)
      onDone(outcome.message, outcome.open)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
  return (
    <form
      aria-label={command.label}
      className="space-y-3 p-4 text-sm"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onBack()
        }
      }}
      onSubmit={(e) => {
        e.preventDefault()
        void run()
      }}
    >
      <p className="text-xs text-nx-muted">Opdracht · {command.category}</p>
      <h2 className="text-base font-medium">{command.label}</h2>
      {command.inputs.map((input, i) => (
        <label key={input.name} className="block space-y-1">
          <span>
            {input.label}
            {!input.required && <span className="text-nx-muted"> (optioneel)</span>}
          </span>
          {input.type === 'choice' ? (
            <select autoFocus={i === 0} value={values[input.name]} onChange={(e) => setValues({ ...values, [input.name]: e.target.value })} className={field}>
              {input.choices?.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus={i === 0}
              type={input.type === 'datetime' ? 'datetime-local' : 'text'}
              maxLength={input.max}
              value={values[input.name]}
              onChange={(e) => setValues({ ...values, [input.name]: e.target.value })}
              className={field}
            />
          )}
        </label>
      ))}
      <p className="rounded-md bg-nx-surface-2 p-2" aria-live="polite">
        {previewCommand(command, values)}
      </p>
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" autoFocus={command.inputs.length === 0} disabled={busy} className="rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text disabled:opacity-60">
          {busy ? 'Bezig…' : 'Uitvoeren'}
        </button>
        <button type="button" onClick={onBack} className="rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2">
          Terug
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2">
          Sluiten
        </button>
      </div>
    </form>
  )
}
