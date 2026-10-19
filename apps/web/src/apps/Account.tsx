import { useState, type FormEvent } from 'react'
import { isDesktopApp } from '../platform/desktop'
import { useSync } from '../sync/SyncContext'
import type { SyncState } from '../sync/engine'
import { missingSupabaseEnv } from '../sync/supabase'

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

type Mode = 'login' | 'signup' | 'link'

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'login', label: 'Inloggen' },
  { id: 'signup', label: 'Account maken' },
  // A login link opens in the browser, not in the Windows app, so the app only offers passwords.
  ...(isDesktopApp ? [] : [{ id: 'link' as const, label: 'Inloglink' }]),
]

const inputClass =
  'w-full min-w-0 rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-2 outline-none placeholder:text-nx-muted'
const primaryButton = 'rounded-lg bg-nx-accent px-4 py-2 font-medium text-nx-accent-text disabled:opacity-60'

export function Account() {
  const { engine, state } = useSync()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setNotice(await action())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis.')
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    void run(async () => {
      if (mode === 'link') {
        await engine.signIn(address)
        return `Check je mailbox: we stuurden een inloglink naar ${address}.`
      }
      if (mode === 'signup') {
        const { needsConfirmation } = await engine.signUp(address, password)
        return needsConfirmation ? `Bijna klaar: bevestig je account via de mail naar ${address}.` : null
      }
      await engine.signInWithPassword(address, password)
      return null
    })
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
        <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3 font-mono text-xs text-nx-muted">
          Build {__BUILD_COMMIT__} · ontbreekt: {missingSupabaseEnv.join(', ')}
        </p>
      </div>
    )
  }

  if (!state.email) {
    return (
      <div className="space-y-3 p-4 text-sm">
        <h2 className="text-lg font-semibold">Aanmelden</h2>
        <p className="text-nx-muted">Meld je aan om je notities te synchroniseren tussen je pc en je gsm.</p>
        <div role="tablist" aria-label="Manier van aanmelden" className="flex gap-1 rounded-lg bg-nx-surface-2 p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => {
                setMode(m.id)
                setError(null)
                setNotice(null)
              }}
              className={`flex-1 rounded-md px-2 py-1.5 ${mode === m.id ? 'bg-nx-surface font-medium shadow-sm' : 'text-nx-muted'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jij@voorbeeld.be"
            aria-label="E-mailadres"
            className={inputClass}
          />
          {mode !== 'link' && (
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Wachtwoord"
              aria-label="Wachtwoord"
              className={inputClass}
            />
          )}
          <button type="submit" disabled={busy} className={primaryButton}>
            {mode === 'login' ? 'Inloggen' : mode === 'signup' ? 'Account maken' : 'Stuur inloglink'}
          </button>
        </form>
        {notice && (
          <p role="status" className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
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
        <button type="button" onClick={() => void engine.syncNow()} className={primaryButton}>
          Nu synchroniseren
        </button>
        <button type="button" onClick={signOut} className="rounded-lg border border-nx-border px-4 py-2">
          Afmelden
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await engine.setPassword(password)
            setPassword('')
            return 'Je wachtwoord is opgeslagen. Je kunt er voortaan mee inloggen.'
          })
        }}
        className="space-y-2 border-t border-nx-border pt-4"
      >
        <h3 className="font-medium">Wachtwoord instellen</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nieuw wachtwoord"
            aria-label="Nieuw wachtwoord"
            className={inputClass}
          />
          <button type="submit" disabled={busy} className="rounded-lg border border-nx-border px-4 py-2 disabled:opacity-60">
            Opslaan
          </button>
        </div>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
