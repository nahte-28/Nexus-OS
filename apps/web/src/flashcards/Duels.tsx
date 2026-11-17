import { useEffect, useRef, useState } from 'react'
import { activeDecks, buildDuel, cardsOf, duelLine, duelToPlay, type CardDuel, type FriendEntry } from '@nexus/core'
import { useFeature } from '../features/store'
import { Friends } from '../friends/friends'
import { supabase } from '../sync/supabase'
import { duelsApi, useDuels } from './duel'
import { flashcardsStore } from './store'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const smallButton = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const defaultFriends: Pick<Friends, 'list'> | null = supabase ? new Friends(supabase) : null

function Problem({ text }: { text: string }) {
  if (text.startsWith('setup:')) {
    return (
      <p role="alert" className="rounded-lg border border-nx-border bg-nx-surface-2 p-3 text-sm">
        Voor duels is nog één SQL-stap nodig: <code className="font-mono text-xs">{text.slice(6)}</code>. Kijk in Account › Database-check.
      </p>
    )
  }
  return (
    <p role="alert" className="text-sm text-red-500">
      {text}
    </p>
  )
}

function useWork(): { busy: boolean; error: string | null; run: (work: () => Promise<void>) => Promise<boolean> } {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

/** Leerkaarten home: your duels, the ones to play first. */
export function DuelsSection({ onPlay }: { onPlay: (id: string) => void }) {
  const on = useFeature('friends')
  const { duels, error: syncError } = useDuels()
  const { busy, error, run } = useWork()
  if (!on || (duels === null && !syncError)) return null
  const list = [...(duels ?? [])].sort((a, b) => Number(duelToPlay(b)) - Number(duelToPlay(a)) || b.createdAt - a.createdAt).slice(0, 12)
  const decline = (d: CardDuel) =>
    run(async () => {
      const connection = duelsApi()
      if (!connection) throw new Error('Meld je aan om te antwoorden.')
      await connection.api.decline(d.id)
      await connection.refresh()
    })
  return (
    <section aria-label="Duels" className="space-y-2">
      <h3 className="font-medium">Duels met vrienden</h3>
      {list.length === 0 && <p className="text-nx-muted">Nog geen duels. Open een stapel en daag een vriend uit: jullie beantwoorden dezelfde vragen, en wie de meeste juist heeft, wint.</p>}
      <ul className="space-y-2">
        {list.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border p-2">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{d.deckName || 'Duel'}</span> <span className="text-xs text-nx-muted">tegen {d.otherName}</span>
              <span className="block text-xs text-nx-muted">{duelLine(d)}</span>
            </span>
            {duelToPlay(d) && (
              <button type="button" className={primaryButton} disabled={busy} onClick={() => onPlay(d.id)} aria-label={`Duel tegen ${d.otherName} spelen`}>
                Spelen
              </button>
            )}
            {duelToPlay(d) && d.side === 1 && (
              <button type="button" className={smallButton} disabled={busy} onClick={() => void decline(d)} aria-label={`Duel van ${d.otherName} afslaan`}>
                Afslaan
              </button>
            )}
            {d.myPicks !== null && (
              <button type="button" className={smallButton} onClick={() => onPlay(d.id)} aria-label={`Duel tegen ${d.otherName} bekijken`}>
                Bekijken
              </button>
            )}
          </li>
        ))}
      </ul>
      {(error ?? syncError) && <Problem text={(error ?? syncError)!} />}
    </section>
  )
}

/** A deck: challenge a friend with it. You play it too, right after. */
export function ChallengeFriend({ deckId, onPlay, friendsApi = defaultFriends }: { deckId: string; onPlay: (id: string) => void; friendsApi?: Pick<Friends, 'list'> | null }) {
  const on = useFeature('friends')
  const { duels } = useDuels()
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState<FriendEntry[] | null>(null)
  const [chosen, setChosen] = useState('')
  const { busy, error, run } = useWork()

  useEffect(() => {
    if (!open || friends || !friendsApi) return
    let live = true
    friendsApi
      .list()
      .then((list) => live && setFriends(list.filter((f) => f.kind === 'friend')))
      .catch(() => live && setFriends([]))
    return () => {
      live = false
    }
  }, [open, friends, friendsApi])

  if (!on || duels === null) return null
  const challenge = () =>
    run(async () => {
      const connection = duelsApi()
      if (!connection) throw new Error('Meld je aan om een vriend uit te dagen.')
      const state = flashcardsStore.getSnapshot()
      const deck = activeDecks(state).find((d) => d.id === deckId)
      const built = buildDuel(cardsOf(state, deckId))
      if ('error' in built) throw new Error(built.error)
      const id = await connection.api.create(chosen, deck?.name ?? '', built.questions, built.answers)
      await connection.refresh()
      onPlay(id)
    })

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="text-sm">
      <summary className="cursor-pointer underline">Daag een vriend uit</summary>
      <div className="mt-2 space-y-2 rounded-lg border border-nx-border p-3">
        <p className="text-xs text-nx-muted">NEXUS maakt van hoogstens 10 kaarten meerkeuzevragen. Jullie beantwoorden dezelfde vragen, en wie de meeste juist heeft, wint (bij gelijkspel de snelste). Je vriend ziet de vragen en antwoorden van deze kaarten.</p>
        {friends === null ? (
          <p className="text-xs text-nx-muted">Vrienden laden…</p>
        ) : friends.length === 0 ? (
          <p className="text-xs text-nx-muted">Je hebt nog geen vrienden in NEXUS. Voeg ze toe in de app Vrienden.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-3 gap-y-1" role="radiogroup" aria-label="Kies een vriend">
              {friends.map((f) => (
                <label key={f.userId} className="flex items-center gap-1">
                  <input type="radio" name={`duel-${deckId}`} checked={chosen === f.userId} onChange={() => setChosen(f.userId)} className="accent-[var(--nx-accent)]" />
                  {f.displayName}
                </label>
              ))}
            </div>
            <button type="button" className={primaryButton} disabled={busy || !chosen} onClick={() => void challenge()}>
              Uitdagen en zelf spelen
            </button>
          </>
        )}
        {error && <Problem text={error} />}
      </div>
    </details>
  )
}

/** Plays a duel: one question at a time, four answers. After the last one the database counts. */
export function DuelPlay({ id, onDone }: { id: string; onDone: () => void }) {
  const { duels } = useDuels()
  const duel = duels?.find((d) => d.id === id)
  const [picks, setPicks] = useState<number[]>([])
  const started = useRef(Date.now())
  const { busy, error, run } = useWork()

  if (!duel) {
    return (
      <button type="button" className={button} onClick={onDone}>
        ‹ Terug
      </button>
    )
  }
  const total = duel.questions.length
  const submit = (all: number[]) =>
    run(async () => {
      const connection = duelsApi()
      if (!connection) throw new Error('Meld je aan om het duel te spelen.')
      await connection.api.play(duel.id, all, Date.now() - started.current)
      await connection.refresh()
    })

  // Played: every question with what you picked and the right answer.
  if (duel.myPicks !== null) {
    return (
      <section aria-label="Uitslag" className="space-y-3">
        <div className="flex items-center gap-2">
          <button type="button" className={smallButton} onClick={onDone}>
            ‹ Terug
          </button>
          <h3 className="font-medium">{duel.deckName || 'Duel'} tegen {duel.otherName}</h3>
        </div>
        <p className="text-base font-semibold">{duelLine(duel)}</p>
        <ol className="space-y-2">
          {duel.questions.map((q, i) => {
            const mine = duel.myPicks?.[i] ?? -1
            const right = duel.answers?.[i] ?? -1
            return (
              <li key={i} className="rounded-lg border border-nx-border p-2">
                <p className="font-medium">
                  {mine === right ? '✓' : '✗'} {q.front}
                </p>
                {mine !== right && mine >= 0 && <p className="text-xs text-red-500">Jij: {q.options[mine]}</p>}
                {right >= 0 && <p className="text-xs text-nx-muted">Juist: {q.options[right]}</p>}
              </li>
            )
          })}
        </ol>
      </section>
    )
  }

  const index = picks.length
  const question = duel.questions[index]
  const pick = (option: number) => {
    const all = [...picks, option]
    setPicks(all)
    if (all.length === total) void submit(all)
  }
  return (
    <section aria-label="Duel" className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className={smallButton} onClick={onDone} disabled={busy}>
          Stoppen
        </button>
        <span className="text-nx-muted">
          Vraag {Math.min(index + 1, total)} van {total} · tegen {duel.otherName}
        </span>
      </div>
      {question ? (
        <>
          <div className="min-h-24 rounded-xl border border-nx-border bg-nx-surface-2 p-5 text-center">
            <p className="whitespace-pre-wrap text-base font-medium">{question.front}</p>
          </div>
          <div role="group" aria-label="Antwoorden" className="grid gap-2 sm:grid-cols-2">
            {question.options.map((o, i) => (
              <button key={i} type="button" className={`${button} text-left`} onClick={() => pick(i)}>
                {o}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-nx-muted">{busy ? 'Even tellen…' : 'Klaar.'}</p>
      )}
      {error && (
        <>
          <Problem text={error} />
          <button type="button" className={button} disabled={busy} onClick={() => void submit(picks)}>
            Opnieuw versturen
          </button>
        </>
      )}
    </section>
  )
}
