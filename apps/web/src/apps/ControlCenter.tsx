import { useSyncExternalStore } from 'react'
import { attention, statusCards, type AppId, type CardTone, type LifeItem } from '@nexus/core'
import { openCapture } from '../capture/open'
import { useConnect } from '../connect/ConnectContext'
import { favoritesStore, useFavorites } from '../controlcenter/store'
import { useFeature } from '../features/store'
import { inQuietHours } from '../flows/runner'
import { flowsStore, useFlowRuns, useFlows, useFlowStudioEnabled } from '../flows/store'
import { useInbox } from '../inbox/store'
import { lifeStore } from '../life/store'
import { checkForUpdate, useUpdate } from '../platform/update'
import { desktopAppName } from '../platform/desktop'
import { useProfiles } from '../profiles/store'
import { openApp } from '../shell/openApp'
import { useOnline } from '../shell/OfflineBanner'
import { useNow } from '../state/useNow'
import { focusStore } from '../study/timer'
import { useSync } from '../sync/SyncContext'
import { useVisibleApps } from './registry'

const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const toggle = 'flex items-center justify-between gap-2 rounded-lg border border-nx-border px-3 py-2 text-left hover:bg-nx-surface-2 disabled:opacity-50'
const TONE: Record<CardTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-red-500',
  off: 'bg-nx-border',
}
const TONE_LABEL: Record<CardTone, string> = { ok: 'in orde', warn: 'let op', error: 'probleem', off: 'uit' }
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

function dayBounds(now: number) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return { start: d.getTime(), end: d.getTime() + 24 * 60 * 60_000 }
}

function deadlineCounts(items: LifeItem[], now: number) {
  const { end } = dayBounds(now)
  let overdue = 0
  let today = 0
  for (const i of items) {
    if (i.kind !== 'deadline' || i.deletedAt !== null || i.doneAt !== null) continue
    if (i.dueAt < now) overdue++
    else if (i.dueAt < end) today++
  }
  return { overdue, today }
}

function Switch({ label, detail, on, disabled, onChange }: { label: string; detail: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className={toggle}>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-nx-muted">{detail}</span>
      </span>
      <span aria-hidden className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-nx-accent' : 'bg-nx-border'}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white transition ${on ? 'left-4.5' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

/** Control Center: how NEXUS is doing, quick switches and your favourite apps, in one panel. */
export function ControlCenter() {
  const now = useNow(30_000)
  const online = useOnline()
  const { engine: sync, state: syncState } = useSync()
  const { state: connect } = useConnect()
  const { active, reason } = useProfiles()
  const flows = useFlows()
  const runs = useFlowRuns()
  const flowStudio = useFlowStudioEnabled()
  const inboxOn = useFeature('inbox')
  const inbox = useInbox()
  const life = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const focus = useSyncExternalStore(focusStore.subscribe, focusStore.getSnapshot)
  const update = useUpdate()
  const favorites = useFavorites()
  const apps = useVisibleApps()

  const { start } = dayBounds(now)
  const quiet = inQuietHours(flows.settings, now, timeZone())
  const cards = statusCards({
    now,
    online,
    sync: syncState,
    connect: { status: connect.status, devices: connect.devices.length, unread: connect.unread },
    profile: { name: active.name, scheduled: reason === 'schedule' },
    flows: { enabled: flowStudio, paused: flows.settings.paused, quiet, active: flows.flows.filter((f) => f.enabled).length, failedToday: runs.filter((r) => r.status === 'failed' && r.at >= start).length },
    inbox: inboxOn ? { unread: inbox.filter((e) => e.readAt === null && e.archivedAt === null).length } : null,
    deadlines: deadlineCounts(life, now),
    focus: { endsAt: focus.timer.endsAt, phase: focus.timer.phase },
    update: update.status === 'available' || update.status === 'installing' ? { status: update.status, version: update.update.version } : { status: update.status },
  })
  const first = attention(cards)
  const known = new Map(apps.map((a) => [a.id, a]))
  const favoriteApps = favorites.flatMap((id) => (known.has(id) ? [known.get(id)!] : []))
  const canSync = syncState.status !== 'unconfigured' && syncState.status !== 'signed-out'

  return (
    <div className="h-full space-y-5 overflow-y-auto p-4 text-sm">
      <p className={`rounded-lg border p-3 ${first ? (first.tone === 'error' ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10') : 'border-emerald-500/40 bg-emerald-500/10'}`} role="status">
        {first ? (
          <>
            <span className="font-medium">{first.title}:</span> {first.value}. {first.detail}
          </>
        ) : (
          'Alles in orde.'
        )}
      </p>

      <section aria-labelledby="cc-status" className="space-y-2">
        <h3 id="cc-status" className="font-medium">
          Status
        </h3>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {cards.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => openApp(c.app)} className="h-full w-full space-y-1 rounded-lg border border-nx-border p-3 text-left hover:bg-nx-surface-2" aria-label={`${c.title}: ${c.value}, ${TONE_LABEL[c.tone]}. ${c.detail}`}>
                <span className="flex items-center gap-2 text-xs text-nx-muted">
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${TONE[c.tone]}`} />
                  {c.title}
                </span>
                <span className="block font-medium">{c.value}</span>
                <span className="block text-xs text-nx-muted">{c.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cc-quick" className="space-y-2">
        <h3 id="cc-quick" className="font-medium">
          Snelknoppen
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          <Switch
            label="Flows pauzeren"
            detail={flowStudio ? (flows.settings.paused ? 'Er loopt geen enkele flow.' : 'Flows lopen gewoon.') : 'Flow Studio staat uit.'}
            on={flows.settings.paused}
            disabled={!flowStudio}
            onChange={(paused) => flowsStore.setSettings({ paused })}
          />
          <Switch
            label="Stille uren"
            detail={`Flows sturen geen meldingen van ${flows.settings.quiet.start} tot ${flows.settings.quiet.end}.`}
            on={flows.settings.quiet.enabled}
            disabled={!flowStudio}
            onChange={(enabled) => flowsStore.setSettings({ quiet: { ...flows.settings.quiet, enabled } })}
          />
          <button type="button" className={toggle} onClick={() => openCapture()}>
            <span>
              <span className="block font-medium">Snelle notitie</span>
              <span className="block text-xs text-nx-muted">Ook met Alt+N.</span>
            </span>
          </button>
          <button type="button" className={toggle} disabled={!canSync || !online} onClick={() => void sync.syncNow()}>
            <span>
              <span className="block font-medium">Nu syncen</span>
              <span className="block text-xs text-nx-muted">{canSync ? 'Haal wijzigingen meteen op.' : 'Werkt met een account.'}</span>
            </span>
          </button>
          <button type="button" className={toggle} disabled={update.status === 'checking'} onClick={() => void checkForUpdate()}>
            <span>
              <span className="block font-medium">Zoeken naar updates</span>
              <span className="block text-xs text-nx-muted">De {desktopAppName} installeert ze zelf.</span>
            </span>
          </button>
          <button type="button" className={toggle} onClick={() => openApp('profiles')}>
            <span>
              <span className="block font-medium">Profiel wisselen</span>
              <span className="block text-xs text-nx-muted">Nu: {active.name}.</span>
            </span>
          </button>
        </div>
      </section>

      <section aria-labelledby="cc-fav" className="space-y-2">
        <h3 id="cc-fav" className="font-medium">
          Favorieten
        </h3>
        {favoriteApps.length === 0 && <p className="text-nx-muted">Nog geen favorieten. Kies hieronder apps met de ster.</p>}
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {favoriteApps.map((a, i) => (
            <li key={a.id} className="space-y-1">
              <button type="button" onClick={() => openApp(a.id)} className="flex w-full flex-col items-center gap-1 rounded-lg border border-nx-border p-3 hover:bg-nx-surface-2">
                <a.icon className="size-6" aria-hidden />
                <span className="text-xs">{a.title}</span>
              </button>
              <div className="flex justify-center gap-1">
                <button type="button" className={small} disabled={i === 0} aria-label={`${a.title} naar voren`} onClick={() => favoritesStore.move(a.id, -1)}>
                  ←
                </button>
                <button type="button" className={small} disabled={i === favoriteApps.length - 1} aria-label={`${a.title} naar achteren`} onClick={() => favoritesStore.move(a.id, 1)}>
                  →
                </button>
              </div>
            </li>
          ))}
        </ul>
        <details className="rounded-lg border border-nx-border p-2">
          <summary className="cursor-pointer">Favorieten kiezen</summary>
          <ul className="mt-2 grid gap-1 md:grid-cols-2">
            {apps
              .filter((a) => a.id !== 'controlcenter')
              .map((a) => {
                const on = favorites.includes(a.id as AppId)
                return (
                  <li key={a.id}>
                    <button type="button" aria-pressed={on} onClick={() => favoritesStore.toggle(a.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-nx-surface-2">
                      <span aria-hidden className={on ? 'text-amber-500' : 'text-nx-muted'}>
                        {on ? '★' : '☆'}
                      </span>
                      {a.title}
                    </button>
                  </li>
                )
              })}
          </ul>
          <p className="mt-2 text-xs text-nx-muted">Favorieten gelden voor dit apparaat, net als de snelknoppen van een gsm.</p>
        </details>
      </section>
    </div>
  )
}
