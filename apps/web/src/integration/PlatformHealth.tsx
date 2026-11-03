import { eventChains, eventCounts, moduleStatus, platformHealth, registryProblems, type HealthLevel } from '@nexus/core'
import { APPS } from '../apps/registry'
import { useEvents } from '../events/bus'
import { useFeatureSwitches } from '../features/store'
import { useOffline } from '../offline/channels'
import { openApp } from '../shell/openApp'
import { useOnline } from '../shell/OfflineBanner'
import { useNow } from '../state/useNow'
import { useSync } from '../sync/SyncContext'

const LEVEL: Record<HealthLevel, { dot: string; label: string }> = {
  ok: { dot: 'bg-emerald-500', label: 'In orde' },
  warn: { dot: 'bg-amber-500', label: 'Let op' },
  bad: { dot: 'bg-red-500', label: 'Probleem' },
}
const moment = (t: number) => new Date(t).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Bytes NEXUS keeps in localStorage (two per character, as browsers count it). */
function storageBytes(): number {
  try {
    let n = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? ''
      n += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2
    }
    return n
  } catch {
    return 0
  }
}

/** Platform Health (Developer Hub): how NEXUS itself is doing, on this device. */
export function PlatformHealth() {
  const now = useNow(30_000)
  const online = useOnline()
  const { state: sync } = useSync()
  const { channels } = useOffline()
  const events = useEvents()
  const switches = useFeatureSwitches()
  const modules = moduleStatus(switches)
  const problems = registryProblems(APPS)
  const counts = eventCounts(events, now)
  const chains = eventChains(events).slice(0, 8)
  const checks = platformHealth({
    online,
    signedIn: sync.email !== null,
    channels,
    registryProblems: problems,
    missingUses: modules.filter((m) => m.on && m.missingUses.length).map((m) => ({ title: m.title, missing: m.missingUses.map((u) => modules.find((x) => x.manifest.feature === u)?.title ?? u) })),
    storageBytes: storageBytes(),
    highEvents: counts.reduce((n, c) => n + c.high, 0),
  })

  return (
    <div className="space-y-4">
      <p className="text-nx-muted">Hoe NEXUS er op dit apparaat voor staat. Alles hier wordt ter plaatse berekend; er gaat niets naar een server.</p>
      <section aria-label="Controles" className="space-y-1">
        <h3 className="font-medium">Controles</h3>
        <ul className="space-y-1">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-md border border-nx-border px-3 py-2">
              <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${LEVEL[c.level].dot}`} />
              <span className="min-w-0">
                <span className="block">
                  {c.title} <span className="text-xs text-nx-muted">· {LEVEL[c.level].label}</span>
                </span>
                <span className="block break-words text-xs text-nx-muted">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Moduleregister" className="space-y-1">
        <h3 className="font-medium">Moduleregister</h3>
        <ul className="grid gap-1 sm:grid-cols-2">
          {modules.map((m) => {
            const data = [...m.manifest.docKeys.map((k) => `sync: ${k}`), ...m.manifest.tables.map((t) => `tabel: ${t}`), ...m.manifest.localKeys.map(() => 'op dit apparaat')]
            return (
              <li key={m.manifest.feature} className="rounded-md border border-nx-border px-3 py-2">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{m.title}</span>
                  <span className="text-xs text-nx-muted">
                    {m.on ? 'aan' : 'uit'} · v{m.manifest.version}
                  </span>
                </span>
                <span className="block text-xs text-nx-muted">{[...new Set(data)].join(', ') || 'Geen eigen gegevens'}</span>
                {m.manifest.schema && <span className="block break-all text-xs text-nx-muted">SQL: {m.manifest.schema}</span>}
                {m.on && m.missingUses.length > 0 && <span className="block text-xs text-amber-700 dark:text-amber-400">Werkt beter met: {m.missingUses.map((u) => modules.find((x) => x.manifest.feature === u)?.title ?? u).join(', ')}</span>}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-label="Gebeurtenissen" className="space-y-2">
        <h3 className="font-medium">Gebeurtenissen (24 uur)</h3>
        {counts.length === 0 ? (
          <p className="text-nx-muted">Geen gebeurtenissen in de laatste 24 uur.</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {counts.map((c) => (
              <li key={c.source} className="rounded-md border border-nx-border px-2 py-1 text-xs">
                {c.source}: {c.count}
                {c.high > 0 && <span className="text-red-600 dark:text-red-400"> ({c.high} hoog)</span>}
              </li>
            ))}
          </ul>
        )}
        <h4 className="text-xs font-medium text-nx-muted">Ketens: gebeurtenissen over hetzelfde (correlation_id)</h4>
        {chains.length === 0 ? (
          <p className="text-nx-muted">Nog geen ketens.</p>
        ) : (
          <ul className="space-y-1">
            {chains.map((c) => {
              const link = c.events.at(-1)?.link
              return (
                <li key={c.correlationId} className="rounded-md border border-nx-border px-3 py-2">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <code className="break-all font-mono text-xs">{c.correlationId}</code>
                    {link && (
                      <button type="button" className="rounded-md border border-nx-border px-2 py-0.5 text-xs hover:bg-nx-surface-2" onClick={() => openApp(link.app, link.id)}>
                        Openen
                      </button>
                    )}
                  </span>
                  <ol className="mt-1 space-y-0.5 text-xs text-nx-muted">
                    {c.events.map((e) => (
                      <li key={e.id}>
                        {moment(e.at)} · {e.title}
                      </li>
                    ))}
                  </ol>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
