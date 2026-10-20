import { useState } from 'react'
import { isTime, PROFILE_IDS, THEMES, type AppId, type Lesson, type ProfileId, type WidgetId } from '@nexus/core'
import { profilesStore, useProfiles } from '../profiles/store'
import { daysLabel, PROFILE_ICONS, ProfileSwitcher, reasonText } from '../profiles/ui'

const field = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const DAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

/** Apps a profile can show or hide; Profielen and Instellingen always stay. */
const APP_CHOICES: Array<{ id: AppId; title: string }> = [
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

type Tab = 'overview' | 'timetable' | 'profiles' | 'schedule'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overzicht' },
  { id: 'timetable', label: 'Lesrooster' },
  { id: 'profiles', label: 'Profielen' },
  { id: 'schedule', label: 'Automatisch' },
]

/** NEXUS Profiles: switch, fill in the timetable, tune each profile and the schedule. */
export function Profiles() {
  const [tab, setTab] = useState<Tab>('overview')
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
      <div className="min-h-0 flex-1 overflow-auto p-4" role="tabpanel">
        {tab === 'overview' && <Overview />}
        {tab === 'timetable' && <Timetable />}
        {tab === 'profiles' && <ProfileEditor />}
        {tab === 'schedule' && <Schedule />}
      </div>
    </div>
  )
}

function Overview() {
  const { state, active, reason } = useProfiles()
  const pinned = state.override?.mode === 'until-manual'
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Actief: {active.name}</h2>
        <p className="text-nx-muted">{reasonText(reason, state)}</p>
      </div>
      <ProfileSwitcher compact />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => profilesStore.choose(active.id, e.target.checked ? 'until-manual' : 'until-change')}
        />
        Dit profiel vasthouden tot ik zelf wissel
      </label>
      {state.override && (
        <button type="button" className={button} onClick={() => profilesStore.update((s) => ({ ...s, override: null }))}>
          Terug naar automatisch
        </button>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {PROFILE_IDS.map((id) => {
          const p = state.profiles[id]
          const Icon = PROFILE_ICONS[id]
          return (
            <li key={id} className={`rounded-lg border p-3 ${active.id === id ? 'border-nx-accent' : 'border-nx-border'}`}>
              <p className="flex items-center gap-2 font-medium">
                <Icon className="size-4 text-nx-accent" /> {p.name}
              </p>
              <p className="mt-1 text-nx-muted">{p.description}</p>
            </li>
          )
        })}
      </ul>
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
      <p className="text-nx-muted">Je lessen verschijnen als "Volgende les" op het School-dashboard.</p>
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

function toggle<T>(list: T[], item: T, on: boolean): T[] {
  return on ? (list.includes(item) ? list : [...list, item]) : list.filter((x) => x !== item)
}

function ProfileEditor() {
  const { state, active } = useProfiles()
  const [id, setId] = useState<ProfileId>(active.id)
  const p = state.profiles[id]
  const set = (patch: Parameters<typeof profilesStore.updateProfile>[1]) => profilesStore.updateProfile(id, patch)
  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1">
        Profiel
        <select className={field} value={id} onChange={(e) => setId(e.target.value as ProfileId)}>
          {PROFILE_IDS.map((pid) => (
            <option key={pid} value={pid}>
              {state.profiles[pid].name}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="mb-1 font-semibold text-nx-muted">Uiterlijk</legend>
        <div className="flex flex-wrap gap-3">
          {THEMES.map((t) => (
            <label key={t.id} className="flex items-center gap-2">
              <input type="radio" name={`theme-${id}`} checked={p.theme === t.id} onChange={() => set({ theme: t.id })} />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 font-semibold text-nx-muted">Apps</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {APP_CHOICES.map((a) => (
            <label key={a.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.apps.includes(a.id)}
                onChange={(e) => set({ apps: toggle(p.apps, a.id, e.target.checked) })}
              />
              {a.title}
            </label>
          ))}
        </div>
        <p className="mt-1 text-nx-muted">Profielen en Instellingen blijven altijd zichtbaar.</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1 font-semibold text-nx-muted">Dashboard</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {WIDGET_CHOICES.map((w) => (
            <label key={w.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.widgets.includes(w.id)}
                onChange={(e) => set({ widgets: toggle(p.widgets, w.id, e.target.checked) })}
              />
              {w.title}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 font-semibold text-nx-muted">Meldingen</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={p.quietNonEssential} onChange={(e) => set({ quietNonEssential: e.target.checked })} />
          Stil: geen pop-ups van gsm-meldingen (ze komen wel in Meldingen; herinneringen gaan altijd af)
        </label>
      </fieldset>
    </div>
  )
}

function Schedule() {
  const { state } = useProfiles()
  const s = state.schedule
  const setSchedule = (patch: Partial<typeof s>) =>
    profilesStore.update((st) => ({
      ...st,
      schedule: { ...st.schedule, ...patch },
    }))
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
          Profiel daarbuiten
          <select
            className={field}
            value={state.defaultProfile}
            onChange={(e) =>
              profilesStore.update((st) => ({
                ...st,
                defaultProfile: e.target.value as ProfileId,
              }))
            }
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
        Kies je met de hand een ander profiel, dan blijft dat zo tot het schema de volgende keer wisselt. In Overzicht kun je het ook
        vasthouden tot je zelf terugschakelt.
      </p>
    </div>
  )
}
