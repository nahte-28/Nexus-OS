import { useState, type ReactNode } from 'react'
import { PLATFORM_LABELS } from '@nexus/core'
import { useConnect } from '../connect/ConnectContext'
import type { DeviceView } from '../connect/engine'

const RELEASES_URL = 'https://github.com/nahte-28/Nexus-OS/releases'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

function seenText(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 2) return 'nu actief'
  if (minutes < 60) return `${minutes} min geleden actief`
  return `laatst actief ${new Date(iso).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })}`
}

export function Devices() {
  const { engine, state } = useConnect()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [permission, setPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )

  const run = async (key: string, action: () => Promise<string | void>) => {
    setBusy(key)
    setMessage(null)
    try {
      const text = await action()
      if (text) setMessage({ text })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Er ging iets mis.', error: true })
    } finally {
      setBusy(null)
    }
  }

  const intro = (
    <p className="text-nx-muted">
      Koppel je pc, browser en OnePlus 15R. Meldingen gaan end-to-end versleuteld tussen je apparaten: de server ziet
      alleen onleesbare gegevens.
    </p>
  )

  if (state.status !== 'ready') {
    const body: Record<Exclude<typeof state.status, 'ready'>, ReactNode> = {
      unconfigured: <p>Apparaten koppelen werkt met een account. Stel eerst synchronisatie in.</p>,
      'signed-out': <p>Meld je aan in de Account-app om dit apparaat te koppelen.</p>,
      starting: <p role="status">Bezig met koppelen…</p>,
      'setup-needed': (
        <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          De database mist nog de tabellen voor apparaten. Voer{' '}
          <code className="font-mono text-xs">supabase/migrations/20261019120000_connect.sql</code> uit in de SQL Editor
          van Supabase en open deze app opnieuw.
        </p>
      ),
      revoked: (
        <div className="space-y-2">
          <p>Dit apparaat werd ingetrokken en ontvangt geen meldingen meer.</p>
          <button type="button" className={primaryButton} disabled={busy !== null} onClick={() => void run('reconnect', () => engine.reconnect())}>
            Opnieuw koppelen
          </button>
        </div>
      ),
      error: (
        <div className="space-y-2">
          <p role="alert" className="text-red-500">
            Koppelen mislukt: {state.error}
          </p>
          <button type="button" className={button} onClick={() => void run('reconnect', () => engine.refreshDevices())}>
            Opnieuw proberen
          </button>
        </div>
      ),
    }
    return (
      <div className="space-y-3 p-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">Apparaten</h2>
        {intro}
        {body[state.status]}
      </div>
    )
  }

  const active = state.devices.filter((d) => !d.revokedAt)
  const revoked = state.devices.filter((d) => d.revokedAt)

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Apparaten</h2>
        {intro}
      </div>

      {permission === 'default' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          <p className="min-w-0 flex-1">Wil je een systeemmelding zien als er iets binnenkomt terwijl NEXUS op de achtergrond staat?</p>
          <button
            type="button"
            className={primaryButton}
            onClick={() => void Notification.requestPermission().then(setPermission)}
          >
            Toestaan
          </button>
        </div>
      )}

      <ul className="space-y-2" aria-label="Gekoppelde apparaten">
        {active.map((d) => (
          <DeviceRow
            key={d.id}
            device={d}
            busy={busy}
            onTest={() =>
              void run(`test-${d.id}`, async () => {
                await engine.sendTest(d.id)
                return d.isThisDevice
                  ? 'Testmelding verstuurd. Ze verschijnt zo in Meldingen.'
                  : `Testmelding verstuurd naar ${d.name}.`
              })
            }
            onRename={(name) => void run(`rename-${d.id}`, () => engine.rename(d.id, name))}
            onRevoke={() => {
              const question = d.isThisDevice
                ? 'Dit apparaat intrekken? Het ontvangt dan geen meldingen meer tot je het opnieuw koppelt.'
                : `${d.name} intrekken? Het kan dan geen meldingen meer sturen of ontvangen.`
              if (window.confirm(question)) void run(`revoke-${d.id}`, () => engine.revoke(d.id))
            }}
          />
        ))}
      </ul>

      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-red-500' : 'text-nx-muted'}>
          {message.text}
        </p>
      )}

      {!active.some((d) => d.platform === 'android') && (
        <div className="space-y-1 rounded-lg border border-nx-border p-3">
          <h3 className="font-medium">Android companion</h3>
          <p className="text-nx-muted">
            Installeer de NEXUS Companion op je OnePlus 15R om gekozen meldingen van je gsm hier te zien. Log in met
            hetzelfde account en vergelijk de code van dit apparaat ({state.device?.fingerprint}).
          </p>
          <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="inline-block text-nx-accent underline">
            Download de app
          </a>
        </div>
      )}

      {revoked.length > 0 && (
        <details className="text-nx-muted">
          <summary className="cursor-pointer">Ingetrokken apparaten ({revoked.length})</summary>
          <ul className="mt-2 space-y-1">
            {revoked.map((d) => (
              <li key={d.id}>
                {d.name} · {PLATFORM_LABELS[d.platform]} · ingetrokken op{' '}
                {new Date(d.revokedAt!).toLocaleDateString('nl-BE')}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function DeviceRow({
  device,
  busy,
  onTest,
  onRename,
  onRevoke,
}: {
  device: DeviceView
  busy: string | null
  onTest: () => void
  onRename: (name: string) => void
  onRevoke: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.name)
  return (
    <li className="space-y-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              onRename(name)
              setEditing(false)
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              aria-label="Naam van het apparaat"
              className="min-w-0 flex-1 rounded-md border border-nx-border bg-nx-surface px-2 py-1 outline-none"
              autoFocus
            />
            <button type="submit" className={button}>
              Opslaan
            </button>
          </form>
        ) : (
          <span className="font-medium">{device.name}</span>
        )}
        {device.isThisDevice && <span className="rounded bg-nx-accent px-1.5 text-xs text-nx-accent-text">Dit apparaat</span>}
      </div>
      <p className="text-xs text-nx-muted">
        {PLATFORM_LABELS[device.platform]} · {seenText(device.lastSeenAt)} · code{' '}
        <span className="font-mono">{device.fingerprint}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {/* The companion only sends for now; it cannot receive messages yet. */}
        {device.platform !== 'android' && (
          <button type="button" className={button} disabled={busy !== null} onClick={onTest}>
            {busy === `test-${device.id}` ? 'Versturen…' : 'Testmelding'}
          </button>
        )}
        {!editing && (
          <button type="button" className={button} onClick={() => setEditing(true)}>
            Naam wijzigen
          </button>
        )}
        <button type="button" className={`${button} text-red-500`} disabled={busy !== null} onClick={onRevoke}>
          Intrekken
        </button>
      </div>
    </li>
  )
}
