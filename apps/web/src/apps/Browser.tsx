import { useState } from 'react'
import { searchHistory, bookmarkGroups, deleteBookmark, hostOf, moveBookmark, resolveInput, saveBookmark, SEARCH_ENGINES, type Bookmark, type BrowserSettings, type SearchEngine } from '@nexus/core'
import { openInNexusBrowser } from '../browser/bridge'
import { browserHistory, useBrowserHistory } from '../browser/history'
import { isDesktopApp, openWebApp } from '../platform/desktop'
import { profilesStore, useProfiles } from '../profiles/store'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const setBrowser = (change: (b: BrowserSettings) => BrowserSettings) => profilesStore.update((s) => ({ ...s, browser: change(s.browser) }))

/** Opens a site: in the Windows app in the NEXUS Browser window, elsewhere in a new tab of your browser. */
export const openSite = (url: string) => void (isDesktopApp ? openInNexusBrowser(url) : openWebApp(url))

function Letter({ title }: { title: string }) {
  const letter = (title.trim()[0] ?? '?').toUpperCase()
  return (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-nx-surface-2 text-base font-semibold">
      {letter}
    </span>
  )
}

function BookmarkForm({ editing, folders, onDone }: { editing: Bookmark | null; folders: string[]; onDone: () => void }) {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [url, setUrl] = useState(editing?.url ?? '')
  const [folder, setFolder] = useState(editing?.folder ?? '')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      aria-label={editing ? 'Bladwijzer aanpassen' : 'Nieuwe bladwijzer'}
      className="space-y-2 rounded-lg border border-nx-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        const { state } = profilesStore.getSnapshot()
        const next = saveBookmark(state.browser, { id: editing?.id ?? crypto.randomUUID(), title, url, folder }, Date.now())
        if ('error' in next) return setError(next.error)
        setBrowser(() => next)
        onDone()
      }}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-2">
          Adres
          <input className={field} value={url} placeholder="bv. vrt.be/nws" onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Naam
          <input className={field} value={title} maxLength={80} placeholder="mag leeg" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-3">
          Map
          <input className={field} value={folder} maxLength={40} list="nexus-bookmark-folders" placeholder="mag leeg, bv. School" onChange={(e) => setFolder(e.target.value)} />
          <datalist id="nexus-bookmark-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton}>
          {editing ? 'Opslaan' : 'Toevoegen'}
        </button>
        <button type="button" className={button} onClick={onDone}>
          Annuleren
        </button>
      </div>
    </form>
  )
}

export function Browser() {
  const { state } = useProfiles()
  const browser = state.browser
  const [input, setInput] = useState('')
  const [filter, setFilter] = useState('')
  const [form, setForm] = useState<{ editing: Bookmark | null } | null>(null)
  const [editMode, setEditMode] = useState(false)
  const groups = bookmarkGroups(browser.bookmarks, filter)
  const folders = [...new Set(browser.bookmarks.map((b) => b.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'))
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 text-sm">
      <form
        role="search"
        aria-label="Zoeken of adres"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const url = resolveInput(input, browser.engine)
          if (!url) return
          openSite(url)
          setInput('')
        }}
      >
        <input aria-label="Zoek of typ een adres" className={`${field} text-base`} value={input} placeholder={`Zoek met ${SEARCH_ENGINES[browser.engine].name} of typ een adres`} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className={primaryButton} disabled={!input.trim()}>
          Ga
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">Bladwijzers</h3>
        {browser.bookmarks.length > 6 && <input aria-label="Bladwijzers filteren" className={`${field} w-40`} value={filter} placeholder="Filteren" onChange={(e) => setFilter(e.target.value)} />}
        <div className="ml-auto flex gap-2">
          {browser.bookmarks.length > 0 && (
            <button type="button" className={small} aria-pressed={editMode} onClick={() => setEditMode(!editMode)}>
              {editMode ? 'Klaar' : 'Bewerken'}
            </button>
          )}
          <button type="button" className={small} onClick={() => setForm({ editing: null })}>
            + Bladwijzer
          </button>
        </div>
      </div>

      {form && <BookmarkForm key={form.editing?.id ?? 'nieuw'} editing={form.editing} folders={folders} onDone={() => setForm(null)} />}

      {browser.bookmarks.length === 0 ? (
        <p className="text-nx-muted">Nog geen bladwijzers. Voeg je favoriete sites toe, dan staan ze hier op elk toestel.</p>
      ) : groups.length === 0 ? (
        <p className="text-nx-muted">Geen bladwijzer gevonden.</p>
      ) : (
        groups.map((g) => (
          <section key={g.folder || '-'} aria-label={g.folder || 'Zonder map'} className="space-y-2">
            {g.folder && <h4 className="text-xs font-medium uppercase tracking-wide text-nx-muted">{g.folder}</h4>}
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((b) => (
                <li key={b.id} className="flex items-center gap-2 rounded-lg border border-nx-border p-2">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => openSite(b.url)} title={b.url}>
                    <Letter title={b.title} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{b.title}</span>
                      <span className="block truncate text-xs text-nx-muted">{hostOf(b.url)}</span>
                    </span>
                  </button>
                  {editMode && (
                    <span className="flex shrink-0 gap-1">
                      <button type="button" className={small} aria-label={`${b.title} omhoog`} onClick={() => setBrowser((s) => moveBookmark(s, b.id, -1))}>
                        ↑
                      </button>
                      <button type="button" className={small} aria-label={`${b.title} omlaag`} onClick={() => setBrowser((s) => moveBookmark(s, b.id, 1))}>
                        ↓
                      </button>
                      <button type="button" className={small} aria-label={`${b.title} aanpassen`} onClick={() => setForm({ editing: b })}>
                        ✎
                      </button>
                      <button type="button" className={small} aria-label={`${b.title} verwijderen`} onClick={() => setBrowser((s) => deleteBookmark(s, b.id))}>
                        ✕
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {isDesktopApp && <History />}

      <label className="mt-auto flex items-center gap-2 text-nx-muted">
        Zoekmachine
        <select className={`${field} w-auto`} value={browser.engine} onChange={(e) => setBrowser((s) => ({ ...s, engine: e.target.value as SearchEngine }))}>
          {Object.entries(SEARCH_ENGINES).map(([id, e]) => (
            <option key={id} value={id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

const time = (at: number) => new Date(at).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** What you visited in the NEXUS Browser window: only on this pc, never synced. */
function History() {
  const history = useBrowserHistory()
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  const found = searchHistory(history, query)
  const shown = all ? found : found.slice(0, 15)
  return (
    <section aria-labelledby="browser-history" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="browser-history" className="font-medium">
          Geschiedenis
        </h3>
        {history.length > 0 && (
          <>
            <input aria-label="Geschiedenis doorzoeken" className={`${field} w-40`} value={query} placeholder="Zoeken" onChange={(e) => setQuery(e.target.value)} />
            <button type="button" className={`${small} ml-auto`} onClick={() => browserHistory.clear()}>
              Geschiedenis wissen
            </button>
          </>
        )}
      </div>
      {history.length === 0 ? (
        <p className="text-nx-muted">Pagina's die je in het NEXUS-browservenster opent, komen hier. Ze blijven op deze pc.</p>
      ) : found.length === 0 ? (
        <p className="text-nx-muted">Niets gevonden.</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((v) => (
            <li key={`${v.at}-${v.url}`} className="flex items-center gap-2">
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" title={v.url} onClick={() => openSite(v.url)}>
                {v.title || hostOf(v.url)} <span className="text-nx-muted">· {hostOf(v.url)}</span>
              </button>
              <span className="shrink-0 text-xs text-nx-muted">{time(v.at)}</span>
              <button type="button" className={small} aria-label={`${v.title || hostOf(v.url)} uit de geschiedenis halen`} onClick={() => browserHistory.forget(v)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {found.length > shown.length && (
        <button type="button" className={small} onClick={() => setAll(true)}>
          Alles tonen ({found.length})
        </button>
      )}
    </section>
  )
}
