import { useEffect, useState } from 'react'
import { birthdayWhen, upcomingFriendBirthdays, type FriendBirthdayRow, type SystemMessage } from '@nexus/core'
import { setSystemUnread, type Birthdays } from './birthdaysApi'

const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function SetupHint({ problem, what }: { problem: string; what: string }) {
  return problem.startsWith('setup:') ? (
    <p className="rounded-md border border-amber-500/40 p-2 text-xs text-amber-700 dark:text-amber-300">
      {what} heeft nog een stap in de database nodig: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
    </p>
  ) : (
    <p role="alert" className="text-xs text-red-600">
      {problem}
    </p>
  )
}

/** A list of birthdays, soonest first; today gets a cake. */
export function BirthdayList({ rows, now = new Date(), limit = 8, label }: { rows: FriendBirthdayRow[]; now?: Date; limit?: number; label: string }) {
  const [all, setAll] = useState(false)
  const list = upcomingFriendBirthdays(rows, now)
  const shown = all ? list : list.slice(0, limit)
  return (
    <>
      <ul aria-label={label} className="space-y-1">
        {shown.map((b, i) => (
          <li key={`${b.name}-${b.monthDay}-${i}`} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${b.days === 0 ? 'border-nx-accent bg-nx-accent/10' : 'border-nx-border'}`}>
            <span className="min-w-0 flex-1 truncate">{b.name}</span>
            <span className={`text-xs ${b.days === 0 ? 'font-medium' : 'text-nx-muted'}`}>{birthdayWhen(b.days, b.monthDay)}</span>
          </li>
        ))}
      </ul>
      {list.length > shown.length && (
        <button type="button" className={small} onClick={() => setAll(true)}>
          Toon alle {list.length}
        </button>
      )}
    </>
  )
}

/** Vrienden › Verjaardagen: when your friends are jarig (day and month only). */
export function FriendBirthdays({ api, refresh = 0 }: { api: Birthdays; refresh?: number }) {
  const [rows, setRows] = useState<FriendBirthdayRow[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api.friends().then(
      (r) => live && (setRows(r), setProblem(null)),
      (err: unknown) => live && setProblem(message(err)),
    )
    return () => {
      live = false
    }
  }, [api, refresh])
  return (
    <section className="space-y-2">
      <h3 className="font-medium">Verjaardagen</h3>
      {problem && <SetupHint problem={problem} what="Verjaardagen" />}
      {rows && rows.length === 0 && <p className="text-xs text-nx-muted">Nog geen verjaardagen. Vrienden die hun verjaardag invulden bij Over jou, staan hier.</p>}
      {rows && rows.length > 0 && <BirthdayList rows={rows} label="Verjaardagen van vrienden" />}
      <p className="text-xs text-nx-muted">Je eigen verjaardag vul je in bij Profielen › Over jou. Vrienden zien alleen de dag en de maand, nooit het jaar.</p>
    </section>
  )
}

/** Berichten › Van NEXUS: messages NEXUS itself sent you, such as "Gelukkige verjaardag". */
export function SystemInbox({ api, onOpenFriend, canOpen }: { api: Birthdays; onOpenFriend: (userId: string) => void; canOpen: (userId: string) => boolean }) {
  const [list, setList] = useState<SystemMessage[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api.inbox().then(
      (l) => {
        if (!live) return
        setList(l)
        setProblem(null)
        // Seen here: they count as read, also for the badge.
        if (l.some((m) => m.readAt === null)) void api.markRead(null).then(() => setSystemUnread(0), () => {})
      },
      (err: unknown) => live && setProblem(message(err)),
    )
    return () => {
      live = false
    }
  }, [api])
  if (problem) return problem.startsWith('setup:') ? null : <SetupHint problem={problem} what="Berichten van NEXUS" />
  if (list.length === 0) return null
  return (
    <section aria-label="Berichten van NEXUS" className="space-y-1">
      <h3 className="text-sm font-medium">Van NEXUS</h3>
      <ul className="space-y-1">
        {list.map((m) => (
          <li key={m.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${m.readAt === null ? 'border-nx-accent bg-nx-accent/10' : 'border-nx-border'}`}>
            <span aria-hidden className="text-lg leading-none">
              {m.kind === 'birthday' ? '🎉' : '🎂'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{m.title}</span>
              <span className="block text-sm">{m.body}</span>
              <span className="block text-[11px] text-nx-muted">{when(m.createdAt)}</span>
            </span>
            {m.kind === 'friend_birthday' && m.aboutUser && canOpen(m.aboutUser) && (
              <button type="button" className={small} onClick={() => onOpenFriend(m.aboutUser!)}>
                Feliciteer
              </button>
            )}
            <button type="button" className={small} aria-label={`${m.title} verwijderen`} onClick={() => void api.remove(m.id).then(() => setList((old) => old.filter((o) => o.id !== m.id)), (err: unknown) => setProblem(message(err)))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Beheer › Verjaardagen: everyone who filled in a birthday. */
export function AdminBirthdays({ api }: { api: Birthdays }) {
  const [rows, setRows] = useState<FriendBirthdayRow[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api.all().then(
      (r) => live && setRows(r),
      (err: unknown) => live && setProblem(message(err)),
    )
    return () => {
      live = false
    }
  }, [api])
  const today = rows ? upcomingFriendBirthdays(rows, new Date()).filter((b) => b.days === 0).length : 0
  return (
    <section className="space-y-2">
      <h3 className="font-medium">
        Verjaardagen
        {rows && <span className="ml-2 text-xs font-normal text-nx-muted">{today > 0 ? `${today} vandaag jarig · ` : ''}{rows.length} ingevuld</span>}
      </h3>
      {problem && <SetupHint problem={problem} what="Verjaardagen" />}
      {rows && rows.length === 0 && <p className="text-xs text-nx-muted">Nog niemand vulde een verjaardag in bij Over jou.</p>}
      {rows && rows.length > 0 && <BirthdayList rows={rows} label="Verjaardagen van alle accounts" />}
      <p className="text-xs text-nx-muted">Op de dag zelf stuurt NEXUS om 8 uur een bericht "Gelukkige verjaardag" naar de jarige.</p>
    </section>
  )
}
