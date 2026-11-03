import { useState } from 'react'
import { agoText, OFFLINE_LEVEL_LABELS, OFFLINE_MODULES, offlineSummary, type OfflineLevel, type SyncOutcome } from '@nexus/core'
import { clearHistory, syncAll, useOffline } from '../offline/channels'
import { openApp } from '../shell/openApp'
import { useOnline } from '../shell/OfflineBanner'
import { useNow } from '../state/useNow'
import { useSync } from '../sync/SyncContext'

const TABS = ['Overzicht', 'Wachtrij', 'Samengevoegd', 'Geschiedenis', 'Per app'] as const
type Tab = (typeof TABS)[number]
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primary = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const LEVEL_DOT: Record<OfflineLevel, string> = { full: 'bg-emerald-500', partial: 'bg-amber-500', online: 'bg-nx-border' }
const OUTCOME: Record<SyncOutcome, string> = { ok: 'Gelukt', failed: 'Mislukt', merged: 'Samengevoegd' }
const moment = (t: number) => new Date(t).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Offline-centrum: what works without internet, what waits, what was merged and the sync history. */
export function OfflineCenter() {
  const [tab, setTab] = useState<Tab>('Overzicht')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const now = useNow(30_000)
  const online = useOnline()
  const { state: sync } = useSync()
  const { channels, runs } = useOffline()
  const summary = offlineSummary(channels, runs, now)
  const signedIn = sync.email !== null
  const waiting = channels.filter((c) => c.pending > 0)
  const merges = runs.filter((r) => r.outcome === 'merged')

  const syncNow = async () => {
    setBusy(true)
    setDone(null)
    await syncAll()
    setBusy(false)
    setDone(`Klaar om ${new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}.`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Offline-centrum" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
            {t}
          </button>
        ))}
      </div>
      {/* Focusable so the keyboard can scroll a tab that has no buttons, like Per app. */}
      <div tabIndex={0} role="tabpanel" aria-label={tab} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 outline-none focus-visible:ring-2 focus-visible:ring-nx-accent">
        {tab === 'Overzicht' && (
          <section aria-label="Overzicht" className="space-y-3">
            <div className="rounded-lg border border-nx-border p-3">
              <p className="font-medium">{online ? 'Je bent online' : 'Je bent offline'}</p>
              <p className="text-xs text-nx-muted">
                {!signedIn
                  ? 'Je bent niet aangemeld: alles staat alleen op dit apparaat en werkt offline.'
                  : online
                    ? `Laatst gesynchroniseerd: ${agoText(summary.lastOkAt, now)}.`
                    : 'Je kunt gewoon verder werken. Wat je wijzigt, wacht hier tot je weer online bent.'}
              </p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              <li className="rounded-lg border border-nx-border p-3">
                <span className="block text-2xl font-semibold">{summary.pending}</span>
                <span className="text-xs text-nx-muted">{summary.pending === 1 ? 'wijziging wacht' : 'wijzigingen wachten'}</span>
              </li>
              <li className="rounded-lg border border-nx-border p-3">
                <span className="block text-2xl font-semibold">{summary.failing}</span>
                <span className="text-xs text-nx-muted">{summary.failing === 1 ? 'onderdeel met een probleem' : 'onderdelen met een probleem'}</span>
              </li>
              <li className="rounded-lg border border-nx-border p-3">
                <span className="block text-2xl font-semibold">{summary.merges}</span>
                <span className="text-xs text-nx-muted">keer samengevoegd (7 dagen)</span>
              </li>
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={primary} disabled={busy || !online || !signedIn} onClick={() => void syncNow()}>
                {busy ? 'Bezig met syncen…' : 'Nu syncen'}
              </button>
              {done && <span role="status">{done}</span>}
              {!signedIn && (
                <button type="button" className={small} onClick={() => openApp('account')}>
                  Aanmelden
                </button>
              )}
            </div>
            {channels.length > 0 && (
              <ul className="space-y-1" aria-label="Onderdelen die syncen">
                {channels.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-nx-border px-3 py-2">
                    <span>{c.label}</span>
                    <span className={`text-xs ${c.error ? 'text-red-600 dark:text-red-400' : 'text-nx-muted'}`}>
                      {c.error ? `Probleem: ${c.error}` : c.pending > 0 ? `${c.pending} wacht` : `bijgewerkt ${agoText(c.lastOkAt, now)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'Wachtrij' && (
          <section aria-label="Wachtrij" className="space-y-2">
            <p className="text-nx-muted">Wijzigingen op dit apparaat die je account nog niet heeft. Ze gaan vanzelf mee zodra je online en aangemeld bent; je hoeft niets te doen.</p>
            {waiting.length === 0 ? (
              <p>Niets wacht. Alles is verstuurd.</p>
            ) : (
              <ul className="space-y-1">
                {waiting.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 rounded-md border border-nx-border px-3 py-2">
                    <span>{c.label}</span>
                    <span className="text-xs text-nx-muted">{c.id === 'notes' || c.id === 'life' || c.id === 'files' ? `${c.pending} ${c.pending === 1 ? 'item' : 'items'}` : 'gewijzigd'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'Samengevoegd' && (
          <section aria-label="Samengevoegd" className="space-y-2">
            <p className="text-nx-muted">
              Wijzigde je hetzelfde op twee apparaten terwijl een ervan offline was, dan voegt NEXUS ze samen. Per notitie, deadline of onderdeel wint de laatste wijziging; niets wordt stil weggegooid zonder dat het hier staat.
            </p>
            {merges.length === 0 ? (
              <p>Nog niets samengevoegd.</p>
            ) : (
              <ul className="space-y-1">
                {merges.map((r) => (
                  <li key={r.id} className="rounded-md border border-nx-border px-3 py-2">
                    <span className="block">{r.label}</span>
                    <span className="block text-xs text-nx-muted">
                      {moment(r.at)} · {r.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'Geschiedenis' && (
          <section aria-label="Geschiedenis" className="space-y-2">
            <p className="text-nx-muted">Synchronisaties die iets verstuurden, binnenhaalden, samenvoegden of mislukten, op dit apparaat.</p>
            {runs.length === 0 ? (
              <p>Nog geen synchronisaties.</p>
            ) : (
              <>
                <ol className="space-y-1">
                  {runs.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-nx-border px-3 py-2">
                      <span>
                        {r.label} · <span className={r.outcome === 'failed' ? 'text-red-600 dark:text-red-400' : ''}>{OUTCOME[r.outcome]}</span>
                        {r.detail && <span className="text-nx-muted"> · {r.detail}</span>}
                      </span>
                      <time className="text-xs text-nx-muted" dateTime={new Date(r.at).toISOString()}>
                        {moment(r.at)}
                      </time>
                    </li>
                  ))}
                </ol>
                <button type="button" className={small} onClick={clearHistory}>
                  Geschiedenis wissen
                </button>
              </>
            )}
          </section>
        )}

        {tab === 'Per app' && (
          <section aria-label="Per app" className="space-y-2">
            <ul className="space-y-1">
              {OFFLINE_MODULES.map((m) => (
                <li key={m.app} className="flex items-start gap-3 rounded-md border border-nx-border px-3 py-2">
                  <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${LEVEL_DOT[m.level]}`} />
                  <span>
                    <span className="block">
                      {m.title} <span className="text-xs text-nx-muted">· {OFFLINE_LEVEL_LABELS[m.level]}</span>
                    </span>
                    <span className="block text-xs text-nx-muted">{m.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
