import { useEffect, useState } from 'react'
import { canInvite, type FreeSlot, INVITE_MAX_FRIENDS, INVITE_STATUS_LABELS, invitesFor, openInvites, type Appointment, type AppointmentInvite, type FriendEntry } from '@nexus/core'
import { useFeature } from '../features/store'
import { Friends } from '../friends/friends'
import { supabase } from '../sync/supabase'
import { invitesApi, useInvites } from './invitesApi'
import { findFreeMoments, setFreeBusyShares, useFreeBusy } from '../friends/freeBusy'
import { lifeStore } from '../life/store'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Problem({ text }: { text: string }) {
  if (text.startsWith('setup:')) {
    return (
      <p role="alert" className="rounded-lg border border-nx-border bg-nx-surface-2 p-3 text-sm">
        Om vrienden uit te nodigen is nog één SQL-stap nodig: <code className="font-mono text-xs">{text.slice(6)}</code>. Kijk in Account › Database-check.
      </p>
    )
  }
  return (
    <p role="alert" className="text-sm text-nx-danger">
      {text}
    </p>
  )
}

/** Runs [work] with a busy flag and a Dutch error, then reads the invites again. */
function useAction(): { busy: boolean; error: string | null; run: (work: () => Promise<void>) => Promise<void> } {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      await invitesApi()?.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

/** Agenda: invites from friends that wait for your answer. */
export function InviteInbox({ now = Date.now() }: { now?: number }) {
  const on = useFeature('friends')
  const { invites } = useInvites()
  const { busy, error, run } = useAction()
  const open = on && invites ? openInvites(invites, now) : []
  if (open.length === 0 && !error) return null
  const answer = (inv: AppointmentInvite, accept: boolean) =>
    run(async () => {
      const connection = invitesApi()
      if (!connection) throw new Error('Meld je aan om te antwoorden.')
      await connection.api.answer(inv.id, accept)
    })
  return (
    <section aria-label="Uitnodigingen" className="space-y-2 rounded-lg border border-nx-accent/50 bg-nx-surface-2 p-3">
      <h3 className="text-sm font-semibold">Uitnodigingen</h3>
      <ul className="space-y-2">
        {open.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{inv.title}</p>
              <p className="text-xs text-nx-muted">
                Van {inv.otherName} · {when(inv.startAt)}
                {inv.location ? ` · ${inv.location}` : ''}
              </p>
              {inv.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-nx-muted">{inv.notes}</p>}
            </div>
            <button type="button" className={primaryButton} disabled={busy} onClick={() => void answer(inv, true)} aria-label={`${inv.title} aanvaarden`}>
              Aanvaarden
            </button>
            <button type="button" className={button} disabled={busy} onClick={() => void answer(inv, false)} aria-label={`${inv.title} afslaan`}>
              Afslaan
            </button>
          </li>
        ))}
      </ul>
      {error && <Problem text={error} />}
    </section>
  )
}

/** On your copy of an invite: who invited you; deleting it declines. */
export function InvitedBy({ appointmentId }: { appointmentId: string }) {
  const on = useFeature('friends')
  const inv = useInvites().copies[appointmentId]
  if (!on || !inv) return null
  return <p className="text-xs text-nx-muted">👥 Uitnodiging van {inv.otherName}. Verandert {inv.otherName} de afspraak, dan verandert ze hier mee.</p>
}

const defaultFriends: Pick<Friends, 'list'> | null = supabase ? new Friends(supabase) : null

/** On your own appointment: invite friends and see who comes. */
export function InviteFriends({ appointment: a, friendsApi = defaultFriends }: { appointment: Appointment; friendsApi?: Pick<Friends, 'list'> | null }) {
  const on = useFeature('friends')
  const { invites, copies, error: syncError } = useInvites()
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState<FriendEntry[] | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const { busy, error, run } = useAction()

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

  if (!on || copies[a.id] || !canInvite(a) || invites === null) return null
  const sent = invitesFor(invites, a.id).filter((i) => i.status !== 'cancelled')
  const invited = new Set(sent.map((i) => i.other))
  const free = (friends ?? []).filter((f) => !invited.has(f.userId))
  const room = INVITE_MAX_FRIENDS - sent.length

  const send = () =>
    run(async () => {
      const connection = invitesApi()
      if (!connection) throw new Error('Meld je aan om vrienden uit te nodigen.')
      for (const id of chosen) await connection.api.invite(id, a)
      setChosen([])
    })
  const takeBack = (inv: AppointmentInvite) =>
    run(async () => {
      const connection = invitesApi()
      if (!connection) throw new Error('Meld je aan om de uitnodiging in te trekken.')
      await connection.api.cancel(a.id, inv.other)
    })

  return (
    <div className="mt-1 space-y-1 text-sm">
      {sent.length > 0 && (
        <p className="text-xs text-nx-muted" aria-label={`Uitgenodigd voor ${a.title}`}>
          👥 {sent.map((i) => `${i.otherName} (${INVITE_STATUS_LABELS[i.status]})`).join(', ')}
        </p>
      )}
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-xs underline">Vrienden uitnodigen</summary>
        <div className="mt-2 space-y-2 rounded-lg border border-nx-border p-2">
          {sent.length > 0 && (
            <ul className="space-y-1">
              {sent.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2">
                  <span>
                    {inv.otherName} <span className="text-xs text-nx-muted">{INVITE_STATUS_LABELS[inv.status]}</span>
                  </span>
                  <button type="button" className={button} disabled={busy} onClick={() => void takeBack(inv)} aria-label={`Uitnodiging van ${inv.otherName} intrekken`}>
                    Intrekken
                  </button>
                </li>
              ))}
            </ul>
          )}
          {friends === null ? (
            <p className="text-xs text-nx-muted">Vrienden laden…</p>
          ) : free.length === 0 ? (
            <p className="text-xs text-nx-muted">{friends.length === 0 ? 'Je hebt nog geen vrienden in NEXUS. Voeg ze toe in de app Vrienden.' : 'Al je vrienden zijn uitgenodigd.'}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-3 gap-y-1" role="group" aria-label="Kies vrienden">
                {free.map((f) => (
                  <label key={f.userId} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={chosen.includes(f.userId)}
                      disabled={!chosen.includes(f.userId) && chosen.length >= room}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...c, f.userId] : c.filter((id) => id !== f.userId)))}
                      className="accent-[var(--nx-accent)]"
                    />
                    {f.displayName}
                  </label>
                ))}
              </div>
              <button type="button" className={primaryButton} disabled={busy || chosen.length === 0} onClick={() => void send()}>
                Uitnodigen
              </button>
            </>
          )}
          {friends !== null && friends.length > 0 && <FreeMoment appointment={a} friends={chosen.length > 0 ? chosen : sent.map((i) => i.other)} />}
          <p className="text-xs text-nx-muted">Wie aanvaardt, krijgt de afspraak in zijn eigen Agenda. Je herinneringen gaan niet mee, je notities wel.</p>
          {(error ?? syncError) && <Problem text={(error ?? syncError)!} />}
        </div>
      </details>
    </div>
  )
}

/**
 * Samen vrij moment zoeken: moments in the coming week when you and the chosen (or invited) friends
 * are all free; picking one moves the appointment there. Also where you choose whether you share.
 */
function FreeMoment({ appointment: a, friends }: { appointment: Appointment; friends: string[] }) {
  const { shares, error: shareError } = useFreeBusy()
  const [found, setFound] = useState<{ slots: FreeSlot[]; hidden: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const work = async (job: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await job()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const minutes = Math.max(15, Math.round((a.endAt - a.startAt) / 60_000))
  const search = () => work(async () => setFound(await findFreeMoments(friends, minutes, a.id)))
  const move = (slot: FreeSlot) =>
    work(async () => {
      await lifeStore.updateAppointment(a.id, { startAt: slot.start, endAt: slot.end })
      setFound(null)
    })
  const series = Boolean(a.repeat)

  return (
    <div className="space-y-1 border-t border-nx-border pt-2">
      {!series && (
        <>
          <button type="button" className={button} disabled={busy || friends.length === 0} onClick={() => void search()}>
            Zoek een vrij moment
          </button>
          {friends.length === 0 && <p className="text-xs text-nx-muted">Kies eerst een of meer vrienden.</p>}
        </>
      )}
      {found && (
        <div className="space-y-1" aria-label="Vrije momenten">
          {found.slots.length === 0 ? (
            <p className="text-xs text-nx-muted">Geen moment van {minutes} minuten gevonden waarop jullie allemaal vrij zijn in de komende week.</p>
          ) : (
            <>
              <p className="text-xs text-nx-muted">Jullie zijn allemaal vrij op deze momenten. Tik er een aan om je afspraak daarheen te verzetten.</p>
              <div className="flex flex-wrap gap-1">
                {found.slots.map((slot) => (
                  <button key={slot.start} type="button" className={button} disabled={busy} onClick={() => void move(slot)}>
                    {when(slot.start)}
                  </button>
                ))}
              </div>
            </>
          )}
          {found.hidden.length > 0 && <p className="text-xs text-nx-muted">{found.hidden.join(', ')} deelt nog niet wanneer {found.hidden.length === 1 ? 'hij of zij' : 'ze'} bezet {found.hidden.length === 1 ? 'is' : 'zijn'}, dus daar kon NEXUS geen rekening mee houden.</p>}
        </div>
      )}
      {shares !== null && (
        <label className="flex items-center gap-2 text-xs text-nx-muted">
          <input type="checkbox" checked={shares} disabled={busy} onChange={(e) => void work(() => setFreeBusyShares(e.target.checked))} className="accent-[var(--nx-accent)]" />
          Vrienden zien wanneer ik bezet ben (niet wat)
        </label>
      )}
      {(error ?? shareError) && <Problem text={(error ?? shareError)!} />}
    </div>
  )
}
