import { useState, useSyncExternalStore } from 'react'
import { INBOX_SOURCES, inboxView, snoozeTimes, unreadCount, type EventPriority, type EventSource, type InboxEntry, type InboxView } from '@nexus/core'
import { inboxStore, inboxSyncProblem, useInbox, useInboxPolicy } from '../inbox/store'
import { openApp } from '../shell/openApp'
import { readStorage, writeStorage } from '../state/storage'
import { useNow } from '../state/useNow'

const TABS: Array<{ id: InboxView; title: string }> = [
  { id: 'inbox', title: 'Inbox' },
  { id: 'priority', title: 'Prioriteit' },
  { id: 'scheduled', title: 'Gepland' },
  { id: 'archive', title: 'Archief' },
]
const TAB_KEY = 'nexus.inbox.tab'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const select = 'rounded-md border border-nx-border bg-nx-surface px-2 py-1 text-xs'
const sourceTitle = (s: EventSource) => INBOX_SOURCES.find((x) => x.source === s)?.title ?? s
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Universal Inbox: everything NEXUS reports, with read, archive and snooze, synced across devices. */
export function UniversalInbox() {
  const items = useInbox()
  const now = useNow(30_000)
  const problem = useSyncExternalStore(inboxSyncProblem.subscribe, inboxSyncProblem.getSnapshot)
  const [tab, setTabState] = useState<InboxView>(() => (TABS.some((t) => t.id === readStorage(TAB_KEY)) ? (readStorage(TAB_KEY) as InboxView) : 'inbox'))
  const [source, setSource] = useState<EventSource | ''>('')
  const [priority, setPriority] = useState<EventPriority | ''>('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [device, setDevice] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState('')

  const setTab = (t: InboxView) => {
    setTabState(t)
    setPicked(new Set())
    writeStorage(TAB_KEY, t)
  }
  const shown = inboxView(items, tab, now, { source: source || null, priority: priority || null, unreadOnly, deviceId: device || null })
  const devices = [...new Set(items.map((i) => i.deviceId).filter((d): d is string => !!d))]
  const ids = shown.filter((i) => picked.has(i.id)).map((i) => i.id)
  const act = (change: Parameters<typeof inboxStore.change>[1], done: string, which = ids) => {
    inboxStore.change(which, change)
    setPicked(new Set())
    setStatus(`${which.length} ${which.length === 1 ? 'item' : 'items'} ${done}.`)
  }
  const openItem = (item: InboxEntry) => {
    inboxStore.change([item.id], { read: true })
    if (item.link) openApp(item.link.app, item.link.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Inbox" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {TABS.map((t) => {
          const count = t.id === 'inbox' ? unreadCount(items, now) : inboxView(items, t.id, now).length
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-md px-3 py-1 ${tab === t.id ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
            >
              {t.title}
              {count > 0 && <span className="ml-1 text-xs text-nx-muted">{count}</span>}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-nx-border px-3 py-2">
        <select aria-label="Bron" value={source} onChange={(e) => setSource(e.target.value as EventSource | '')} className={select}>
          <option value="">Alle bronnen</option>
          {INBOX_SOURCES.map((s) => (
            <option key={s.source} value={s.source}>
              {s.title}
            </option>
          ))}
        </select>
        <select aria-label="Prioriteit" value={priority} onChange={(e) => setPriority(e.target.value as EventPriority | '')} className={select}>
          <option value="">Elke prioriteit</option>
          <option value="high">Hoog</option>
          <option value="normal">Normaal</option>
          <option value="low">Laag</option>
        </select>
        {devices.length > 0 && (
          <select aria-label="Apparaat" value={device} onChange={(e) => setDevice(e.target.value)} className={select}>
            <option value="">Alle apparaten</option>
            {devices.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="accent-[var(--nx-accent)]" />
          Alleen ongelezen
        </label>
      </div>
      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              aria-label="Alles selecteren"
              checked={ids.length === shown.length}
              onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((i) => i.id)) : new Set())}
              className="accent-[var(--nx-accent)]"
            />
            Alles
          </label>
          <button type="button" className={small} disabled={ids.length === 0} onClick={() => act({ read: true }, 'gelezen')}>
            Gelezen
          </button>
          {tab === 'archive' ? (
            <button type="button" className={small} disabled={ids.length === 0} onClick={() => act({ archived: false }, 'teruggezet')}>
              Terugzetten
            </button>
          ) : (
            <button type="button" className={small} disabled={ids.length === 0} onClick={() => act({ archived: true, read: true }, 'gearchiveerd')}>
              Archiveren
            </button>
          )}
          {tab === 'scheduled' ? (
            <button type="button" className={small} disabled={ids.length === 0} onClick={() => act({ snoozedUntil: null }, 'terug in de Inbox')}>
              Nu tonen
            </button>
          ) : (
            tab !== 'archive' && (
              <select
                aria-label="Snoozen"
                value=""
                disabled={ids.length === 0}
                onChange={(e) => e.target.value && act({ snoozedUntil: Number(e.target.value) }, 'gesnoozed')}
                className={select}
              >
                <option value="">Snoozen…</option>
                {snoozeTimes(now).map((t) => (
                  <option key={t.label} value={t.until}>
                    {t.label}
                  </option>
                ))}
              </select>
            )
          )}
        </div>
      )}
      <p role="status" className="sr-only">
        {status}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {problem && (
          <p role="alert" className="mb-2 rounded-md border border-nx-border p-2 text-nx-muted">
            {problem.startsWith('setup:')
              ? `De Inbox syncen heeft nog een stap in de database nodig: voer ${problem.slice(6).split('/').pop()} uit in de SQL Editor van Supabase. Op dit toestel werkt ze al.`
              : `De Inbox syncen lukte niet: ${problem}`}
          </p>
        )}
        {shown.length === 0 ? (
          <p className="py-6 text-center text-nx-muted">
            {tab === 'inbox' ? 'Niets nieuws. Hier komen flows, updates en deadlines binnen.' : tab === 'priority' ? 'Niets dringends.' : tab === 'scheduled' ? 'Niets gesnoozed.' : 'Het archief is leeg.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {shown.map((item) => (
              <li key={item.id} className={`flex items-start gap-2 rounded-lg border border-nx-border p-2 ${item.readAt === null ? 'bg-nx-surface-2' : ''}`}>
                <input
                  type="checkbox"
                  aria-label={`${item.title} selecteren`}
                  checked={picked.has(item.id)}
                  onChange={(e) =>
                    setPicked((p) => {
                      const next = new Set(p)
                      if (e.target.checked) next.add(item.id)
                      else next.delete(item.id)
                      return next
                    })
                  }
                  className="mt-1 accent-[var(--nx-accent)]"
                />
                <button type="button" onClick={() => openItem(item)} className="min-w-0 flex-1 text-left">
                  <span className={`block ${item.readAt === null ? 'font-medium' : ''}`}>
                    {item.priority === 'high' && <span className="mr-1 text-nx-accent">●</span>}
                    {item.title}
                  </span>
                  {item.body && <span className="block truncate text-nx-muted">{item.body}</span>}
                  <span className="block text-xs text-nx-muted">
                    {sourceTitle(item.source)} · {when(item.at)}
                    {item.snoozedUntil && item.snoozedUntil > now ? ` · terug op ${when(item.snoozedUntil)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Sources />
      </div>
    </div>
  )
}

/** notification_preferences: which sources may reach the Inbox on this device. */
function Sources() {
  const policy = useInboxPolicy()
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-nx-muted">Wat in de Inbox komt</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {INBOX_SOURCES.map((s) => (
          <li key={s.source}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={policy[s.source] !== false}
                onChange={(e) => inboxStore.setPolicy({ ...policy, [s.source]: e.target.checked })}
                className="accent-[var(--nx-accent)]"
              />
              {s.title}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-nx-muted">Geldt voor nieuwe meldingen op dit toestel. Berichten van andere apps op je gsm komen hier nooit in.</p>
    </details>
  )
}
