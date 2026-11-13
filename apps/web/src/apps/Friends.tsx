import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatFriendCode, FRIEND_NAME_MAX, requestResult, sortFriends, type FriendEntry } from '@nexus/core'
import { supabase } from '../sync/supabase'
import { suggestedName } from '../study/group'
import { clearPendingFriend, Friends as FriendsApi, myFriendLink, pendingFriend, type FriendProfile } from '../friends/friends'
import { DirectMessages } from '../friends/dm'
import { Messages } from '../friends/Messages'
import { defaultEngine, useConnect } from '../connect/ConnectContext'
import { readStorage, writeStorage } from '../state/storage'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const defaultApi = supabase ? new FriendsApi(supabase) : null
const defaultDms = supabase ? new DirectMessages(supabase, defaultEngine) : null
const TAB_KEY = 'nexus.friends.tab'
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Vrienden: add people with your code or link, answer requests and see who your friends are. */
export function Friends({ api = defaultApi, dms = defaultDms }: { api?: FriendsApi | null; dms?: DirectMessages | null }) {
  const { state: connect } = useConnect()
  const sealed = connect.status === 'ready'
  const [tab, setTabState] = useState<'Vrienden' | 'Berichten'>(() => (readStorage(TAB_KEY) === 'Berichten' ? 'Berichten' : 'Vrienden'))
  const setTab = (t: 'Vrienden' | 'Berichten') => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  const [me, setMe] = useState<{ id: string; email: string | undefined } | null | undefined>(undefined)
  const [profile, setProfile] = useState<FriendProfile | null | undefined>(undefined)
  const [list, setList] = useState<FriendEntry[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState(() => pendingFriend() ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [renew, setRenew] = useState(false)

  const refresh = useCallback(async () => {
    if (!api) return
    try {
      const user = await api.me()
      setMe(user)
      if (!user) return
      const p = await api.profile()
      setProfile(p)
      setName((n) => n || p?.displayName || suggestedName(user.email))
      if (p) setList(await api.list())
      setProblem(null)
    } catch (err) {
      setProfile((p) => (p === undefined ? null : p))
      setProblem(message(err))
    }
  }, [api])

  useEffect(() => {
    void refresh()
    if (!api) return
    let debounce: ReturnType<typeof setTimeout> | undefined
    const stop = api.watch(() => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void refresh(), 300)
    })
    // Deletions do not come through realtime; a slow poll catches them.
    const t = setInterval(() => void refresh(), 60_000)
    return () => {
      stop()
      clearTimeout(debounce)
      clearInterval(t)
    }
  }, [api, refresh])

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
      setProblem(null)
      await refresh()
    } catch (err) {
      setProblem(message(err))
    } finally {
      setBusy(false)
    }
  }

  if (!api) return <p className="p-4 text-sm text-nx-muted">Vrienden werkt met een account. Deze versie van NEXUS heeft geen verbinding met Supabase.</p>
  if (me === null) return <p className="p-4 text-sm text-nx-muted">Meld je aan in Account om vrienden toe te voegen.</p>
  if (me === undefined || profile === undefined) return <p className="p-4 text-sm text-nx-muted">Laden…</p>

  const add = (e: FormEvent) => {
    e.preventDefault()
    setNotice(null)
    void run(async () => {
      const result = await api.add(code)
      if (!result) throw new Error('Niemand heeft die code. Vraag de code of link opnieuw.')
      setNotice(requestResult(result.status, result.name))
      setCode('')
      clearPendingFriend()
    })
  }
  const share = (asLink: boolean) => {
    if (!profile) return
    void navigator.clipboard?.writeText(asLink ? myFriendLink(profile.code) : formatFriendCode(profile.code)).then(() => setNotice(asLink ? 'Link gekopieerd.' : 'Code gekopieerd.'))
  }

  const sorted = sortFriends(list)
  const setup = problem?.startsWith('setup:')

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4 text-sm">
      {setup ? (
        <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
          Vrienden heeft nog een stap in de database nodig: voer eenmalig <code>{problem!.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
        </p>
      ) : (
        problem && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">{problem}</p>
      )}
      {notice && <p role="status" className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">{notice}</p>}

      {!profile ? (
        !setup && (
          <form
            className="space-y-2 rounded-lg border border-nx-border p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => setProfile(await api.setName(name)))
            }}
          >
            <h3 className="font-medium">Kies je naam voor vrienden</h3>
            <p className="text-xs text-nx-muted">Je vrienden zien alleen deze naam, nooit je e-mailadres. Daarna krijg je je eigen vriendencode.</p>
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={FRIEND_NAME_MAX} aria-label="Je naam voor vrienden" className={`${field} flex-1`} />
              <button type="submit" className={primaryButton} disabled={busy || !name.trim()}>
                Opslaan
              </button>
            </div>
          </form>
        )
      ) : (
        <>
          <div role="tablist" aria-label="Vrienden" className="flex gap-1">
            {(['Vrienden', 'Berichten'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
                {t}
              </button>
            ))}
          </div>
          {tab === 'Berichten' ? (
            dms ? <Messages dms={dms} me={me.id} friends={list} sealed={sealed} /> : null
          ) : (
            <>
            <section className="space-y-2 rounded-lg border border-nx-border p-3">
              <h3 className="font-medium">Jouw vriendencode</h3>
              <p className="font-mono text-2xl tracking-widest" aria-label="Jouw vriendencode">
                {formatFriendCode(profile.code)}
              </p>
              <p className="text-xs text-nx-muted">Geef deze code of de link aan wie je wilt toevoegen. Die stuurt je dan een verzoek, en jij beslist of je het aanvaardt.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={small} onClick={() => share(true)}>
                  Link kopiëren
                </button>
                <button type="button" className={small} onClick={() => share(false)}>
                  Code kopiëren
                </button>
                {typeof navigator.share === 'function' && (
                  <button type="button" className={small} onClick={() => void navigator.share({ title: 'Word mijn vriend in NEXUS', url: myFriendLink(profile.code) }).catch(() => {})}>
                    Delen
                  </button>
                )}
                {renew ? (
                  <button
                    type="button"
                    className={small}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setProfile(await api.renewCode())
                        setRenew(false)
                        setNotice('Je hebt een nieuwe code. De oude code en link werken niet meer.')
                      })
                    }
                  >
                    Ja, maak een nieuwe code
                  </button>
                ) : (
                  <button type="button" className={small} onClick={() => setRenew(true)}>
                    Nieuwe code
                  </button>
                )}
              </div>
              <form
                className="flex flex-wrap items-center gap-2 pt-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(async () => setProfile(await api.setName(name)))
                }}
              >
                <label className="text-xs text-nx-muted" htmlFor="friend-name">
                  Je naam
                </label>
                <input id="friend-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={FRIEND_NAME_MAX} className={`${field} w-auto flex-1`} />
                {name.trim() !== profile.displayName && (
                  <button type="submit" className={small} disabled={busy || !name.trim()}>
                    Naam opslaan
                  </button>
                )}
              </form>
            </section>

            <form onSubmit={add} className="space-y-2 rounded-lg border border-nx-border p-3">
              <h3 className="font-medium">Iemand toevoegen</h3>
              {pendingFriend() && <p className="text-xs">Je opende een vriendenlink. Tik op Verzoek sturen.</p>}
              <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} placeholder="Code, bv. ABCD-EFGH" aria-label="Vriendencode" className={`${field} flex-1 font-mono uppercase`} />
                <button type="submit" className={button} disabled={busy || !code.trim()}>
                  Verzoek sturen
                </button>
              </div>
            </form>

            <section className="space-y-2">
              <h3 className="font-medium">Vrienden</h3>
              {sorted.length === 0 && <p className="text-nx-muted">Nog geen vrienden. Deel je code of link, of vul de code van iemand anders in.</p>}
              <ul className="space-y-1">
                {sorted.map((f) => (
                  <li key={f.userId} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block">{f.displayName}</span>
                      <span className="block text-xs text-nx-muted">
                        {f.kind === 'incoming' ? 'Wil je vriend worden' : f.kind === 'outgoing' ? 'Verzoek gestuurd, wacht op antwoord' : `Vrienden sinds ${new Date(f.since).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                      </span>
                    </span>
                    {f.kind === 'incoming' && (
                      <button type="button" className={primaryButton} disabled={busy} onClick={() => void run(() => api.accept(f.userId))}>
                        Aanvaarden
                      </button>
                    )}
                    <button type="button" className={small} disabled={busy} aria-label={`${f.kind === 'friend' ? 'Vriendschap beëindigen met' : f.kind === 'incoming' ? 'Verzoek weigeren van' : 'Verzoek intrekken voor'} ${f.displayName}`} onClick={() => void run(() => api.remove(me.id, f.userId))}>
                      {f.kind === 'friend' ? 'Verwijderen' : f.kind === 'incoming' ? 'Weigeren' : 'Intrekken'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
