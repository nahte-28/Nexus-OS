import { useState, type FormEvent } from 'react'
import { useSync } from '../sync/SyncContext'
import type { SyncState } from '../sync/engine'

export function statusText(state: SyncState): string {
  switch (state.status) {
    case 'unconfigured':
      return 'Alleen op dit apparaat'
    case 'signed-out':
      return 'Niet aangemeld'
    case 'syncing':
      return 'Bezig met synchroniseren…'
    case 'synced':
      return state.pending > 0 ? `${state.pending} wijziging(en) in wachtrij` : 'Gesynchroniseerd'
    case 'offline':
      return state.pending > 0 ? `Offline · ${state.pending} wijziging(en) in wachtrij` : 'Offline'
    case 'error':
      return 'Synchroniseren mislukt'
  }
}

export function Account() {
  const { engine, state } = useSync()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await engine.signIn(email.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis.')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    if (
      state.pending > 0 &&
      !window.confirm('Er zijn nog wijzigingen die niet gesynchroniseerd zijn. Toch afmelden? Die gaan dan verloren.')
    ) {
      return
    }
    await engine.signOut()
  }

  if (state.status === 'unconfigured') {
    return (
      <div className="space-y-2 p-4 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">Account</h2>
        <p>Synchronisatie is nog niet ingesteld voor deze installatie.</p>
        <p className="text-nx-muted">
          Je notities staan veilig op dit apparaat en werken volledig offline. Zodra er een account gekoppeld is, worden
          ze automatisch meegenomen.
        </p>
      </div>
    )
  }

  if (!state.email) {
    return (
      <div className="space-y-3 p-4 text-sm">
        <h2 className="text-lg font-semibold">Aanmelden</h2>
        <p className="text-nx-muted">Meld je aan om je notities te synchroniseren tussen je pc en je gsm.</p>
        {sent ? (
          <p role="status" className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
            Check je mailbox: we stuurden een inloglink naar <strong>{email}</strong>.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jij@voorbeeld.be"
              aria-label="E-mailadres"
              className="min-w-0 flex-1 rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-2 outline-none placeholder:text-nx-muted"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-nx-accent px-4 py-2 font-medium text-nx-accent-text disabled:opacity-60"
            >
              Stuur inloglink
            </button>
          </form>
        )}
        {error && <p className="text-red-500">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 text-sm">
      <div>
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="text-nx-muted">Aangemeld als {state.email}</p>
      </div>
      <div className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
        <p role="status" className="font-medium">
          {statusText(state)}
        </p>
        {state.lastSyncedAt && (
          <p className="text-nx-muted">
            Laatst gesynchroniseerd om {new Date(state.lastSyncedAt).toLocaleTimeString('nl-BE')}
          </p>
        )}
        {state.error && <p className="text-red-500">{state.error}</p>}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void engine.syncNow()}
          className="rounded-lg bg-nx-accent px-4 py-2 font-medium text-nx-accent-text"
        >
          Nu synchroniseren
        </button>
        <button type="button" onClick={signOut} className="rounded-lg border border-nx-border px-4 py-2">
          Afmelden
        </button>
      </div>
    </div>
  )
}
