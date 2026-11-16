import { useCallback, useEffect, useState } from 'react'
import {
  bestOf,
  canUndoOnline,
  checkoutRoute,
  DARTS_MODES,
  legsWon,
  MAX_LEGS_TO_WIN,
  myTurn,
  onlineLine,
  onlineWon,
  opponentOf,
  playerAverage,
  remaining,
  replayOnline,
  toThrow,
  toWinFromBestOf,
  type FriendEntry,
  type OnlineGame,
} from '@nexus/core'
import { Friends } from '../friends/friends'
import { supabase } from '../sync/supabase'
import { DartsOnline, saveOnlineToHistory } from './online'

const field = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primary = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const QUICK = [26, 41, 45, 60, 81, 85, 100, 140, 180]
const POLL_MS = 10_000

export interface OnlineApis {
  online: DartsOnline | null
  friends: Pick<Friends, 'list'> | null
}

const defaults: OnlineApis = { online: supabase ? new DartsOnline(supabase) : null, friends: supabase ? new Friends(supabase) : null }

function Problem({ text }: { text: string }) {
  if (text.startsWith('setup:')) {
    return (
      <p role="alert" className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
        Voor Darts online is nog één SQL-stap nodig: <code className="font-mono text-xs">{text.slice(6)}</code>. Kijk in Account › Database-check.
      </p>
    )
  }
  return (
    <p role="alert" className="text-red-500">
      {text}
    </p>
  )
}

/** Darts › Online: challenge a friend to an X01 match, each throws on their own device, live. */
export function Online({ apis = defaults }: { apis?: OnlineApis }) {
  const { online, friends: friendsApi } = apis
  const [user, setUser] = useState<boolean | null>(null)
  const [games, setGames] = useState<OnlineGame[] | null>(null)
  const [friends, setFriends] = useState<FriendEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!online) return
    try {
      const ok = await online.signedIn()
      setUser(ok)
      if (!ok) return
      const list = await online.list()
      setGames(list)
      for (const g of list) saveOnlineToHistory(g)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [online])

  useEffect(() => {
    void load()
    const poll = setInterval(() => void load(), POLL_MS)
    const stop = online?.watch(() => void load())
    return () => {
      clearInterval(poll)
      stop?.()
    }
  }, [online, load])

  useEffect(() => {
    if (!user || !friendsApi) return
    friendsApi
      .list()
      .then((list) => setFriends(list.filter((f) => f.kind === 'friend')))
      .catch(() => setFriends([]))
  }, [user, friendsApi])

  // A match that someone won is closed as done, by whichever device sees it first.
  useEffect(() => {
    for (const g of games ?? []) if (g.status === 'playing' && onlineWon(g)) void online?.end(g.id, 'done').then(load, () => {})
  }, [games, online, load])

  if (!online) return <p className="text-nx-muted">Darts online werkt alleen met een account. Meld je aan in Account.</p>
  if (user === false) return <p className="text-nx-muted">Meld je aan om online tegen je vrienden te darten.</p>

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    await load()
  }

  const shown = games ?? []
  const live = shown.filter((g) => g.status === 'invited' || g.status === 'playing')
  const ended = shown.filter((g) => g.status !== 'invited' && g.status !== 'playing').slice(0, 10)
  const playing = shown.find((g) => g.id === open && g.status === 'playing')

  return (
    <div className="space-y-4">
      <p className="text-nx-muted">Daag een vriend uit voor een match. Jullie gooien elk op je eigen toestel en zien de stand live. Een afgewerkte match komt in je Geschiedenis en Statistieken.</p>
      {error && <Problem text={error} />}
      {playing ? (
        <Board game={playing} onBack={() => setOpen(null)} act={act} online={online} />
      ) : (
        <>
          <Invite friends={friends} onInvite={(friend, options) => act(() => online.invite(friend, options))} />
          <section aria-label="Lopende matchen" className="space-y-2">
            <h3 className="font-medium">Lopend</h3>
            {games === null && <p className="text-nx-muted">Laden…</p>}
            {games !== null && live.length === 0 && <p className="text-nx-muted">Geen open matchen.</p>}
            <ul className="space-y-2">
              {live.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {g.players[0]} – {g.players[1]} · {g.mode}
                    </span>
                    <span className="block text-xs text-nx-muted">{onlineLine(g)}</span>
                  </span>
                  {g.status === 'invited' && g.side === 1 && (
                    <>
                      <button type="button" className={primary} onClick={() => void act(() => online.answer(g.id, true))}>
                        Aanvaarden
                      </button>
                      <button type="button" className={button} onClick={() => void act(() => online.answer(g.id, false))}>
                        Afslaan
                      </button>
                    </>
                  )}
                  {g.status === 'invited' && g.side === 0 && (
                    <button type="button" className={button} onClick={() => void act(() => online.end(g.id, 'stopped'))}>
                      Intrekken
                    </button>
                  )}
                  {g.status === 'playing' && (
                    <button type="button" className={myTurn(g) ? primary : button} onClick={() => setOpen(g.id)}>
                      {myTurn(g) ? 'Gooien' : 'Bekijken'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {ended.length > 0 && (
            <section aria-label="Gespeeld" className="space-y-1">
              <h3 className="font-medium">Gespeeld</h3>
              <ul className="space-y-1 text-sm">
                {ended.map((g) => (
                  <li key={g.id} className="flex gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {opponentOf(g)} · {g.mode}
                    </span>
                    <span className="text-nx-muted">{onlineLine(g)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Invite({ friends, onInvite }: { friends: FriendEntry[]; onInvite: (friend: string, options: { mode: number; legsToWin: number; setsToWin: number; doubleOut: boolean }) => Promise<void> }) {
  const [friend, setFriend] = useState('')
  const [mode, setMode] = useState(501)
  const [legs, setLegs] = useState(3)
  const [doubleOut, setDoubleOut] = useState(true)
  const [busy, setBusy] = useState(false)
  if (friends.length === 0) return <p className="text-nx-muted">Voeg eerst een vriend toe in de app Vrienden, dan kun je hem hier uitdagen.</p>
  const chosen = friend || friends[0].userId
  return (
    <form
      aria-label="Vriend uitdagen"
      className="flex flex-wrap items-end gap-2 rounded-lg border border-nx-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void onInvite(chosen, { mode, legsToWin: toWinFromBestOf(legs), setsToWin: 1, doubleOut }).finally(() => setBusy(false))
      }}
    >
      <label className="flex flex-col gap-1">
        Vriend
        <select className={field} value={chosen} onChange={(e) => setFriend(e.target.value)}>
          {friends.map((f) => (
            <option key={f.userId} value={f.userId}>
              {f.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Spel
        <select className={field} value={mode} onChange={(e) => setMode(Number(e.target.value))}>
          {DARTS_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Best of
        <select className={field} value={legs} onChange={(e) => setLegs(Number(e.target.value))}>
          {Array.from({ length: MAX_LEGS_TO_WIN }, (_, i) => bestOf(i + 1)).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'leg' : 'legs'}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-2">
        <input type="checkbox" checked={doubleOut} onChange={(e) => setDoubleOut(e.target.checked)} />
        Double-out
      </label>
      <button type="submit" className={primary} disabled={busy}>
        Uitdagen
      </button>
    </form>
  )
}

function Board({ game, online, onBack, act }: { game: OnlineGame; online: DartsOnline; onBack: () => void; act: (work: () => Promise<unknown>) => Promise<void> }) {
  const [score, setScore] = useState('')
  const [finishDarts, setFinishDarts] = useState(3)
  const m = replayOnline(game)
  const turn = myTurn(game)
  const mine = remaining(m, game.side)
  const route = turn ? checkoutRoute(mine, m.doubleOut) : null
  const n = Number(score)
  const valid = score !== '' && Number.isInteger(n) && n >= 0 && n <= 180
  const finishing = valid && n === mine
  const send = (value: number) => act(() => online.throwVisit(game.id, game.visits.length, value, value === mine ? finishDarts : 3)).then(() => setScore(''))

  return (
    <section aria-label="Online match" className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className={small} onClick={onBack}>
          ‹ Terug
        </button>
        <span className="text-sm text-nx-muted">
          {game.mode} · {m.doubleOut ? 'double-out' : 'single-out'} · best of {bestOf(m.legsToWin)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {m.players.map((name, i) => {
          const avg = playerAverage(m, i)
          const throwing = m.winner === null && toThrow(m) === i
          return (
            <div key={i} className={`rounded-lg border p-3 ${throwing ? 'border-nx-accent' : 'border-nx-border'}`}>
              <p className="truncate text-sm">
                {name}
                {i === game.side ? ' (jij)' : ''}
              </p>
              <p className="text-3xl font-semibold tabular-nums">{remaining(m, i)}</p>
              <p className="text-xs text-nx-muted">
                Legs {legsWon(m, i)}
                {avg !== null && ` · gem. ${avg.toFixed(1)}`}
              </p>
            </div>
          )
        })}
      </div>
      <p role="status">{onlineLine(game)}</p>
      {turn ? (
        <form
          aria-label="Jouw beurt"
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) void send(n)
          }}
        >
          {route && <p className="text-sm text-nx-muted">Uitgooien: {route.join(' ')}</p>}
          <div className="flex flex-wrap gap-2">
            <input type="number" min={0} max={180} inputMode="numeric" aria-label="Score van je beurt" value={score} onChange={(e) => setScore(e.target.value)} className={`${field} w-24`} />
            {finishing && (
              <select aria-label="Pijlen voor de finish" className={field} value={finishDarts} onChange={(e) => setFinishDarts(Number(e.target.value))}>
                {[1, 2, 3].map((d) => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? 'pijl' : 'pijlen'}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" className={primary} disabled={!valid}>
              Invoeren
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {QUICK.map((q) => (
              <button key={q} type="button" className={small} onClick={() => void send(q)}>
                {q}
              </button>
            ))}
            <button type="button" className={small} onClick={() => void send(0)}>
              Geen score
            </button>
          </div>
        </form>
      ) : (
        <p className="text-nx-muted">Wacht op {opponentOf(game)}. De stand komt vanzelf binnen.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {canUndoOnline(game) && (
          <button type="button" className={button} onClick={() => void act(() => online.undo(game.id, game.visits.length))}>
            Laatste beurt terug
          </button>
        )}
        <button type="button" className={button} onClick={() => void act(() => online.end(game.id, 'stopped')).then(onBack)}>
          Match stoppen
        </button>
      </div>
    </section>
  )
}
