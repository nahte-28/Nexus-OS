import { useState } from 'react'
import { logEvent } from '../devtools/log'
import { isLinuxApp } from '../platform/desktop'
import { filterLinuxApps, openLinuxApp, useLinuxApps, useNexusSession } from '../platform/session'
import { TerminalIcon } from './icons'

/** The apps installed on this Linux computer; each opens as its own window. */
export function LinuxApps() {
  const { apps, loading, error, reload } = useLinuxApps()
  const session = useNexusSession()
  const [query, setQuery] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  if (!isLinuxApp) return <p className="p-4 text-sm text-nx-muted">Linux-apps zie je alleen in de Linux-app van NEXUS.</p>
  const shown = filterLinuxApps(apps, query)

  const open = (id: string, name: string) => {
    setFailed(null)
    openLinuxApp(id).then(
      () => logEvent('system', `${name} geopend`),
      (err) => setFailed(String(err)),
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-sm">
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
              {apps.length === 0 ? 'Geen apps gevonden. Installeer er een met apt, bv. sudo apt install firefox-esr.' : 'Geen app met die naam.'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
