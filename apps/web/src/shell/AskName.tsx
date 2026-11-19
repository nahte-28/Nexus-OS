import { useEffect, useState } from 'react'
import { FRIEND_NAME_MAX } from '@nexus/core'
import { Friends } from '../friends/friends'
import { profilesStore } from '../profiles/store'
import { readStorage, writeStorage } from '../state/storage'
import { loadSupabase, supabaseConfigured } from '../sync/config'

type Api = Pick<Friends, 'me' | 'profile' | 'setName'>

interface AuthEvents {
  onAuthStateChange(listener: (event: string) => void): { data: { subscription: { unsubscribe(): void } } }
}

/** The real account, loaded with the Supabase library after the first screen. */
async function loadDefault(): Promise<{ api: Api; auth: AuthEvents } | null> {
  const client = await loadSupabase()
  return client ? { api: new Friends(client), auth: client.auth } : null
}

const laterKey = (user: string) => `nexus.askName.${user}`

/**
 * After signing in without a name: asks once how you want to be called. Friends, teams and the
 * administrator see that name instead of "Zonder naam". Later hides the question on this device.
 */
export function AskName({ api: given, top = 12 }: { api?: Api | null; top?: number }) {
  const [loaded, setLoaded] = useState<{ api: Api; auth: AuthEvents } | null>(null)
  const api = given === undefined ? (loaded?.api ?? null) : given
  const [user, setUser] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (given !== undefined || !supabaseConfigured) return
    let live = true
    void loadDefault()
      .then((d) => live && setLoaded(d))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [given])

  useEffect(() => {
    if (!api) return
    let live = true
    const check = async () => {
      try {
        const me = await api.me()
        if (!me || readStorage(laterKey(me.id))) return live && setUser(null)
        if (await api.profile()) return live && setUser(null)
        if (!live) return
        setName(profilesStore.getSnapshot().state.about.name.trim().slice(0, FRIEND_NAME_MAX))
        setUser(me.id)
      } catch {
        // Not set up or offline: ask another time.
      }
    }
    void check()
    const sub = loaded?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void check()
    })
    return () => {
      live = false
      sub?.data.subscription.unsubscribe()
    }
  }, [api, loaded])

  if (!api || !user) return null
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.setName(name)
      setUser(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const later = () => {
    writeStorage(laterKey(user), '1')
    setUser(null)
  }
  return (
    <section aria-label="Kies je naam" className="nx-glass fixed right-3 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-nx-border p-3 text-sm shadow-lg" style={{ top }}>
      <h2 className="font-semibold">Hoe wil je heten in NEXUS?</h2>
      <p className="mt-1 text-xs text-nx-muted">Je vrienden, je teams en de beheerder zien deze naam. Je past hem later aan in Vrienden.</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          aria-label="Je naam"
          className="min-w-0 flex-1 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none"
          value={name}
          maxLength={FRIEND_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <button type="submit" className="rounded-md bg-nx-accent px-2 py-1 text-nx-accent-text disabled:opacity-60" disabled={busy || !name.trim()}>
          Opslaan
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-500">
          {error}
        </p>
      )}
      <div className="mt-2 flex justify-end">
        <button type="button" className="rounded-md px-2 py-1 text-xs hover:bg-nx-surface-2" onClick={later}>
          Later
        </button>
      </div>
    </section>
  )
}
