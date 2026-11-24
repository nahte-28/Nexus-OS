import { useCallback, useEffect, useState } from 'react'
import { TOGETHER_BREAK, TOGETHER_FOCUS, TOGETHER_POLL_MS, TOGETHER_TITLE_MAX, togetherClock, togetherPhase, type TogetherSession } from '@nexus/core'
import { supabase } from '../sync/supabase'
import { logTogether, markJoined, StudyTogether } from './togetherApi'
import { showTogetherOnWatch } from './watch'

const defaultApi = supabase ? new StudyTogether(supabase) : null
const field = 'rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2 disabled:opacity-60'
const primary = 'rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text disabled:opacity-60'

function Problem({ text }: { text: string }) {
  if (text.startsWith('setup:')) {
    return (
      <p role="alert">
        Voor Samen studeren is nog één SQL-stap nodig: <code>{text.slice(6)}</code>. Kijk in Account › Database-check.
      </p>
    )
  }
  return <p role="alert">{text}</p>
}

/** Studie › Samen: start a focus session or join one of a friend or teammate, with one shared timer. */
export function Together({ api = defaultApi }: { api?: StudyTogether | null }) {
  const [user, setUser] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState<TogetherSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [focus, setFocus] = useState(25)
  const [pause, setPause] = useState(5)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    if (!api) return
    try {
      const ok = await api.signedIn()
      setUser(ok)
      if (!ok) return
      const list = await api.list()
      setSessions(list)
      showTogetherOnWatch(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api])

  useEffect(() => {
    void load()
    const poll = setInterval(() => void load(), TOGETHER_POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [user, load])

  const mine = sessions?.find((s) => s.joined) ?? null
  // A focus block that ended while you were in the session goes in your focus log.
  useEffect(() => {
    if (mine) logTogether(mine, now)
  }, [mine, now])

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await run()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (api && user === null) return <p className="text-nx-muted">Laden…</p>
  if (!api || !user) return <p className="text-nx-muted">Meld je aan in Account om samen te studeren met je vrienden en je teams.</p>
  const others = (sessions ?? []).filter((s) => !s.joined)
  return (
    <div className="space-y-4">
      <p className="text-nx-muted">Studeer samen met je vrienden en de mensen uit je teams: één timer voor iedereen, en je ziet wie meedoet. Elk focusblok dat je meedoet, komt in je focuslog.</p>
      {error && <Problem text={error} />}
      {mine ? (
        <Running session={mine} now={now} busy={busy} onLeave={() => act(() => api.leave(mine.id))} />
      ) : (
        <form
          aria-label="Sessie starten"
          className="space-y-2 rounded-lg border border-nx-border p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void act(async () => {
              const id = await api.start(title, focus, pause)
              markJoined(id, Date.now())
            })
          }}
        >
          <h3 className="font-medium">Sessie starten</h3>
          <label className="flex flex-col gap-1">
            Waaraan werk je?
            <input className={field} value={title} maxLength={TOGETHER_TITLE_MAX} placeholder="bv. Examen wiskunde" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              Focus
              <select className={field} value={focus} onChange={(e) => setFocus(Number(e.target.value))}>
                {TOGETHER_FOCUS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Pauze
              <select className={field} value={pause} onChange={(e) => setPause(Number(e.target.value))}>
                {TOGETHER_BREAK.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className={primary} disabled={busy}>
            Starten
          </button>
        </form>
      )}
      <section aria-label="Sessies van vrienden en teams" className="space-y-2">
        <h3 className="font-medium">Sessies van vrienden en teams</h3>
        {sessions === null && !error && <p className="text-nx-muted">Laden…</p>}
        {sessions !== null && others.length === 0 && <p className="text-nx-muted">Nu studeert niemand van je vrienden of teams samen.</p>}
        <ul className="space-y-2">
          {others.map((s) => {
            const p = togetherPhase(s, now)
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border px-3 py-2">
                <span className="font-medium">{s.title}</span>
                <span className="text-nx-muted">
                  van {s.host} · {s.focus}/{s.break} min · {p.phase === 'focus' ? 'focus' : 'pauze'} nog {togetherClock(p.left)} · {s.members.length} {s.members.length === 1 ? 'persoon' : 'personen'}
                </span>
                <button
                  type="button"
                  className={`${button} ml-auto`}
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api.join(s.id)
                      markJoined(s.id, Date.now())
                    })
                  }
                >
                  Meedoen
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function Running({ session, now, busy, onLeave }: { session: TogetherSession; now: number; busy: boolean; onLeave: () => void }) {
  const p = togetherPhase(session, now)
  return (
    <section aria-label="Je sessie" className="space-y-3 rounded-lg border border-nx-accent p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{session.title}</h3>
        <span className="text-nx-muted">{session.mine ? 'jouw sessie' : `van ${session.host}`}</span>
      </div>
      <p className="text-xs font-semibold text-nx-accent">
        {p.phase === 'focus' ? 'Focus' : 'Pauze'} · blok {p.round}
      </p>
      <p className="font-mono text-5xl tabular-nums" role="timer" aria-live="off">
        {togetherClock(p.left)}
      </p>
      <div>
        <p className="text-nx-muted">Studeren mee ({session.members.length}):</p>
        <ul className="flex flex-wrap gap-1">
          {session.members.map((m, i) => (
            <li key={`${m.name}-${i}`} className="rounded-full border border-nx-border px-2 py-0.5">
              {m.name}
              {m.me && <span className="text-nx-muted"> (jij)</span>}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2 disabled:opacity-60" disabled={busy} onClick={onLeave}>
        {session.mine ? 'Sessie stoppen' : 'Weggaan'}
      </button>
      {session.mine && <p className="text-xs text-nx-muted">Stop je de sessie, dan stopt ze voor iedereen.</p>}
    </section>
  )
}
