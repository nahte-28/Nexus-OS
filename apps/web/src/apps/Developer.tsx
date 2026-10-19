import { useState, useSyncExternalStore } from 'react'
import { assistant } from '../ai/runtime'
import { forgetAlwaysAllowed } from '../ai/session'
import { useConnect } from '../connect/ConnectContext'
import { clearLog, useLog, type LogSource } from '../devtools/log'
import { apiBase, isDesktopApp } from '../platform/desktop'
import { remindersStore } from '../reminders/store'
import { useSync } from '../sync/SyncContext'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2'
const TABS = ['Systeem', 'Logboek', 'AI'] as const
const SOURCES: Array<LogSource | 'all'> = ['all', 'ai', 'reminders', 'connect', 'sync', 'system']

/** Developer tools: what NEXUS is doing, for debugging. Never shows note or message content. */
export function Developer() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Systeem')
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" className="flex gap-1 border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'Systeem' && <SystemTab />}
        {tab === 'Logboek' && <LogTab />}
        {tab === 'AI' && <AiTab />}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 border-b border-nx-border py-1.5">
      <dt className="text-nx-muted">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-xs">{value}</dd>
    </div>
  )
}

function SystemTab() {
  const { state: sync } = useSync()
  const { state: connect } = useConnect()
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  return (
    <dl>
      <Row label="Versie" value={`NEXUS OS ${__APP_VERSION__}`} />
      <Row label="Omgeving" value={isDesktopApp ? 'Windows-app (Tauri)' : `Browser · ${navigator.userAgent}`} />
      <Row label="Server" value={apiBase || window.location.origin} />
      <Row label="Online" value={navigator.onLine ? 'ja' : 'nee'} />
      <Row label="Sync" value={`${sync.status}${sync.pending ? ` · ${sync.pending} wachtend` : ''}${sync.error ? ` · ${sync.error}` : ''}`} />
      <Row label="Account" value={sync.email ?? '-'} />
      <Row label="Connect" value={`${connect.status}${connect.error ? ` · ${connect.error}` : ''}`} />
      <Row label="Dit apparaat" value={connect.device ? `${connect.device.name} · ${connect.device.fingerprint} · ${connect.device.id}` : '-'} />
      <Row label="Gekoppeld" value={String(connect.devices.filter((d) => !d.revokedAt).length)} />
      <Row label="Herinneringen" value={String(reminders.length)} />
    </dl>
  )
}

function LogTab() {
  const log = useLog()
  const [source, setSource] = useState<LogSource | 'all'>('all')
  const shown = source === 'all' ? log : log.filter((e) => e.source === source)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={source} onChange={(e) => setSource(e.target.value as LogSource | 'all')} aria-label="Bron" className="rounded-md border border-nx-border bg-nx-surface px-2 py-1">
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'Alles' : s}
            </option>
          ))}
        </select>
        <button type="button" className={button} onClick={clearLog}>
          Wissen
        </button>
        <span className="text-xs text-nx-muted">Alleen deze sessie, zonder inhoud.</span>
      </div>
      {shown.length === 0 ? (
        <p className="text-nx-muted">Nog niets gebeurd.</p>
      ) : (
        <ol className="font-mono text-xs" aria-label="Logboek">
          {shown.map((e) => (
            <li key={e.id} className={`border-b border-nx-border py-1 ${e.error ? 'text-red-500' : ''}`}>
              {new Date(e.at).toLocaleTimeString('nl-BE')} [{e.source}] {e.message}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function AiTab() {
  const state = useSyncExternalStore(assistant.subscribe, assistant.getSnapshot)
  const totals = state.usage.reduce((sum, u) => ({ input: sum.input + u.inputTokens, output: sum.output + u.outputTokens }), { input: 0, output: 0 })
  return (
    <div className="space-y-3">
      <p>
        Deze sessie: {state.usage.length} aanvragen, {totals.input} tokens in en {totals.output} tokens uit.
      </p>
      <button type="button" className={button} onClick={forgetAlwaysAllowed}>
        "Altijd toestaan" vergeten
      </button>
      <table className="w-full text-left font-mono text-xs">
        <thead className="text-nx-muted">
          <tr>
            <th className="py-1">Tijd</th>
            <th>Model</th>
            <th>In</th>
            <th>Uit</th>
            <th>ms</th>
            <th>Stop</th>
          </tr>
        </thead>
        <tbody>
          {state.usage.map((u) => (
            <tr key={u.at} className="border-t border-nx-border">
              <td className="py-1">{new Date(u.at).toLocaleTimeString('nl-BE')}</td>
              <td>{u.model}</td>
              <td>{u.inputTokens}</td>
              <td>{u.outputTokens}</td>
              <td>{u.ms}</td>
              <td>{u.stopReason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
