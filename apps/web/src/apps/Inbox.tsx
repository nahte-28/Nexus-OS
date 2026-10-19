import { useEffect, useMemo, useState } from 'react'
import { filterInbox, inboxApps } from '@nexus/core'
import { useConnect } from '../connect/ConnectContext'

function timeText(ms: number): string {
  const date = new Date(ms)
  const today = new Date().toDateString() === date.toDateString()
  return today
    ? date.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })
}

/** NEXUS Connect notification center: what your other devices forwarded, kept only on this device. */
export function Inbox() {
  const { engine, state } = useConnect()
  const [app, setApp] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const apps = useMemo(() => inboxApps(state.inbox), [state.inbox])
  const items = useMemo(() => filterInbox(state.inbox, { app, query }), [state.inbox, app, query])
  const deviceNames = new Map(state.devices.map((d) => [d.id, d.name]))

  // Opening the center counts as seeing what's there.
  useEffect(() => {
    if (state.unread > 0) void engine.markAllRead()
  }, [engine, state.unread])

  return (
    <div className="flex h-full min-h-0 flex-col sm:flex-row">
      <aside className="flex flex-col gap-2 border-b border-nx-border p-3 sm:w-52 sm:border-r sm:border-b-0">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoeken"
          aria-label="Meldingen zoeken"
          className="w-full min-w-0 rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-1.5 text-sm outline-none placeholder:text-nx-muted"
        />
        <nav aria-label="Filter op app" className="flex gap-1 overflow-x-auto sm:flex-col">
          {[{ app: null, appName: 'Alle apps', count: state.inbox.length }, ...apps].map((a) => (
            <button
              key={a.app ?? 'all'}
              type="button"
              aria-pressed={app === a.app}
              onClick={() => setApp(a.app)}
              className={`flex shrink-0 justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                app === a.app ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'
              }`}
            >
              <span className="truncate">{a.appName}</span>
              <span className="text-nx-muted tabular-nums">{a.count}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-nx-border px-3 py-2">
          <h2 className="text-sm font-semibold text-nx-muted">Meldingen</h2>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => void engine.removeFromInbox(items.map((i) => i.id))}
              className="rounded-md px-2 py-1 text-sm text-nx-muted hover:bg-nx-surface-2"
            >
              {app || query ? 'Deze wissen' : 'Alles wissen'}
            </button>
          )}
        </div>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-label="Meldingen">
          {items.length === 0 && (
            <li className="p-4 text-center text-sm text-nx-muted">
              {state.inbox.length > 0
                ? 'Geen meldingen die hierbij passen.'
                : state.status === 'ready'
                  ? 'Nog geen meldingen. Stuur een testmelding vanuit Apparaten, of koppel de Android companion.'
                  : 'Koppel dit apparaat in Apparaten om meldingen van je andere apparaten te ontvangen.'}
            </li>
          )}
          {items.map((item) => (
            <li key={item.id} className="group rounded-lg border border-nx-border bg-nx-surface-2 p-3 text-sm">
              <div className="flex items-baseline gap-2 text-xs text-nx-muted">
                <span className="font-medium text-nx-accent">{item.appName}</span>
                <span>{deviceNames.get(item.fromDeviceId) ?? 'Onbekend apparaat'}</span>
                <time className="ml-auto tabular-nums" dateTime={new Date(item.postedAt).toISOString()}>
                  {timeText(item.postedAt)}
                </time>
                <button
                  type="button"
                  aria-label={`Melding ${item.title} wissen`}
                  onClick={() => void engine.removeFromInbox([item.id])}
                  className="rounded px-1 hover:bg-nx-surface"
                >
                  ×
                </button>
              </div>
              <p className="mt-1 font-medium">{item.title}</p>
              {item.text && <p className="whitespace-pre-line text-nx-muted">{item.text}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
