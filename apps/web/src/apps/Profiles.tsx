import { useState, useSyncExternalStore } from 'react'
import {
  ACCENT_IDS,
  isTime,
  moveItem,
  PROFILE_IDS,
  profileOutsideSchedule,
  THEMES,
  type AppId,
  type Lesson,
  type Profile,
  type ProfileId,
  type WidgetId,
} from '@nexus/core'
import { useConnect } from '../connect/ConnectContext'
import { syncCalendar } from '../profiles/calendar'
import { profilesStore, useProfiles } from '../profiles/store'
import { profilesSyncMode, profilesSyncStatus, setProfilesSyncMode, type SyncMode } from '../profiles/sync'
import { ACCENTS } from '../theme/accents'
import { daysLabel, PROFILE_ICONS, reasonText } from '../profiles/ui'

const field = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const DAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

/** Apps a profile can show or hide; Profielen and Instellingen always stay. */
const APP_CHOICES: Array<{ id: AppId; title: string }> = [
  { id: 'klashub', title: 'KlasHub' },
  { id: 'notes', title: 'Notities' },
  { id: 'notifications', title: 'Meldingen' },
  { id: 'assistant', title: 'NEXUS AI' },
  { id: 'reminders', title: 'Herinneringen' },
  { id: 'devices', title: 'Apparaten' },
  { id: 'account', title: 'Account' },
  { id: 'developer', title: 'Ontwikkelaar' },
  { id: 'about', title: 'Over NEXUS' },
]

const WIDGET_CHOICES: Array<{ id: WidgetId; title: string }> = [
  { id: 'next_class', title: 'Volgende les' },
  { id: 'deadlines', title: 'Deadlines en herinneringen' },
  { id: 'klashub', title: 'KlasHub' },
  { id: 'ai_study', title: 'AI Study' },
  { id: 'notes', title: 'Notities' },
  { id: 'notifications', title: 'Meldingen' },
  { id: 'devices', title: 'Apparaten' },
]

type Tab = 'overview' | 'timetable' | 'apps' | 'schedule' | 'notifications' | 'devices' | 'appearance'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overzicht' },
  { id: 'timetable', label: 'Lesrooster' },
  { id: 'apps', label: 'Apps & widgets' },
  { id: 'schedule', label: 'Automatisch' },
  { id: 'notifications', label: 'Meldingen' },
  { id: 'devices', label: 'Apparaten' },
  { id: 'appearance', label: 'Uiterlijk' },
]

/** NEXUS Profiles: switch, fill in the timetable, tune each profile, the schedule and sync. */
export function Profiles() {
  const { active } = useProfiles()
  const [tab, setTab] = useState<Tab>('overview')
  // The profile being edited stays the same across the per-profile tabs.
  const [editing, setEditing] = useState<ProfileId>(active.id)
  return (
    <div className="flex h-full flex-col text-sm">
      <div role="tablist" aria-label="Profielen" className="flex shrink-0 gap-1 overflow-x-auto border-b border-nx-border px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-t-md px-3 py-2 ${tab === t.id ? 'border-b-2 border-nx-accent font-medium' : 'text-nx-muted'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === 'overview' && <Overview />}
        {tab === 'timetable' && <Timetable />}
        {tab === 'apps' && <AppsAndWidgets id={editing} onPick={setEditing} />}
        {tab === 'schedule' && <Schedule />}
        {tab === 'notifications' && <NotificationSettings id={editing} onPick={setEditing} />}
        {tab === 'devices' && <DeviceSync />}
        {tab === 'appearance' && <Appearance id={editing} onPick={setEditing} />}
      </div>
    </div>
  )
}

type Duration = 'until-change' | 'hour' | 'today' | 'until-manual'
const DURATIONS: Array<{ id: Duration; label: string }> = [
  { id: 'until-change', label: 'Tot het schema wisselt' },
  { id: 'hour', label: 'Eén uur' },
  { id: 'today', label: 'Tot het einde van de dag' },
  { id: 'until-manual', label: 'Tot ik zelf terugschakel' },
]

/** Picks a profile by hand for the chosen duration. */
function chooseFor(profile: ProfileId, duration: Duration, now = Date.now()): void {
  if (duration === 'hour') return profilesStore.choose(profile, 'until-time', now + 60 * 60_000)
  if (duration === 'today') {
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    return profilesStore.choose(profile, 'until-time', midnight.getTime())
  }
  profilesStore.choose(profile, duration)
}

function Overview() {
  const { state, active, reason } = useProfiles()
  const [duration, setDuration] = useState<Duration>('until-change')
  const until = state.override?.mode === 'until-time' ? state.override.until : undefined
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Actief: {active.name}</h2>
        <p className="text-nx-muted">
          {reasonText(reason, state)}
          {until ? `, tot ${new Date(until).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </p>
      </div>
      <label className="flex flex-col gap-1 sm:max-w-xs">
        Hoe lang geldt een keuze met de hand?
        <select className={field} value={duration} onChange={(e) => setDuration(e.target.value as Duration)}>
          {DURATIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Profielen kiezen">
        {PROFILE_IDS.map((id) => {
          const p = state.profiles[id]
          const Icon = PROFILE_ICONS[id]
          const selected = active.id === id
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => chooseFor(id, duration)}
                className={`w-full rounded-lg border p-3 text-left ${selected ? 'border-nx-accent bg-nx-surface-2' : 'border-nx-border hover:bg-nx-surface-2'}`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <Icon className="size-4 text-nx-accent" /> {p.name}
                  {selected && <span className="ml-auto rounded bg-nx-accent px-1.5 text-xs text-nx-accent-text">ACTIEF</span>}
                </span>
                <span className="mt-1 block text-nx-muted">{p.description}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {state.override && (
        <button type="button" className={button} onClick={() => profilesStore.update((s) => ({ ...s, override: null }))}>
          Terug naar automatisch
        </button>
      )}
    </div>
  )
}

function Timetable() {
  const { state } = useProfiles()
  const [day, setDay] = useState(1)
  const [start, setStart] = useState('08:30')
  const [end, setEnd] = useState('09:20')
  const [subject, setSubject] = useState('')
  const [room, setRoom] = useState('')
  const [klashub, setKlashub] = useState(state.klashubUrl)
  const valid = subject.trim() !== '' && isTime(start) && isTime(end) && start < end
  const lessons = [...state.lessons].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))

  const add = () => {
    const lesson: Lesson = {
      id: crypto.randomUUID(),
      day,
      start,
      end,
      subject: subject.trim(),
      ...(room.trim() ? { room: room.trim() } : {}),
    }
    profilesStore.update((s) => ({ ...s, lessons: [...s.lessons, lesson] }))
    setSubject('')
    setRoom('')
    setStart(end)
  }

  return (
    <div className="space-y-4">
      <p className="text-nx-muted">
        Je lessen verschijnen als "Volgende les" op het School-dashboard. Koppel je agendalink hieronder, of vul ze zelf in.
      </p>
      <form
        aria-label="Nieuwe les"
        className="grid gap-2 rounded-lg border border-nx-border p-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) add()
        }}
      >
        <label className="flex flex-col gap-1">
          Vak
          <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Wiskunde" />
        </label>
        <label className="flex flex-col gap-1">
          Lokaal
          <input className={field} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="B204" />
        </label>
        <label className="flex flex-col gap-1">
          Dag
          <select className={field} value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            Van
            <input type="time" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            Tot
            <input type="time" className={field} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <div>
          <button type="submit" className={primaryButton} disabled={!valid}>
            Les toevoegen
          </button>
        </div>
      </form>

      {lessons.length === 0 ? (
        <p className="text-nx-muted">Nog geen lessen.</p>
      ) : (
        <ul aria-label="Lesrooster" className="divide-y divide-nx-border rounded-lg border border-nx-border">
          {lessons.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{l.subject}</span>
                <span className="text-nx-muted tabular-nums">
                  {' '}
                  · {DAYS[l.day - 1]} {l.start}–{l.end}
                  {l.room ? ` · ${l.room}` : ''}
                </span>
              </span>
              <button
                type="button"
                className={button}
                aria-label={`${l.subject} verwijderen`}
                onClick={() =>
                  profilesStore.update((s) => ({
                    ...s,
                    lessons: s.lessons.filter((x) => x.id !== l.id),
                  }))
                }
              >
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}

      <CalendarLink />

      <form
        className="space-y-2 border-t border-nx-border pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          profilesStore.update((s) => ({ ...s, klashubUrl: klashub.trim() }))
        }}
      >
        <label className="flex flex-col gap-1">
          KlasHub-link
          <input type="url" className={field} value={klashub} onChange={(e) => setKlashub(e.target.value)} placeholder="https://" />
        </label>
        <button type="submit" className={button}>
          Link bewaren
        </button>
      </form>
    </div>
  )
}

/** The school calendar link: lessons fill themselves in from it. */
function CalendarLink() {
  const { state } = useProfiles()
  const [link, setLink] = useState(state.calendarUrl)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const synced = state.calendarSyncedAt
  return (
    <form
      aria-label="Agendalink"
      className="space-y-2 border-t border-nx-border pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        setMessage(null)
        void syncCalendar(link).then((error) => {
          setBusy(false)
          setMessage(error ?? 'Je lessen zijn opgehaald.')
        })
      }}
    >
      <label className="flex flex-col gap-1">
        Agendalink van school
        <input type="url" className={field} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://apih.ap.be/..." />
      </label>
      <p className="text-nx-muted">
        Kopieer de link van "Koppel agenda" op het intranet, dezelfde die KlasHub gebruikt. NEXUS haalt je lessen dan zelf op, elke paar uur
        opnieuw. Je moet aangemeld zijn in Account.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={primaryButton} disabled={busy || !link.trim()}>
          {busy ? 'Ophalen...' : 'Lessen ophalen'}
        </button>
        {state.calendarUrl && (
          <button
            type="button"
            className={button}
            onClick={() => {
              profilesStore.update((s) => ({ ...s, calendarUrl: '', calendarEvents: [], calendarSyncedAt: null }))
              setLink('')
              setMessage(null)
            }}
          >
            Ontkoppelen
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {synced !== null && (
        <p className="text-nx-muted">
          {state.calendarEvents.length} lessen, bijgewerkt{' '}
          {new Date(synced).toLocaleString('nl-BE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </form>
  )
}

function toggle<T>(list: T[], item: T, on: boolean): T[] {
  return on ? (list.includes(item) ? list : [...list, item]) : list.filter((x) => x !== item)
}

function ProfilePicker({ id, onPick }: { id: ProfileId; onPick: (id: ProfileId) => void }) {
  const { state } = useProfiles()
  return (
    <label className="flex flex-col gap-1 sm:max-w-xs">
      Profiel
      <select className={field} value={id} onChange={(e) => onPick(e.target.value as ProfileId)}>
        {PROFILE_IDS.map((pid) => (
          <option key={pid} value={pid}>
            {state.profiles[pid].name}
          </option>
        ))}
      </select>
    </label>
  )
}

type EditorProps = { id: ProfileId; onPick: (id: ProfileId) => void }
const setProfile = (id: ProfileId) => (patch: Partial<Profile>) => profilesStore.updateProfile(id, patch)

/** A list where each chosen item can be switched off or moved up and down. */
function OrderedChoices<T extends string>({
  label,
  choices,
  chosen,
  onChange,
}: {
  label: string
  choices: Array<{ id: T; title: string }>
  chosen: T[]
  onChange: (next: T[]) => void
}) {
  const title = (id: T) => choices.find((c) => c.id === id)?.title ?? id
  const shown = chosen.filter((id) => choices.some((c) => c.id === id))
  const hidden = choices.filter((c) => !chosen.includes(c.id))
  return (
    <fieldset>
      <legend className="mb-1 font-semibold text-nx-muted">{label}</legend>
      <ol aria-label={label} className="divide-y divide-nx-border rounded-lg border border-nx-border">
        {shown.map((id, i) => (
          <li key={id} className="flex items-center gap-2 px-3 py-1.5">
            <label className="flex flex-1 items-center gap-2">
              <input type="checkbox" checked onChange={() => onChange(toggle(chosen, id, false))} />
              {title(id)}
            </label>
            <button
              type="button"
              className={button}
              aria-label={`${title(id)} omhoog`}
              disabled={i === 0}
              onClick={() => onChange(moveItem(chosen, id, -1))}
            >
              ↑
            </button>
            <button
              type="button"
              className={button}
              aria-label={`${title(id)} omlaag`}
              disabled={i === shown.length - 1}
              onClick={() => onChange(moveItem(chosen, id, 1))}
            >
              ↓
            </button>
          </li>
        ))}
        {hidden.map((c) => (
          <li key={c.id} className="px-3 py-1.5 text-nx-muted">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={false} onChange={() => onChange(toggle(chosen, c.id, true))} />
              {c.title}
            </label>
          </li>
        ))}
      </ol>
    </fieldset>
  )
}

function AppsAndWidgets({ id, onPick }: EditorProps) {
  const { state } = useProfiles()
  const p = state.profiles[id]
  const set = setProfile(id)
  return (
    <div className="space-y-4">
      <ProfilePicker id={id} onPick={onPick} />
      <OrderedChoices label="Apps" choices={APP_CHOICES} chosen={p.apps} onChange={(apps) => set({ apps })} />
      <p className="text-nx-muted">Profielen en Instellingen blijven altijd zichtbaar, onderaan de lijst.</p>
      <OrderedChoices label="Dashboard" choices={WIDGET_CHOICES} chosen={p.widgets} onChange={(widgets) => set({ widgets })} />
    </div>
  )
}

function NotificationSettings({ id, onPick }: EditorProps) {
  const { state } = useProfiles()
  const { state: connect } = useConnect()
  const [app, setApp] = useState('')
  const p = state.profiles[id]
  const set = setProfile(id)
  const add = (name: string) => {
    const clean = name.trim()
    if (clean && !p.allowApps.some((a) => a.toLowerCase() === clean.toLowerCase())) set({ allowApps: [...p.allowApps, clean] })
    setApp('')
  }
  // Apps that sent something recently, as quick picks.
  const recent = [...new Set(connect.inbox.map((i) => i.appName))]
    .filter((n) => !p.allowApps.some((a) => a.toLowerCase() === n.toLowerCase()))
    .slice(0, 6)
  return (
    <div className="space-y-4">
      <ProfilePicker id={id} onPick={onPick} />
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={p.quietNonEssential}
          onChange={(e) => set({ quietNonEssential: e.target.checked })}
        />
        <span>
          Stil: gsm-meldingen komen wel in Meldingen, maar zonder pop-up.
          <span className="block text-nx-muted">Herinneringen gaan altijd af, ook in een stil profiel.</span>
        </span>
      </label>
      {p.quietNonEssential && (
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold text-nx-muted">Altijd doorlaten</legend>
          {p.allowApps.length === 0 ? (
            <p className="text-nx-muted">Nog geen uitzonderingen. Voeg bijvoorbeeld Smartschool of Outlook toe.</p>
          ) : (
            <ul aria-label="Altijd doorlaten" className="flex flex-wrap gap-2">
              {p.allowApps.map((a) => (
                <li key={a} className="flex items-center gap-1 rounded-full border border-nx-border px-3 py-1">
                  {a}
                  <button
                    type="button"
                    aria-label={`${a} niet meer doorlaten`}
                    onClick={() => set({ allowApps: p.allowApps.filter((x) => x !== a) })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              add(app)
            }}
          >
            <input
              className={`${field} flex-1`}
              aria-label="Naam van de app"
              value={app}
              onChange={(e) => setApp(e.target.value)}
              placeholder="Naam van de app op je gsm"
            />
            <button type="submit" className={button} disabled={!app.trim()}>
              Toevoegen
            </button>
          </form>
          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-nx-muted">
              Onlangs:
              {recent.map((n) => (
                <button key={n} type="button" className={button} onClick={() => add(n)}>
                  + {n}
                </button>
              ))}
            </div>
          )}
        </fieldset>
      )}
      <p className="text-nx-muted">
        NEXUS kan alleen zijn eigen meldingen stil zetten. Meldingen van andere apps op je gsm en horloge stel je in op het toestel zelf.
      </p>
    </div>
  )
}

function DeviceSync() {
  const status = useSyncExternalStore(profilesSyncStatus.subscribe, profilesSyncStatus.getSnapshot)
  const [mode, setMode] = useState<SyncMode>(profilesSyncMode)
  const choose = (next: SyncMode) => {
    setMode(next)
    setProfilesSyncMode(next)
  }
  const text: Record<typeof status.state, string> = {
    unavailable: 'Synchroniseren is niet ingesteld in deze versie.',
    off: 'Dit toestel houdt zijn profielen voor zichzelf.',
    'signed-out': 'Meld je aan in Account om je profielen mee te nemen naar je andere toestellen.',
    syncing: 'Bezig met synchroniseren...',
    synced: `Gesynchroniseerd${status.at ? ` om ${new Date(status.at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}` : ''}.`,
    error: `Synchroniseren mislukt: ${status.error ?? 'onbekende fout'}`,
  }
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold text-nx-muted">Profielen op dit toestel</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="sync-mode" className="mt-1" checked={mode === 'all-devices'} onChange={() => choose('all-devices')} />
          <span>
            Op al mijn toestellen hetzelfde
            <span className="block text-nx-muted">Profielen, tijdschema, lesrooster en agendalink gaan mee via je account.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="sync-mode" className="mt-1" checked={mode === 'this-device'} onChange={() => choose('this-device')} />
          <span>
            Alleen op dit toestel
            <span className="block text-nx-muted">Handig als je hier bijvoorbeeld altijd Gaming wilt, wat je pc ook doet.</span>
          </span>
        </label>
      </fieldset>
      <p role="status" className={status.state === 'error' ? 'text-red-500' : 'text-nx-muted'}>
        {text[status.state]}
      </p>
    </div>
  )
}

function Appearance({ id, onPick }: EditorProps) {
  const { state } = useProfiles()
  const p = state.profiles[id]
  const set = setProfile(id)
  return (
    <div className="space-y-4">
      <ProfilePicker id={id} onPick={onPick} />
      <fieldset>
        <legend className="mb-1 font-semibold text-nx-muted">Thema</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {THEMES.map((t) => (
            <label
              key={t.id}
              className={`flex cursor-pointer flex-col rounded-lg border p-3 ${p.theme === t.id ? 'border-nx-accent bg-nx-surface-2' : 'border-nx-border'}`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name={`theme-${id}`} checked={p.theme === t.id} onChange={() => set({ theme: t.id })} />
                {t.label}
              </span>
              <span className="mt-1 text-nx-muted">{t.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 font-semibold text-nx-muted">Accentkleur</legend>
        <div role="radiogroup" aria-label="Accentkleur" className="flex flex-wrap gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={p.accent === null}
            onClick={() => set({ accent: null })}
            className={`rounded-full border px-3 py-1 ${p.accent === null ? 'border-nx-accent' : 'border-nx-border'}`}
          >
            Van het thema
          </button>
          {ACCENT_IDS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={p.accent === a}
              onClick={() => set({ accent: a })}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 ${p.accent === a ? 'border-nx-accent' : 'border-nx-border'}`}
            >
              <span className="size-3 rounded-full" style={{ background: ACCENTS[a][p.theme][0] }} />
              {ACCENTS[a].label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

function Schedule() {
  const { state } = useProfiles()
  const s = state.schedule
  const setSchedule = (patch: Partial<typeof s>) => profilesStore.update((st) => ({ ...st, schedule: { ...st.schedule, ...patch } }))
  const outside = profileOutsideSchedule(state)
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.enabled} onChange={(e) => setSchedule({ enabled: e.target.checked })} />
        Automatisch wisselen volgens tijdschema
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          Profiel tijdens het schema
          <select className={field} value={s.profile} onChange={(e) => setSchedule({ profile: e.target.value as ProfileId })}>
            {PROFILE_IDS.map((pid) => (
              <option key={pid} value={pid}>
                {state.profiles[pid].name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Standaardprofiel daarbuiten
          <select
            className={field}
            value={state.defaultProfile}
            // A new default replaces the profile remembered from the last manual choice.
            onChange={(e) => profilesStore.update((st) => ({ ...st, defaultProfile: e.target.value as ProfileId, returnProfile: null }))}
          >
            {PROFILE_IDS.map((pid) => (
              <option key={pid} value={pid}>
                {state.profiles[pid].name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Van
          <input
            type="time"
            className={field}
            value={s.start}
            onChange={(e) => isTime(e.target.value) && setSchedule({ start: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          Tot
          <input
            type="time"
            className={field}
            value={s.end}
            onChange={(e) => isTime(e.target.value) && setSchedule({ end: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          Tijdzone
          <select className={field} value={s.timeZone} onChange={(e) => setSchedule({ timeZone: e.target.value })}>
            <option value="">Die van dit toestel</option>
            <option value="Europe/Brussels">Brussel</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 font-semibold text-nx-muted">Dagen ({daysLabel(s.days)})</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={s.days.includes(i + 1)}
                onChange={(e) => setSchedule({ days: toggle(s.days, i + 1, e.target.checked) })}
              />
              {d.slice(0, 2)}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-nx-muted">
        Na het schema gaat NEXUS terug naar {state.profiles[outside].name}
        {state.returnProfile ? ', het profiel dat je er vóór koos' : ''}. Kies je met de hand een profiel, dan bepaal je in Overzicht hoe
        lang dat geldt. Open vensters blijven altijd open.
      </p>
    </div>
  )
}
