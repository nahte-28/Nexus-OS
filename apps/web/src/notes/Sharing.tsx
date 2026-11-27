import { useEffect, useRef, useState } from 'react'
import { SHARE_MAX_ACCESS, shareLine, shareOfNote, type FriendEntry, type Note, type NoteShare, type StudyGroup } from '@nexus/core'
import { useFeature } from '../features/store'
import { Friends } from '../friends/friends'
import { supabase } from '../sync/supabase'
import { Teams } from '../teams/teams'
import { isStale, sharesApi, useShares } from './shares'

const button = 'rounded-md border border-nx-border px-2 py-1 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-md bg-nx-accent px-2 py-1 text-sm font-medium text-nx-accent-text disabled:opacity-60'

/** Whether notes can be shared here: with Vrienden or Teams on. */
export function useSharingOn(): boolean {
  const friends = useFeature('friends')
  const teams = useFeature('teams')
  return friends || teams
}

function Problem({ text }: { text: string }) {
  if (text.startsWith('setup:')) {
    return (
      <p role="alert" className="rounded-md border border-nx-border bg-nx-surface-2 p-2 text-sm">
        Om notities te delen is nog één SQL-stap nodig: <code className="font-mono text-xs">{text.slice(6)}</code>. Kijk in Account › Database-check.
      </p>
    )
  }
  return (
    <p role="alert" className="text-sm text-nx-danger">
      {text}
    </p>
  )
}

function connection() {
  const c = sharesApi()
  if (!c) throw new Error('Meld je aan om notities te delen.')
  return c
}

export interface SharingSources {
  friends: Pick<Friends, 'list'> | null
  teams: Pick<Teams, 'teams'> | null
}
const defaultSources: SharingSources = { friends: supabase ? new Friends(supabase) : null, teams: supabase ? new Teams(supabase) : null }

/** Notities: share the open note with friends or teams, to read or to edit along. */
export function SharePanel({ note, sources = defaultSources }: { note: Note; sources?: SharingSources }) {
  const { shares, error: syncError } = useShares()
  const share = shares ? shareOfNote(shares, note.id) : null
  const [friends, setFriends] = useState<FriendEntry[] | null>(null)
  const [teams, setTeams] = useState<StudyGroup[]>([])
  const [pick, setPick] = useState('')
  const [canEdit, setCanEdit] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    sources.friends
      ?.list()
      .then((list) => live && setFriends(list.filter((f) => f.kind === 'friend')))
      .catch(() => live && setFriends([]))
    sources.teams
      ?.teams()
      .then((list) => live && setTeams(list))
      .catch(() => live && setTeams([]))
    if (!sources.friends) setFriends([])
    return () => {
      live = false
    }
  }, [sources])

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      await sharesApi()?.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const access = share?.access ?? []
  const has = (kind: 'user' | 'group', id: string) => access.some((a) => a[kind] === id)
  const options = [
    ...(friends ?? []).filter((f) => !has('user', f.userId)).map((f) => ({ value: `user:${f.userId}`, label: f.displayName })),
    ...teams.filter((t) => !has('group', t.id)).map((t) => ({ value: `group:${t.id}`, label: `Team ${t.name}` })),
  ]

  const add = () =>
    run(async () => {
      const [kind, id] = pick.split(':') as ['user' | 'group', string]
      const { api } = connection()
      const shareId = share?.id ?? (await api.create(note.id, note.title, note.body))
      await api.grant(shareId, kind === 'user' ? { user: id } : { group: id }, canEdit)
      setPick('')
    })

  if (shares === null && !syncError) return <p className="text-sm text-nx-muted">Meld je aan om notities te delen.</p>

  return (
    <section aria-label="Notitie delen" className="space-y-2 rounded-lg border border-nx-border p-3 text-sm">
      {access.length > 0 && (
        <ul className="space-y-1" aria-label="Gedeeld met">
          {access.map((a) => {
            const to = a.user ? { user: a.user } : { group: a.group! }
            return (
              <li key={a.user ?? a.group} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">{a.group ? `Team ${a.name}` : a.name}</span>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={a.canEdit} disabled={busy} onChange={(e) => void run(() => connection().api.grant(share!.id, to, e.target.checked))} className="accent-[var(--nx-accent)]" />
                  mag bewerken
                </label>
                <button type="button" className={button} disabled={busy} onClick={() => void run(() => connection().api.revoke(share!.id, to))} aria-label={`Niet meer delen met ${a.name}`}>
                  Weg
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {friends === null ? (
        <p className="text-xs text-nx-muted">Vrienden en teams laden…</p>
      ) : options.length === 0 ? (
        <p className="text-xs text-nx-muted">{access.length === 0 ? 'Je hebt nog geen vrienden of teams in NEXUS. Voeg ze toe in Vrienden of Teams.' : 'Je deelt deze notitie al met al je vrienden en teams.'}</p>
      ) : access.length < SHARE_MAX_ACCESS ? (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Delen met" value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-0 flex-1 rounded-md border border-nx-border bg-nx-surface px-2 py-1">
            <option value="">Kies een vriend of team…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} className="accent-[var(--nx-accent)]" />
            mag bewerken
          </label>
          <button type="button" className={primaryButton} disabled={busy || !pick} onClick={() => void add()}>
            Delen
          </button>
        </div>
      ) : null}
      {share && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-nx-muted">{shareLine(share)}</p>
          <button type="button" className={`${button} text-nx-danger`} disabled={busy} onClick={() => window.confirm('Stoppen met delen? Je eigen notitie blijft.') && void run(() => connection().api.remove(share.id))}>
            Stoppen met delen
          </button>
        </div>
      )}
      <p className="text-xs text-nx-muted">Wat je hier deelt, staat leesbaar in je account, zoals je andere notities. Wie mag bewerken, past dezelfde notitie aan als jij.</p>
      {(error ?? syncError) && <Problem text={(error ?? syncError)!} />}
    </section>
  )
}

/** Notities › Gedeeld met mij: the list in the sidebar. */
export function SharedList({ shares, selected, onSelect }: { shares: NoteShare[]; selected: string | null; onSelect: (id: string) => void }) {
  if (shares.length === 0) return null
  return (
    <div className="px-2 pb-2">
      <h3 className="px-2 pt-2 text-xs font-semibold text-nx-muted">Gedeeld met mij</h3>
      <ul aria-label="Gedeeld met mij">
        {shares.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onSelect(s.id)} aria-current={s.id === selected} className={`w-full truncate rounded-md px-2 py-2 text-left text-sm ${s.id === selected ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
              {s.title.trim() || s.body.trim().split('\n')[0]?.slice(0, 40) || 'Naamloze notitie'}
              <span className="block text-xs font-normal text-nx-muted">van {s.ownerName}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const SAVE_MS = 1200

/** A note someone shared with you: read it, or edit along when you may. Saves shortly after typing. */
export function SharedNote({ share }: { share: NoteShare }) {
  const editable = share.right === 'edit'
  const [title, setTitle] = useState(share.title)
  const [body, setBody] = useState(share.body)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const revision = useRef(share.revision)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A newer version from someone else comes in while you are not typing.
  useEffect(() => {
    if (dirty || share.revision === revision.current) return
    revision.current = share.revision
    setTitle(share.title)
    setBody(share.body)
  }, [share, dirty])
  useEffect(() => () => clearTimeout(timer.current), [])

  const save = async (nextTitle: string, nextBody: string) => {
    setSaving(true)
    try {
      revision.current = await connection().api.save(share.id, revision.current, nextTitle, nextBody)
      setDirty(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      if (isStale(err)) {
        setDirty(false)
        await sharesApi()?.refresh()
      }
    } finally {
      setSaving(false)
    }
  }
  const change = (nextTitle: string, nextBody: string) => {
    setTitle(nextTitle)
    setBody(nextBody)
    setDirty(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(nextTitle, nextBody), SAVE_MS)
  }

  return (
    <>
      <input value={title} readOnly={!editable} onChange={(e) => change(e.target.value, body)} placeholder="Titel" aria-label="Titel" className="min-w-0 bg-transparent text-lg font-semibold outline-none placeholder:text-nx-muted" />
      <textarea value={body} readOnly={!editable} onChange={(e) => change(title, e.target.value)} placeholder={editable ? 'Begin met schrijven…' : ''} aria-label="Inhoud" className="mt-2 min-h-0 flex-1 resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-nx-muted" />
      <p className="pt-2 text-xs text-nx-muted" role="status">
        {saving ? 'Bewaren…' : dirty ? 'Nog niet bewaard' : shareLine(share)}
      </p>
      {error && <Problem text={error} />}
    </>
  )
}
