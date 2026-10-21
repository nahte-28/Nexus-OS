import { useEffect, useState, useSyncExternalStore } from 'react'
import { assistant } from '../ai/runtime'
import { forgetAlwaysAllowed } from '../ai/session'
import { useConnect } from '../connect/ConnectContext'
import { clearLog, useLog, type LogSource } from '../devtools/log'
import { apiBase, isDesktopApp } from '../platform/desktop'
import { makePushSetup, pushConfigSql, type PushSetup } from '../push/setup'
import { remindersStore } from '../reminders/store'
import { useSync } from '../sync/SyncContext'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2'
const TABS = ['Systeem', 'Logboek', 'AI', 'Web-push'] as const
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
        {tab === 'Web-push' && <PushTab />}
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

/** One-time setup for web push to a phone in Chrome: keys for Vercel, the address for Supabase. */
function PushTab() {
  const [server, setServer] = useState<'checking' | 'ready' | 'missing' | 'offline'>('checking')
  const [setup, setSetup] = useState<PushSetup | null>(null)
  const origin = apiBase || window.location.origin
  useEffect(() => {
    let cancelled = false
    fetch(`${apiBase}/api/push`, { cache: 'no-store' })
      .then((r) => !cancelled && setServer(r.ok ? 'ready' : 'missing'))
      .catch(() => !cancelled && setServer('offline'))
    return () => {
      cancelled = true
    }
  }, [])
  const code = 'block whitespace-pre-wrap break-all rounded-md border border-nx-border bg-nx-surface-2 p-2 font-mono text-xs select-all'
  return (
    <div className="space-y-3 leading-relaxed">
      <p>
        Server:{' '}
        {server === 'checking' ? 'bezig met nakijken…' : server === 'ready' ? 'web-push is ingesteld.' : server === 'missing' ? 'de sleutels ontbreken nog op Vercel.' : 'niet bereikbaar.'}
      </p>
      <p className="text-nx-muted">
        Eenmalig, zodat je gsm meldingen krijgt als NEXUS daar dicht is. Maak de waarden hier, zet ze op Vercel en in Supabase,
        en bewaar ze nergens anders: wie de geheime waarden heeft, kan meldingen naar je toestellen sturen (lezen kan niemand,
        de inhoud blijft versleuteld).
      </p>
      {!setup ? (
        <button type="button" className={button} onClick={() => void makePushSetup().then(setSetup)}>
          Sleutels maken
        </button>
      ) : (
        <ol className="list-decimal space-y-3 pl-5">
          <li className="space-y-1">
            <p>
              Vercel › je project › Settings › Environment Variables: voeg deze drie toe (Production) en zet daarna de site opnieuw
              online (Deployments › Redeploy).
            </p>
            <code className={code}>{`VAPID_PUBLIC_KEY=${setup.publicKey}\nVAPID_PRIVATE_KEY=${setup.privateKey}\nPUSH_SECRET=${setup.secret}`}</code>
          </li>
          <li className="space-y-1">
            <p>
              Supabase › SQL Editor: voer eerst <span className="font-mono text-xs">supabase/migrations/20261021100000_push.sql</span>{' '}
              uit (eerst Database › Extensions: <span className="font-mono text-xs">pg_cron</span> en{' '}
              <span className="font-mono text-xs">pg_net</span> aanzetten als dat niet lukt), daarna dit:
            </p>
            <code className={code}>{pushConfigSql(origin, setup.secret)}</code>
          </li>
          <li>Op je gsm: open NEXUS in Chrome, meld je aan en kies in Apparaten "Meldingen aanzetten".</li>
        </ol>
      )}
    </div>
  )
}
