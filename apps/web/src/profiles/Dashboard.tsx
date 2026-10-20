import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { nextLesson, noteTitle, type AppId, type WidgetId } from '@nexus/core'
import { assistant } from '../ai/runtime'
import { LinkIcon, SparkIcon } from '../apps/icons'
import { useConnect } from '../connect/ConnectContext'
import { remindersStore } from '../reminders/store'
import { useNotes } from '../state/useNotes'
import { useProfiles } from './store'
import { PROFILE_ICONS, ProfileSwitcher, reasonText } from './ui'

type OpenApp = (id: AppId) => void

const STUDY_PROMPTS = ['Maak een studieplanning voor mijn deadlines', 'Overhoor me over mijn laatste notitie']

/** Re-renders every minute, so "next class" and greetings stay current. */
function useMinute(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function greeting(now: number): string {
  const h = new Date(now).getHours()
  return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond'
}

/** The home screen of the active profile: status, then its widgets. */
export function Dashboard({ onOpenApp, compact = false }: { onOpenApp: OpenApp; compact?: boolean }) {
  const { state, active, reason } = useProfiles()
  const now = useMinute()
  const Icon = PROFILE_ICONS[active.id]
  return (
    <section aria-label="Dashboard" className={`mx-auto w-full max-w-5xl space-y-4 ${compact ? 'p-4' : 'p-6'}`}>
      <header className="space-y-1">
        <h1 className={`${compact ? 'text-xl' : 'text-3xl'} font-semibold`}>
          {active.id === 'school' ? 'School Workspace' : `${greeting(now)}`}
        </h1>
        <p className="text-nx-muted">
          {new Date(now).toLocaleDateString('nl-BE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-nx-accent uppercase">{active.name} Mode</p>
              <p className="flex items-center gap-2 text-lg font-semibold">
                <Icon className="size-5 text-nx-accent" />
                {active.description}
              </p>
              <p className="text-sm text-nx-muted">{reasonText(reason, state)}</p>
            </div>
            <span className="rounded-md bg-nx-accent px-2.5 py-1 text-xs font-semibold text-nx-accent-text">ACTIEF</span>
          </div>
          <div className="mt-3 border-t border-nx-border pt-3">
            <ProfileSwitcher compact />
          </div>
        </Card>
        {active.widgets.includes('next_class') ? <NextClass now={now} onOpenApp={onOpenApp} /> : <Upcoming onOpenApp={onOpenApp} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.widgets
          .filter((w) => w !== 'next_class' && !(w === 'deadlines' && !active.widgets.includes('next_class')))
          .map((w) => (
            <Widget key={w} id={w} onOpenApp={onOpenApp} />
          ))}
      </div>
    </section>
  )
}

function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="nx-glass rounded-2xl border border-nx-border p-4">
      {title && <h2 className="mb-2 text-xs font-semibold tracking-wide text-nx-muted uppercase">{title}</h2>}
      {children}
    </div>
  )
}

const linkButton = 'text-sm font-medium text-nx-accent hover:underline'

function Widget({ id, onOpenApp }: { id: WidgetId; onOpenApp: OpenApp }) {
  switch (id) {
    case 'deadlines':
      return <Upcoming onOpenApp={onOpenApp} />
    case 'notes':
      return <RecentNotes onOpenApp={onOpenApp} />
    case 'ai_study':
      return <AiStudy onOpenApp={onOpenApp} />
    case 'klashub':
      return <KlasHub onOpenApp={onOpenApp} />
    case 'notifications':
      return <Notifications onOpenApp={onOpenApp} />
    case 'devices':
      return <DevicesWidget onOpenApp={onOpenApp} />
    case 'next_class':
      return null
  }
}

function NextClass({ now, onOpenApp }: { now: number; onOpenApp: OpenApp }) {
  const { state } = useProfiles()
  const next = nextLesson(state.lessons, now, state.schedule.timeZone)
  if (!next) {
    return (
      <Card title="Volgende les">
        <p className="text-sm text-nx-muted">Nog geen lesrooster.</p>
        <button type="button" className={linkButton} onClick={() => onOpenApp('profiles')}>
          Lesrooster invullen
        </button>
      </Card>
    )
  }
  const { lesson, inDays } = next
  const when =
    inDays === 0
      ? 'Vandaag'
      : inDays === 1
        ? 'Morgen'
        : ['', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'][lesson.day]
  return (
    <Card title="Volgende les">
      <p className="text-lg font-semibold">{lesson.subject}</p>
      <p className="text-sm text-nx-accent tabular-nums">
        {when} {lesson.start}–{lesson.end}
        {lesson.room ? ` · ${lesson.room}` : ''}
      </p>
    </Card>
  )
}

function Upcoming({ onOpenApp }: { onOpenApp: OpenApp }) {
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  return (
    <Card title="Deadlines en herinneringen">
      {reminders.length === 0 ? (
        <p className="text-sm text-nx-muted">Niets gepland.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {reminders.slice(0, 4).map((r) => (
            <li key={r.id} className="flex justify-between gap-2">
              <span className="truncate">{r.title}</span>
              <span className="shrink-0 text-nx-muted tabular-nums">
                {new Date(r.at).toLocaleString('nl-BE', {
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('reminders')}>
        Herinneringen openen
      </button>
    </Card>
  )
}

function RecentNotes({ onOpenApp }: { onOpenApp: OpenApp }) {
  const { notes } = useNotes()
  return (
    <Card title="Notities">
      {notes.length === 0 ? (
        <p className="text-sm text-nx-muted">Nog geen notities.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {notes.slice(0, 3).map((n) => (
            <li key={n.id} className="truncate">
              {noteTitle(n)}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('notes')}>
        Notities openen
      </button>
    </Card>
  )
}

function AiStudy({ onOpenApp }: { onOpenApp: OpenApp }) {
  return (
    <Card title="AI Study">
      <p className="mb-2 flex items-center gap-2 text-sm">
        <SparkIcon className="size-4 text-nx-accent" /> Studeer slimmer met NEXUS AI.
      </p>
      <div className="flex flex-col items-start gap-1">
        {STUDY_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className={`${linkButton} text-left`}
            onClick={() => {
              onOpenApp('assistant')
              void assistant.send(prompt)
            }}
          >
            {prompt}
          </button>
        ))}
      </div>
    </Card>
  )
}

function KlasHub({ onOpenApp }: { onOpenApp: OpenApp }) {
  const { state } = useProfiles()
  return (
    <Card title="KlasHub">
      <p className="mb-2 text-sm text-nx-muted">Vakken en opdrachten.</p>
      {state.klashubUrl ? (
        <a href={state.klashubUrl} target="_blank" rel="noreferrer" className={`${linkButton} inline-flex items-center gap-1`}>
          <LinkIcon className="size-4" /> KlasHub openen
        </a>
      ) : (
        <button type="button" className={linkButton} onClick={() => onOpenApp('profiles')}>
          KlasHub-link instellen
        </button>
      )}
    </Card>
  )
}

function Notifications({ onOpenApp }: { onOpenApp: OpenApp }) {
  const { state } = useConnect()
  return (
    <Card title="Meldingen">
      <p className="text-sm">{state.unread > 0 ? `${state.unread} nieuwe melding(en)` : 'Geen nieuwe meldingen.'}</p>
      <ul className="mt-1 space-y-1 text-sm text-nx-muted">
        {state.inbox.slice(0, 3).map((i) => (
          <li key={i.id} className="truncate">
            {i.appName}: {i.title}
          </li>
        ))}
      </ul>
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('notifications')}>
        Meldingen openen
      </button>
    </Card>
  )
}

function DevicesWidget({ onOpenApp }: { onOpenApp: OpenApp }) {
  const { state } = useConnect()
  const linked = state.devices.filter((d) => !d.revokedAt).length
  return (
    <Card title="Apparaten">
      <p className="text-sm">
        {state.status === 'ready' ? `NEXUS Connect is verbonden · ${linked} gekoppeld` : 'NEXUS Connect is niet verbonden.'}
      </p>
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('devices')}>
        Apparaten openen
      </button>
    </Card>
  )
}
