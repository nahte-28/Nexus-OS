import { useEffect, useState } from 'react'
import { logEvent } from '../devtools/log'
import { isLinuxApp } from '../platform/desktop'
import { filterLinuxApps, openLinuxApp, store, useLinuxApps, useNexusSession, type StoreApp } from '../platform/session'
import { TerminalIcon } from './icons'

/** The apps installed on this Linux computer; each opens as its own window. */
function OnComputer() {
  const { apps, loading, error, reload } = useLinuxApps()
  const session = useNexusSession()
  const [query, setQuery] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  const shown = filterLinuxApps(apps, query)

  const open = (id: string, name: string) => {
    setFailed(null)
    openLinuxApp(id).then(
      () => logEvent('system', `${name} geopend`),
      (err) => setFailed(String(err)),
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-nx-muted">
        De programma's op deze computer. Ze openen in een eigen venster{session ? ' boven NEXUS; met Alt+Tab wissel je, Super+Spatie brengt NEXUS terug.' : '.'}
      </p>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek een app…"
          aria-label="Zoek een Linux-app"
          className="min-w-0 flex-1 rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-2 outline-none placeholder:text-nx-muted"
        />
        <button type="button" onClick={reload} className="rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2">
          Vernieuwen
        </button>
      </div>
      {failed && <p role="alert" className="text-red-500">{failed}</p>}
      {error && <p role="alert" className="text-red-500">Apps ophalen lukte niet: {error}</p>}
      {loading ? (
        <p className="text-nx-muted">Apps zoeken…</p>
      ) : (
        <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1 overflow-y-auto">
          {shown.map((app) => (
            <li key={app.id}>
              <button
                type="button"
                onClick={() => open(app.id, app.name)}
                title={app.comment || app.name}
                className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-nx-surface-2"
              >
                <TerminalIcon className="shrink-0 text-nx-accent" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{app.name}</span>
                  {app.comment && <span className="block truncate text-xs text-nx-muted">{app.comment}</span>}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="col-span-full text-nx-muted">
              {apps.length === 0 ? 'Geen apps gevonden. Zoek er een in het tabblad Apps installeren.' : 'Geen app met die naam.'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

const button = 'rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2 disabled:opacity-50'

/** Apps from Flathub: search, install, update and remove, for this user without a password. */
function Store() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StoreApp[] | null>(null)
  const [installed, setInstalled] = useState<StoreApp[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const loadInstalled = () => store.installed().then(setInstalled, (e) => setFailed(String(e)))
  useEffect(() => {
    void loadInstalled()
  }, [])

  const run = (what: string, job: () => Promise<unknown>, done: string) => {
    setBusy(what)
    setFailed(null)
    setMessage(null)
    return job()
      .then(() => {
        setMessage(done)
        logEvent('system', done)
        return loadInstalled()
      })
      .catch((e) => setFailed(String(e)))
      .finally(() => setBusy(null))
  }

  const search = () => {
    if (query.trim().length < 2) return
    setBusy('search')
    setFailed(null)
    setMessage(null)
    store
      .search(query)
      .then(setResults, (e) => setFailed(String(e)))
      .finally(() => setBusy(null))
  }

  const isInstalled = (app: StoreApp) => app.installed || installed.some((i) => i.id === app.id)
  const row = (app: StoreApp) => (
    <li key={app.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-nx-surface-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {app.name} {app.version && <span className="text-xs font-normal text-nx-muted">{app.version}</span>}
        </span>
        {app.summary && <span className="block truncate text-xs text-nx-muted">{app.summary}</span>}
      </span>
      {isInstalled(app) ? (
        <button type="button" className={button} disabled={busy !== null} onClick={() => void run(app.id, () => store.remove(app.id), `${app.name} verwijderd`)}>
          {busy === app.id ? 'Bezig…' : 'Verwijderen'}
        </button>
      ) : (
        <button
          type="button"
          className="rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text disabled:opacity-50"
          disabled={busy !== null}
          onClick={() => void run(app.id, () => store.install(app.id), `${app.name} geïnstalleerd`)}
        >
          {busy === app.id ? 'Installeren…' : 'Installeren'}
        </button>
      )}
    </li>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <p className="text-nx-muted">Apps uit Flathub, de grote appwinkel voor Linux. Ze komen alleen voor jou op deze computer en vragen geen wachtwoord. Een geïnstalleerde app staat daarna bij Op deze computer.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          search()
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek in Flathub, bv. Spotify of VLC"
          aria-label="Zoek in Flathub"
          className="min-w-0 flex-1 rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-2 outline-none placeholder:text-nx-muted"
        />
        <button type="submit" className={button} disabled={busy !== null || query.trim().length < 2}>
          {busy === 'search' ? 'Zoeken…' : 'Zoeken'}
        </button>
      </form>
      {busy === 'search' && results === null && <p className="text-nx-muted">De eerste keer haalt NEXUS de lijst van Flathub op; dat duurt even.</p>}
      {busy && busy !== 'search' && busy !== 'update' && <p className="text-nx-muted">Bezig; een grote app kan enkele minuten duren.</p>}
      {message && <p role="status">{message}</p>}
      {failed && <p role="alert" className="text-red-500">{failed}</p>}
      {results && (
        <ul aria-label="Zoekresultaten" className="flex flex-col">
          {results.map(row)}
          {results.length === 0 && <li className="text-nx-muted">Niets gevonden.</li>}
        </ul>
      )}
      <div className="flex items-center justify-between">
        <p className="font-medium">Geïnstalleerd uit Flathub</p>
        {installed.length > 0 && (
          <button
            type="button"
            className={button}
            disabled={busy !== null}
            onClick={() => {
              setBusy('update')
              setFailed(null)
              store
                .updateAll()
                .then((n) => setMessage(n === 0 ? 'Alles is al bijgewerkt.' : `${n} ${n === 1 ? 'app' : 'apps'} bijgewerkt.`), (e) => setFailed(String(e)))
                .finally(() => setBusy(null))
            }}
          >
            {busy === 'update' ? 'Bijwerken…' : 'Alles bijwerken'}
          </button>
        )}
      </div>
      <ul aria-label="Geïnstalleerd" className="flex flex-col">
        {installed.map(row)}
        {installed.length === 0 && <li className="text-nx-muted">Nog niets.</li>}
      </ul>
    </div>
  )
}

const TABS = ['Op deze computer', 'Apps installeren'] as const

export function LinuxApps() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Op deze computer')
  if (!isLinuxApp) return <p className="p-4 text-sm text-nx-muted">Linux-apps zie je alleen in de Linux-app van NEXUS.</p>
  return (
    <div className="flex h-full flex-col gap-3 p-4 text-sm">
      <div role="tablist" aria-label="Linux-apps" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'text-nx-muted hover:bg-nx-surface-2'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Op deze computer' ? <OnComputer /> : <Store />}
    </div>
  )
}
