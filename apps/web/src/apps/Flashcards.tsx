import { useEffect, useState, useSyncExternalStore } from 'react'
import { activeDecks, cardsOf, deckStats, dueCards, GRADE_LABELS, intervalLabel, MAX_CARD_TEXT, nextInterval, type CardGrade, type Flashcard } from '@nexus/core'
import { studyPayload } from '../files/study'
import { addCards, addDeck, answerCard, editCard, flashcardsStore, flashcardsSyncProblem, makeCards, removeCard, removeDeck, renameDeck } from '../flashcards/store'
import { useNotes } from '../state/useNotes'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const smallButton = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const GRADES: CardGrade[] = ['again', 'hard', 'good', 'easy']

const useFlashcards = () => useSyncExternalStore(flashcardsStore.subscribe, flashcardsStore.getSnapshot)

type View = { name: 'home' } | { name: 'deck'; id: string } | { name: 'practice'; deckId?: string } | { name: 'make'; deckId?: string }

/** Leerkaarten: flashcards per vak, made by hand or by NEXUS AI, asked again on a smart schedule. */
export function Flashcards() {
  const [view, setView] = useState<View>({ name: 'home' })
  const problem = useSyncExternalStore(flashcardsSyncProblem.subscribe, flashcardsSyncProblem.getSnapshot)
  return (
    <div className="h-full space-y-4 overflow-y-auto p-4 text-sm">
      {problem?.startsWith('setup:') && (
        <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          Je leerkaarten staan alleen op dit apparaat: de database is nog niet bijgewerkt. Voer <code className="font-mono text-xs">{problem.slice(6)}</code> uit in de SQL Editor van Supabase.
        </p>
      )}
      {view.name === 'home' && <Home onOpen={(id) => setView({ name: 'deck', id })} onPractice={() => setView({ name: 'practice' })} onMake={() => setView({ name: 'make' })} />}
      {view.name === 'deck' && <DeckView id={view.id} onBack={() => setView({ name: 'home' })} onPractice={() => setView({ name: 'practice', deckId: view.id })} onMake={() => setView({ name: 'make', deckId: view.id })} />}
      {view.name === 'practice' && <Practice deckId={view.deckId} onDone={() => setView(view.deckId ? { name: 'deck', id: view.deckId } : { name: 'home' })} />}
      {view.name === 'make' && <Make deckId={view.deckId} onDone={(id) => setView(id ? { name: 'deck', id } : { name: 'home' })} />}
    </div>
  )
}

function Home({ onOpen, onPractice, onMake }: { onOpen: (id: string) => void; onPractice: () => void; onMake: () => void }) {
  const state = useFlashcards()
  const now = Date.now()
  const decks = activeDecks(state)
  const due = dueCards(state, now).length
  const [name, setName] = useState('')
  return (
    <>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Leerkaarten</h2>
        <p className="text-nx-muted">Kaarten die je kent komen pas na dagen of weken terug, kaarten die je vergeet meteen. Zo herhaal je alleen wat nodig is.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButton} disabled={due === 0} onClick={onPractice}>
            {due > 0 ? `Oefen nu (${due})` : 'Niets te herhalen'}
          </button>
          <button type="button" className={button} onClick={onMake}>
            Maken met NEXUS AI
          </button>
        </div>
      </section>
      <section aria-label="Stapels" className="space-y-2">
        <h3 className="font-medium">Stapels</h3>
        {decks.length === 0 && <p className="text-nx-muted">Nog geen stapels. Maak er een per vak, of laat NEXUS AI kaarten maken uit een notitie of bestand.</p>}
        <ul className="space-y-2">
          {decks.map((d) => {
            const s = deckStats(state, d.id, now)
            return (
              <li key={d.id}>
                <button type="button" onClick={() => onOpen(d.id)} className="flex w-full items-center gap-3 rounded-lg border border-nx-border bg-nx-surface-2 p-3 text-left hover:border-nx-accent">
                  <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                  <span className="shrink-0 text-xs text-nx-muted">
                    {s.total} kaarten{s.due > 0 ? `, ${s.due} te herhalen` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            onOpen(addDeck(name))
            setName('')
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nieuwe stapel, bv. Elektronica 1" aria-label="Naam van de stapel" className={field} />
          <button type="submit" className={button} disabled={!name.trim()}>
            Toevoegen
          </button>
        </form>
      </section>
    </>
  )
}

function DeckView({ id, onBack, onPractice, onMake }: { id: string; onBack: () => void; onPractice: () => void; onMake: () => void }) {
  const state = useFlashcards()
  const deck = activeDecks(state).find((d) => d.id === id)
  const now = Date.now()
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  if (!deck) {
    return (
      <button type="button" className={button} onClick={onBack}>
        ‹ Stapels
      </button>
    )
  }
  const stats = deckStats(state, id, now)
  const cards = cardsOf(state, id).sort((a, b) => a.createdAt - b.createdAt)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={smallButton} onClick={onBack}>
          ‹ Stapels
        </button>
        <input aria-label="Naam van de stapel" defaultValue={deck.name} maxLength={80} onBlur={(e) => e.target.value.trim() && e.target.value !== deck.name && renameDeck(id, e.target.value)} className={`${field} min-w-40 flex-1 text-lg font-semibold`} />
      </div>
      <p className="text-nx-muted">
        {stats.total} kaarten: {stats.due} te herhalen, {stats.fresh} nieuw, {stats.learned} goed gekend.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButton} disabled={stats.due === 0} onClick={onPractice}>
          {stats.due > 0 ? `Oefen (${stats.due})` : 'Niets te herhalen'}
        </button>
        <button type="button" className={button} onClick={onMake}>
          Kaarten maken met NEXUS AI
        </button>
        <button type="button" className={`${button} text-red-500`} onClick={() => window.confirm(`Stapel "${deck.name}" en al haar kaarten verwijderen?`) && (removeDeck(id), onBack())}>
          Stapel verwijderen
        </button>
      </div>
      <form
        aria-label="Nieuwe kaart"
        className="space-y-2 rounded-lg border border-nx-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          addCards(id, [{ front, back }])
          setFront('')
          setBack('')
        }}
      >
        <textarea value={front} onChange={(e) => setFront(e.target.value)} maxLength={MAX_CARD_TEXT} rows={2} placeholder="Vraag" aria-label="Vraag" className={field} />
        <textarea value={back} onChange={(e) => setBack(e.target.value)} maxLength={MAX_CARD_TEXT} rows={2} placeholder="Antwoord" aria-label="Antwoord" className={field} />
        <button type="submit" className={button} disabled={!front.trim() || !back.trim()}>
          Kaart toevoegen
        </button>
      </form>
      <ul aria-label="Kaarten" className="space-y-2">
        {cards.map((c) => (
          <CardRow key={c.id} card={c} now={now} editing={editing === c.id} onEdit={() => setEditing(editing === c.id ? null : c.id)} />
        ))}
      </ul>
    </>
  )
}

function CardRow({ card, now, editing, onEdit }: { card: Flashcard; now: number; editing: boolean; onEdit: () => void }) {
  const [front, setFront] = useState(card.front)
  const [back, setBack] = useState(card.back)
  const when = card.due <= now ? 'nu' : new Date(card.due).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
  if (!editing) {
    return (
      <li className="flex items-start gap-3 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap font-medium">{card.front}</p>
          <p className="whitespace-pre-wrap text-nx-muted">{card.back}</p>
        </div>
        <span className="shrink-0 text-xs text-nx-muted">{when}</span>
        <button type="button" className={smallButton} onClick={onEdit}>
          Wijzigen
        </button>
      </li>
    )
  }
  return (
    <li className="space-y-2 rounded-lg border border-nx-accent p-3">
      <textarea value={front} onChange={(e) => setFront(e.target.value)} maxLength={MAX_CARD_TEXT} rows={2} aria-label="Vraag" className={field} />
      <textarea value={back} onChange={(e) => setBack(e.target.value)} maxLength={MAX_CARD_TEXT} rows={2} aria-label="Antwoord" className={field} />
      <div className="flex gap-2">
        <button
          type="button"
          className={smallButton}
          disabled={!front.trim() || !back.trim()}
          onClick={() => {
            editCard(card.id, { front: front.trim(), back: back.trim() })
            onEdit()
          }}
        >
          Bewaren
        </button>
        <button type="button" className={`${smallButton} text-red-500`} onClick={() => removeCard(card.id)}>
          Verwijderen
        </button>
      </div>
    </li>
  )
}

/** One session: the cards due at the start; a forgotten card comes back at the end. */
function Practice({ deckId, onDone }: { deckId?: string; onDone: () => void }) {
  const state = useFlashcards()
  const [queue, setQueue] = useState(() => dueCards(flashcardsStore.getSnapshot(), Date.now(), deckId).map((c) => c.id))
  const [shown, setShown] = useState(false)
  const [done, setDone] = useState(0)
  const card = state.cards.find((c) => c.id === queue[0] && c.deletedAt === null)

  const answer = (grade: CardGrade) => {
    if (!card) return
    answerCard(card.id, grade)
    setQueue((q) => (grade === 'again' ? [...q.slice(1), q[0]] : q.slice(1)))
    if (grade !== 'again') setDone((n) => n + 1)
    setShown(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (!shown && (e.key === ' ' || e.key === 'Enter')) setShown(true)
      else if (shown && ['1', '2', '3', '4'].includes(e.key)) answer(GRADES[Number(e.key) - 1])
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // A card deleted elsewhere during the session is skipped.
  useEffect(() => {
    if (queue.length > 0 && !card) setQueue((q) => q.slice(1))
  }, [queue, card])

  if (queue.length === 0) {
    return (
      <section aria-label="Klaar" className="space-y-3 text-center">
        <p className="text-lg font-semibold">Klaar voor nu 🎉</p>
        <p className="text-nx-muted">{done === 1 ? '1 kaart herhaald.' : `${done} kaarten herhaald.`} De volgende komen terug wanneer het tijd is.</p>
        <button type="button" className={primaryButton} onClick={onDone}>
          Terug
        </button>
      </section>
    )
  }
  if (!card) return null
  return (
    <section aria-label="Oefenen" className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className={smallButton} onClick={onDone}>
          Stoppen
        </button>
        <span className="text-nx-muted">Nog {queue.length}</span>
      </div>
      <div className="min-h-32 rounded-xl border border-nx-border bg-nx-surface-2 p-5 text-center">
        <p className="whitespace-pre-wrap text-base font-medium">{card.front}</p>
        {shown && (
          <>
            <hr className="my-4 border-nx-border" />
            <p aria-label="Antwoord" className="whitespace-pre-wrap text-base">
              {card.back}
            </p>
          </>
        )}
      </div>
      {!shown ? (
        <button type="button" className={`${primaryButton} w-full`} onClick={() => setShown(true)}>
          Toon antwoord
        </button>
      ) : (
        <div role="group" aria-label="Hoe goed wist je het?" className="grid grid-cols-4 gap-2">
          {GRADES.map((g, i) => (
            <button key={g} type="button" className={`${button} flex flex-col items-center ${g === 'again' ? 'text-red-500' : ''}`} onClick={() => answer(g)} title={`Toets ${i + 1}`}>
              <span className="font-medium">{GRADE_LABELS[g]}</span>
              <span className="text-xs text-nx-muted">{intervalLabel(nextInterval(card, g))}</span>
            </button>
          ))}
        </div>
      )}
      <p className="hidden text-center text-xs text-nx-muted sm:block">Spatie toont het antwoord, 1 tot 4 kiest.</p>
    </section>
  )
}

/** NEXUS AI makes cards from a note or a file; you check them before they go in a deck. */
function Make({ deckId, onDone }: { deckId?: string; onDone: (deckId?: string) => void }) {
  const state = useFlashcards()
  const decks = activeDecks(state)
  const { notes } = useNotes()
  const [source, setSource] = useState<'note' | 'file'>('note')
  const [noteId, setNoteId] = useState(notes[0]?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [count, setCount] = useState(20)
  const [focus, setFocus] = useState('')
  const [target, setTarget] = useState(deckId ?? decks[0]?.id ?? '')
  const [newName, setNewName] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [cards, setCards] = useState<Array<{ front: string; back: string; keep: boolean }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const note = notes.find((n) => n.id === noteId)

  const start = () => {
    setError(null)
    setProgress(0)
    void (async () => {
      try {
        const name = source === 'note' ? note?.title || 'Notitie' : (file?.name ?? '')
        const payload = source === 'note' ? { kind: 'text' as const, data: `${note?.title ?? ''}\n\n${note?.body ?? ''}`.trim() } : await studyPayload(file!.name, file!)
        if (!payload.data.trim()) throw new Error('Deze notitie is leeg.')
        const made = await makeCards(name, payload, { count, focus }, setProgress)
        setCards(made.map((c) => ({ ...c, keep: true })))
        if (!target && !newName) setNewName(name.replace(/\.[^.]+$/, '').slice(0, 80))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setProgress(null)
      }
    })()
  }

  const save = () => {
    if (!cards) return
    const id = target || addDeck(newName || 'Nieuwe stapel')
    addCards(id, cards.filter((c) => c.keep))
    onDone(id)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" className={smallButton} onClick={() => onDone(deckId)}>
          ‹ Terug
        </button>
        <h2 className="text-lg font-semibold">Kaarten maken met NEXUS AI</h2>
      </div>
      {!cards && (
        <fieldset disabled={progress !== null} className="space-y-3">
          <p className="text-nx-muted">NEXUS AI leest een notitie of bestand en maakt er vragen en antwoorden van. Je kiest daarna welke je houdt. Het bestand gaat alleen voor deze vraag naar de AI.</p>
          <div role="group" aria-label="Bron" className="flex gap-1">
            {(['note', 'file'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)} className={`rounded-full border border-nx-border px-3 py-1 ${source === s ? 'bg-nx-accent font-medium text-nx-accent-text' : 'hover:bg-nx-surface-2'}`}>
                {s === 'note' ? 'Notitie' : 'Bestand'}
              </button>
            ))}
          </div>
          {source === 'note' ? (
            <select aria-label="Notitie" value={noteId} onChange={(e) => setNoteId(e.target.value)} className={field}>
              {notes.length === 0 && <option value="">Nog geen notities</option>}
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title || 'Zonder titel'}
                </option>
              ))}
            </select>
          ) : (
            <input type="file" aria-label="Bestand" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          )}
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0">Aantal</span>
            <input type="number" aria-label="Aantal kaarten" min={5} max={60} value={count} onChange={(e) => setCount(Math.min(60, Math.max(5, Number(e.target.value) || 20)))} className={`${field} w-24`} />
          </label>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={500} placeholder="Wens (optioneel), bv. alleen de formules" aria-label="Wens" className={field} />
          <div className="flex items-center gap-2">
            <button type="button" className={primaryButton} onClick={start} disabled={source === 'note' ? !note : !file}>
              {progress !== null ? `Bezig… ${progress} kaarten` : 'Kaarten maken'}
            </button>
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      {cards && (
        <section aria-label="Voorstel" className="space-y-3">
          <p>
            {cards.filter((c) => c.keep).length} van {cards.length} kaarten gekozen.
          </p>
          <ul className="space-y-2">
            {cards.map((c, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
                <input type="checkbox" className="mt-1 size-4" checked={c.keep} aria-label={`Kaart ${i + 1} houden`} onChange={(e) => setCards(cards.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap font-medium">{c.front}</p>
                  <p className="whitespace-pre-wrap text-nx-muted">{c.back}</p>
                </div>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0">In stapel</span>
            <select aria-label="Stapel" value={target} onChange={(e) => setTarget(e.target.value)} className={field}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value="">Nieuwe stapel…</option>
            </select>
          </label>
          {!target && <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder="Naam van de nieuwe stapel" aria-label="Naam van de nieuwe stapel" className={field} />}
          <div className="flex gap-2">
            <button type="button" className={primaryButton} disabled={!cards.some((c) => c.keep) || (!target && !newName.trim())} onClick={save}>
              Toevoegen
            </button>
            <button type="button" className={button} onClick={() => setCards(null)}>
              Opnieuw
            </button>
          </div>
        </section>
      )}
    </>
  )
}
