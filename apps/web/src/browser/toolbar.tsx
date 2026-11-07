import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { emptyBrowser, hostOf, parseProfilesState, resolveInput, SEARCH_ENGINES, type BrowserSettings } from '@nexus/core'
import '../index.css'
import { browserCommands, type BrowserTabs } from './bridge'

const icon = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-nx-surface-2 disabled:opacity-40'

/** Your bookmarks and search engine as the main window last saved them (same storage). */
function readBrowser(): BrowserSettings {
  try {
    const raw = localStorage.getItem('nexus.profiles')
    return raw ? parseProfilesState(JSON.parse(raw)).browser : emptyBrowser()
  } catch {
    return emptyBrowser()
  }
}

export function Toolbar() {
  const [tabs, setTabs] = useState<BrowserTabs>({ tabs: [], active: null })
  const [browser, setBrowser] = useState(readBrowser)
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)
  const [newTab, setNewTab] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const active = tabs.tabs.find((t) => t.id === tabs.active) ?? null

  useEffect(() => {
    let off: (() => void) | undefined
    void browserCommands.tabs().then(setTabs)
    void import('@tauri-apps/api/event').then(({ listen }) => listen<BrowserTabs>('browser-tabs', (e) => setTabs(e.payload)).then((u) => (off = u)))
    const refresh = () => setBrowser(readBrowser())
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      off?.()
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  useEffect(() => {
    if (!editing) setAddress(active?.url ?? '')
  }, [active?.url, editing])

  const run = (p: Promise<unknown>) => p.then(() => setError(null)).catch((err) => setError(String(err)))
  const go = (url: string) => run(newTab || !active ? browserCommands.open(url) : browserCommands.navigate(url))
  const saved = active ? browser.bookmarks.some((b) => b.url === active.url) : false

  return (
    <div className="flex h-screen flex-col gap-1 border-b border-nx-border bg-nx-surface px-2 pt-1 text-sm text-nx-text">
      <div role="tablist" aria-label="Tabbladen" className="flex min-w-0 items-end gap-1 overflow-x-auto">
        {tabs.tabs.map((t) => (
          <div key={t.id} className={`flex min-w-0 max-w-52 items-center gap-1 rounded-t-md border border-b-0 px-2 py-1 ${t.id === tabs.active ? 'border-nx-border bg-nx-bg' : 'border-transparent opacity-80 hover:bg-nx-surface-2'}`}>
            <button role="tab" type="button" aria-selected={t.id === tabs.active} className="min-w-0 flex-1 truncate text-left" title={t.title || t.url} onClick={() => run(browserCommands.select(t.id))}>
              {t.loading ? '⏳ ' : ''}
              {t.title || hostOf(t.url)}
            </button>
            <button type="button" className="rounded px-1 text-xs hover:bg-nx-surface-2" aria-label={`${t.title || hostOf(t.url)} sluiten`} onClick={() => run(browserCommands.close(t.id))}>
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className={icon}
          aria-label="Nieuw tabblad"
          onClick={() => {
            setNewTab(true)
            setEditing(true)
            setAddress('')
            input.current?.focus()
          }}
        >
          +
        </button>
      </div>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          const url = resolveInput(address, browser.engine)
          if (!url) return
          void go(url)
          setEditing(false)
          setNewTab(false)
          input.current?.blur()
        }}
      >
        <button type="button" className={icon} aria-label="Terug" disabled={!active} onClick={() => run(browserCommands.go('back'))}>
          ←
        </button>
        <button type="button" className={icon} aria-label="Vooruit" disabled={!active} onClick={() => run(browserCommands.go('forward'))}>
          →
        </button>
        <button type="button" className={icon} aria-label="Opnieuw laden" disabled={!active} onClick={() => run(browserCommands.go('reload'))}>
          ⟳
        </button>
        <input
          ref={input}
          aria-label="Adres of zoekterm"
          className="min-w-0 flex-1 rounded-full border border-nx-border bg-nx-bg px-3 py-1 outline-none focus:border-nx-accent"
          value={address}
          placeholder={newTab ? `Nieuw tabblad: zoek met ${SEARCH_ENGINES[browser.engine].name} of typ een adres` : `Zoek met ${SEARCH_ENGINES[browser.engine].name} of typ een adres`}
          onFocus={(e) => {
            setEditing(true)
            e.currentTarget.select()
          }}
          onBlur={() => {
            setEditing(false)
            setNewTab(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur()
          }}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button
          type="button"
          className={icon}
          aria-label={saved ? 'Staat bij je bladwijzers' : 'Bladwijzer toevoegen'}
          disabled={!active || saved}
          onClick={() => active && run(browserCommands.bookmark(active.url, active.title).then(() => setTimeout(() => setBrowser(readBrowser()), 300)))}
        >
          {saved ? '★' : '☆'}
        </button>
      </form>
      <div aria-label="Bladwijzerbalk" className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 text-xs">
        {error ? (
          <span role="alert" className="text-red-500">
            {error}
          </span>
        ) : browser.bookmarks.length === 0 ? (
          <span className="text-nx-muted">Bladwijzers die je met ☆ bewaart, komen hier en in de Browser-app.</span>
        ) : (
          browser.bookmarks.slice(0, 30).map((b) => (
            <button key={b.id} type="button" className="max-w-40 shrink-0 truncate rounded px-2 py-0.5 hover:bg-nx-surface-2" title={b.url} onClick={() => void go(b.url)}>
              {b.title}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// Same theme as the main window (written there to nexus.theme).
document.documentElement.dataset.theme = localStorage.getItem('nexus.theme') ?? 'pulse'
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Toolbar />
    </StrictMode>,
  )
}
