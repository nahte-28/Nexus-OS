import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { FINANCE_ACTIONS, SEARCH_KIND_LABELS, searchAll, type AppId, type SearchResult } from '@nexus/core'
import { useVisibleApps } from '../apps/registry'
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

/** Zoeken overal: one box over apps, notes, files, the agenda and reminders. */
export function SearchPalette({ onClose, onOpenApp }: { onClose: () => void; onOpenApp: (id: AppId) => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const apps = useVisibleApps()
  const { notes } = useNotes()
  const files = useSyncExternalStore(filesStore.subscribe, filesStore.getSnapshot)
  const life = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)

  const results = useMemo(
    () =>
      searchAll(query, {
        apps: apps.map((a) => ({ id: a.id, title: a.title })),
        notes,
        files,
        life,
        reminders,
        // Shortcuts only for apps this profile shows.
        actions: apps.some((a) => a.id === 'finance') ? FINANCE_ACTIONS.map((a) => ({ ...a, app: 'finance' as const })) : [],
      }),
    [query, apps, notes, files, life, reminders],
  )
  // Group by kind in the order the best match of each kind came in.
  const groups = useMemo(() => {
    const map = new Map<SearchResult['kind'], SearchResult[]>()
    for (const r of results) map.set(r.kind, [...(map.get(r.kind) ?? []), r])
    return [...map.entries()]
  }, [results])
  const flat = groups.flatMap(([, list]) => list)
  const current = Math.min(active, Math.max(flat.length - 1, 0))

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [current, query])

  const choose = (r: SearchResult) => {
    if (r.kind !== 'app') reveal(r.app, r.id)
    onOpenApp(r.app)
    onClose()
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') setActive((current + 1) % Math.max(flat.length, 1))
    else if (e.key === 'ArrowUp') setActive((current - 1 + flat.length) % Math.max(flat.length, 1))
    else if (e.key === 'Enter' && flat[current]) choose(flat[current])
    else return
    e.preventDefault()
  }

  const optionId = (r: SearchResult) => `zoek-${r.kind}-${r.id}`
  return (
    <div className="fixed inset-0 z-[20000] flex items-start justify-center bg-black/40 p-3 pt-[10vh]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Zoeken" className="nx-glass flex max-h-[75vh] w-full max-w-xl flex-col rounded-xl border border-nx-border">
        <div className="flex items-center gap-2 border-b border-nx-border px-3">
          <SearchIcon className="size-5 shrink-0 text-nx-muted" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="zoekresultaten"
            aria-activedescendant={flat[current] ? optionId(flat[current]) : undefined}
            aria-label="Zoek overal"
            placeholder="Zoek in notities, bestanden, agenda, herinneringen en apps…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-nx-muted"
          />
          <kbd className="hidden rounded border border-nx-border px-1.5 text-xs text-nx-muted sm:block">Esc</kbd>
        </div>
        <ul id="zoekresultaten" ref={listRef} role="listbox" aria-label="Resultaten" className="min-h-0 flex-1 overflow-y-auto p-2">
          {query.trim() === '' && <li className="px-2 py-3 text-sm text-nx-muted">Typ om te zoeken. Pijltjes kiezen, Enter opent.</li>}
          {query.trim() !== '' && flat.length === 0 && <li className="px-2 py-3 text-sm text-nx-muted">Niets gevonden voor “{query.trim()}”.</li>}
          {groups.map(([kind, list]) => (
            <li key={kind} role="presentation">
              <p className="px-2 pt-2 pb-1 text-xs font-semibold text-nx-muted">{SEARCH_KIND_LABELS[kind]}</p>
              <ul role="group" aria-label={SEARCH_KIND_LABELS[kind]}>
                {list.map((r) => {
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
                      <span className="block truncate text-sm">{r.title}</span>
                      {r.detail && <span className="block truncate text-xs text-nx-muted">{r.detail}</span>}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
