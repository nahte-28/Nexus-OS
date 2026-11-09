import { useState } from 'react'
import {
  AI_MODULES,
  AUDIT_LABELS,
  PERMISSION_INFO,
  SENTINEL_TABS,
  STALE_DEVICE_DAYS,
  installedVersion,
  securityChecks,
  setShareTeam,
  staleDevices,
  type CheckLevel,
  type SecurityInput,
  type SentinelTab,
} from '@nexus/core'
import { aiContextStore, useAiContext } from '../ai/context'
import { alwaysAllowedList, forgetAlways } from '../ai/session'
import { bridgeStore, useBridge } from '../bridge/store'
import { useConnect } from '../connect/ConnectContext'
import { removeWidget, useDevHub } from '../devhub/store'
import { gamingStore, useGaming } from '../gaming/store'
import { audited, toSentinelDevice, useAudit } from '../sentinel/store'
import { openApp } from '../shell/openApp'
import { useNow } from '../state/useNow'
import { useSync } from '../sync/SyncContext'
import { errorText } from '../sync/engine'

const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const LEVEL: Record<CheckLevel, { dot: string; label: string }> = {
  warn: { dot: 'bg-amber-500', label: 'let op' },
  info: { dot: 'bg-sky-500', label: 'ter info' },
  ok: { dot: 'bg-emerald-500', label: 'in orde' },
}
const PLATFORM: Record<string, string> = { web: 'Browser', desktop: 'pc-app', android: 'Android' }
const day = (t: number) => new Date(t).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
const moment = (t: number) => new Date(t).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function notificationState(): SecurityInput['notifications'] {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Sentinel: your account, devices, sessions and permissions in one place, with what to do about each. */
export function Sentinel() {
  const [tab, setTab] = useState<SentinelTab>('Overzicht')
  const now = useNow(60_000)
  const { engine: sync, state: syncState } = useSync()
  const { engine: connect, state: connectState } = useConnect()
  const aiContext = useAiContext()
  const [always, setAlways] = useState(alwaysAllowedList)
  const devHub = useDevHub()
  const gaming = useGaming()
  const bridge = useBridge()
  const audit = useAudit()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const signedIn = syncState.email !== null
  const devices = connectState.devices.map(toSentinelDevice)
  const extensions = devHub.installs.flatMap((i) => {
    const v = installedVersion(devHub, i.projectId)
    return v ? [{ id: i.projectId, name: v.version.manifest.name, permissions: i.permissions }] : []
  })
  const checks = securityChecks({
    cloud: syncState.status !== 'unconfigured',
    signedIn,
    devices,
    aiAlwaysAllowed: always,
    aiModulesOff: AI_MODULES.filter((m) => !aiContext[m.id]).length,
    aiModulesTotal: AI_MODULES.length,
    extensions,
    sharedTeams: gaming.settings.shareTeams.length,
    autoClipboard: bridge.settings.autoClipboard,
    notifications: notificationState(),
    now,
  })

  const run = async (key: string, work: () => Promise<void>, done: string) => {
    setBusy(key)
    setMessage(null)
    try {
      await work()
      setMessage(done)
    } catch (err) {
      setMessage(`Niet gelukt: ${errorText(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const stale = new Set(staleDevices(devices, now).map((d) => d.id))
  const session = sync.sessionInfo()

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Sentinel" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {SENTINEL_TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {message && (
          <p role="status" className="rounded-md border border-nx-border p-2">
            {message}
          </p>
        )}

        {tab === 'Overzicht' && (
          <section aria-label="Overzicht" className="space-y-2">
            <p className="text-nx-muted">Wat NEXUS over je beveiliging weet. Sentinel is geen virusscanner: het toont alleen je account, apparaten en wat je toestond.</p>
            <ul className="space-y-2">
              {checks.map((c) => (
                <li key={c.id} className="flex items-start gap-3 rounded-lg border border-nx-border p-3">
                  <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${LEVEL[c.level].dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {c.title} <span className="sr-only">({LEVEL[c.level].label})</span>
                    </span>
                    <span className="block text-xs text-nx-muted">{c.detail}</span>
                  </span>
                  {c.action && (
                    <button type="button" className={small} onClick={() => (c.action!.tab ? setTab(c.action!.tab) : c.action!.app && openApp(c.action!.app))}>
                      {c.action.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'Apparaten' && (
          <section aria-label="Apparaten" className="space-y-2">
            {connectState.status !== 'ready' ? (
              <p className="text-nx-muted">
                Apparaten zie je zodra je aangemeld bent en dit toestel gekoppeld is in{' '}
                <button type="button" className="underline" onClick={() => openApp('devices')}>
                  Apparaten
                </button>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {devices
                  .filter((d) => !d.revoked)
                  .map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border p-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {d.name} {d.isThisDevice && <span className="text-xs text-nx-muted">(dit apparaat)</span>}
                        </span>
                        <span className="block text-xs text-nx-muted">
                          {PLATFORM[d.platform] ?? d.platform} · gekoppeld {day(d.createdAt)} · laatst gezien {moment(d.lastSeenAt)}
                          {stale.has(d.id) && ` · al meer dan ${STALE_DEVICE_DAYS} dagen niet gezien`}
                        </span>
                      </span>
                      {!d.isThisDevice && (
                        <button
                          type="button"
                          className={small}
                          disabled={busy !== null}
                          onClick={() => {
                            if (!window.confirm(`${d.name} intrekken? Het krijgt dan geen meldingen, plannen of overdrachten meer van NEXUS Connect.`)) return
                            void run(`revoke-${d.id}`, () => audited('device_revoked', d.name, () => connect.revoke(d.id)), `${d.name} is ingetrokken.`)
                          }}
                        >
                          Intrekken
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'Sessies' && (
          <section aria-label="Sessies" className="space-y-3">
            {!signedIn ? (
              <p className="text-nx-muted">Je bent op dit apparaat niet aangemeld, dus er is geen sessie.</p>
            ) : (
              <>
                <div className="rounded-lg border border-nx-border p-3">
                  <p className="font-medium">Deze sessie</p>
                  <p className="text-xs text-nx-muted">
                    {syncState.email}
                    {session?.signedInAt ? ` · aangemeld ${moment(session.signedInAt)}` : ''}
                    {session?.provider ? ` · via ${session.provider === 'email' ? 'e-mail' : session.provider}` : ''}
                  </p>
                </div>
                <p className="text-xs text-nx-muted">Een lijst van je sessies op andere apparaten kan NEXUS niet tonen. Vertrouw je iets niet, meld dan alle andere sessies af en wijzig je wachtwoord in Account.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={small}
                    disabled={busy !== null}
                    onClick={() => {
                      if (!window.confirm('Alle andere apparaten afmelden? Dit apparaat blijft aangemeld.')) return
                      void run('others', () => audited('signout_others', '', () => sync.signOutOthers()), 'Alle andere sessies zijn afgemeld.')
                    }}
                  >
                    Andere apparaten afmelden
                  </button>
                  <button
                    type="button"
                    className={small}
                    disabled={busy !== null}
                    onClick={() => {
                      if (!window.confirm('Overal afmelden, ook hier? Je gegevens blijven veilig in je account.')) return
                      void run('global', () => audited('signout_everywhere', '', () => sync.signOut('global')), 'Je bent overal afgemeld.')
                    }}
                  >
                    Overal afmelden
                  </button>
                  <button type="button" className={small} onClick={() => openApp('account')}>
                    Wachtwoord wijzigen
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {tab === 'Toestemmingen' && (
          <div className="space-y-5">
            <section aria-labelledby="sentinel-ai" className="space-y-2">
              <h3 id="sentinel-ai" className="font-medium">
                NEXUS AI
              </h3>
              <ul className="space-y-1">
                {AI_MODULES.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={aiContext[m.id]} onChange={(e) => aiContextStore.set(m.id, e.target.checked)} />
                      <span>
                        <span className="block">{m.title}</span>
                        <span className="block text-xs text-nx-muted">{m.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {always.length > 0 ? (
                <ul className="space-y-1">
                  {always.map((name) => (
                    <li key={name} className="flex items-center justify-between gap-2 rounded-md border border-nx-border px-3 py-2">
                      <span>
                        <code>{name}</code> <span className="text-xs text-nx-muted">loopt zonder vragen</span>
                      </span>
                      <button
                        type="button"
                        className={small}
                        onClick={() => {
                          forgetAlways(name)
                          setAlways(alwaysAllowedList())
                          void audited('ai_always_removed', name, () => {})
                        }}
                      >
                        Weer vragen
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-nx-muted">Elke actie van NEXUS AI vraagt eerst je toestemming.</p>
              )}
            </section>

            <section aria-labelledby="sentinel-ext" className="space-y-2">
              <h3 id="sentinel-ext" className="font-medium">
                Eigen widgets
              </h3>
              {extensions.length === 0 ? (
                <p className="text-xs text-nx-muted">Geen widgets geïnstalleerd.</p>
              ) : (
                <ul className="space-y-1">
                  {extensions.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-2 rounded-md border border-nx-border px-3 py-2">
                      <span>
                        <span className="block">{x.name}</span>
                        <span className="block text-xs text-nx-muted">{x.permissions.length ? x.permissions.map((p) => PERMISSION_INFO[p].title).join(', ') : 'Geen permissies'}</span>
                      </span>
                      <button
                        type="button"
                        className={small}
                        onClick={() => {
                          if (!window.confirm(`${x.name} van je dashboard halen?`)) return
                          void audited('extension_removed', x.name, () => removeWidget(x.id))
                        }}
                      >
                        Verwijderen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="sentinel-teams" className="space-y-2">
              <h3 id="sentinel-teams" className="font-medium">
                Teams
              </h3>
              <p className="text-xs text-nx-muted">
                {gaming.settings.shareTeams.length === 0
                  ? 'Geen enkel team ziet wanneer je gamet.'
                  : `${gaming.settings.shareTeams.length} ${gaming.settings.shareTeams.length === 1 ? 'team ziet' : 'teams zien'} wanneer je gamet (game en sinds wanneer).`}
              </p>
              {gaming.settings.shareTeams.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={small}
                    onClick={() => {
                      const n = gaming.settings.shareTeams.length
                      gamingStore.update((s) => s.settings.shareTeams.reduce((acc, id) => setShareTeam(acc, id, false, Date.now()), s))
                      void audited('team_share_off', `${n} ${n === 1 ? 'team' : 'teams'}`, () => {})
                    }}
                  >
                    Met niemand meer delen
                  </button>
                  <button type="button" className={small} onClick={() => openApp('gaming')}>
                    Per team kiezen in Gaming
                  </button>
                </div>
              )}
            </section>

            <section aria-labelledby="sentinel-device" className="space-y-2">
              <h3 id="sentinel-device" className="font-medium">
                Dit apparaat
              </h3>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={bridge.settings.autoClipboard} onChange={(e) => bridgeStore.setSettings({ autoClipboard: e.target.checked })} />
                <span>
                  <span className="block">Bridge zet tekst meteen op je klembord</span>
                  <span className="block text-xs text-nx-muted">Uit: je kopieert zelf wat binnenkomt.</span>
                </span>
              </label>
              <p className="text-xs text-nx-muted">
                Meldingen in deze browser:{' '}
                {{ granted: 'toegestaan', denied: 'geblokkeerd (zet ze aan in de site-instellingen)', default: 'nog niet gevraagd', unsupported: 'niet beschikbaar' }[notificationState()]}
              </p>
            </section>
          </div>
        )}

        {tab === 'Activiteit' && (
          <section aria-label="Activiteit" className="space-y-2">
            <p className="text-xs text-nx-muted">Wat er met je account en apparaten gebeurde, gezien vanaf dit apparaat. Niets hieruit wordt verstuurd.</p>
            {audit.length === 0 ? (
              <p className="text-nx-muted">Nog niets gebeurd.</p>
            ) : (
              <ol className="space-y-1">
                {audit.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-nx-border px-3 py-2">
                    <span>
                      {AUDIT_LABELS[e.action]}
                      {e.target && <span className="text-nx-muted"> · {e.target}</span>}
                      {e.outcome === 'failed' && <span className="text-red-600 dark:text-red-400"> · mislukt</span>}
                    </span>
                    <time className="text-xs text-nx-muted" dateTime={new Date(e.at).toISOString()}>
                      {moment(e.at)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

