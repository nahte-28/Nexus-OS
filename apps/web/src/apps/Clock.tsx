import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  alarmTitle, zoneDayLabel, formatDuration, isAlarmTitle, lap, lapTimes, MAX_WORLD_CITIES, nextAlarmAt, offsetLabel, pauseStopwatch,
  pauseCountdown, startStopwatch, startCountdown, stopwatchElapsed, timeIn, timerLeft, WORLD_CITIES, type ReminderRepeat,
} from '@nexus/core'
import { clockStore } from '../clock/store'
import { remindersStore } from '../reminders/store'
import { readStorage, writeStorage } from '../state/storage'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const TABS = ['Wekker', 'Timer', 'Stopwatch', 'Wereldklok'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.clock.tab'
const HOME = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels'
  } catch {
    return 'Europe/Brussels'
  }
})()

const useClock = () => useSyncExternalStore(clockStore.subscribe, clockStore.getSnapshot)

/** Re-renders every [ms] while [on]. */
function useNow(ms: number, on = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms, on])
  return now
}

const clockTime = (at: number) => new Date(at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
const dayTime = (at: number) => new Date(at).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Alarms() {
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  const alarms = reminders.filter((r) => isAlarmTitle(r.title))
  const [time, setTime] = useState('07:00')
  const [label, setLabel] = useState('')
  const [repeat, setRepeat] = useState<ReminderRepeat>('daily')
  const [error, setError] = useState('')
  const add = async () => {
    const at = nextAlarmAt(time, Date.now())
    if (at === null) return setError('Kies een uur.')
    setError('')
    await remindersStore.add({ title: alarmTitle(label), at, repeat, target: 'phone' })
    setLabel('')
  }
  return (
    <section className="space-y-3">
      <p className="text-nx-muted">Een wekker is een herinnering die ook op je gsm en horloge afgaat. Je vindt hem ook terug in Herinneringen.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          Uur
          <input type="time" className={`${field} w-auto`} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1">
          Naam (mag leeg)
          <input className={field} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Bv. Opstaan" />
        </label>
        <label className="flex flex-col gap-1">
          Herhalen
          <select className={`${field} w-auto`} value={repeat} onChange={(e) => setRepeat(e.target.value as ReminderRepeat)}>
            <option value="daily">Elke dag</option>
            <option value="weekly">Elke week</option>
            <option value="none">Eén keer</option>
          </select>
        </label>
        <button type="button" className={primaryButton} onClick={() => void add()}>Wekker zetten</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {alarms.length === 0 ? (
        <p className="text-nx-muted">Nog geen wekkers.</p>
      ) : (
        <ul className="divide-y divide-nx-border rounded-lg border border-nx-border">
          {alarms.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <span className="text-2xl font-semibold tabular-nums">{clockTime(a.at)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{a.title === 'Wekker' ? 'Wekker' : a.title.slice('Wekker: '.length)}</span>
                <span className="text-xs text-nx-muted">
                  {a.repeat === 'daily' ? 'Elke dag' : a.repeat === 'weekly' ? 'Elke week' : 'Eén keer'} · volgende {dayTime(a.at)}
                </span>
              </span>
              <button type="button" className={small} onClick={() => void remindersStore.remove(a.id)} aria-label={`Wekker ${clockTime(a.at)} verwijderen`}>
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const PRESETS = [1, 3, 5, 10, 15, 25, 30, 60]

function Timer() {
  const { timer } = useClock()
  const running = timer.endsAt !== null
  const now = useNow(250, running)
  const left = timerLeft(timer, now)
  const set = (minutes: number) => clockStore.update((s) => ({ ...s, timer: { duration: minutes * 60_000, endsAt: null, pausedLeft: null } }))
  const [minutes, setMinutes] = useState(String(Math.round(timer.duration / 60_000)))
  return (
    <section className="space-y-4">
      <p className="text-center text-6xl font-semibold tabular-nums" role="timer" aria-label="Timer">{formatDuration(left)}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {running ? (
          <button type="button" className={primaryButton} onClick={() => clockStore.update((s) => ({ ...s, timer: pauseCountdown(s.timer, Date.now()) }))}>Pauze</button>
        ) : (
          <button type="button" className={primaryButton} disabled={left === 0} onClick={() => clockStore.update((s) => ({ ...s, timer: startCountdown(s.timer, Date.now()) }))}>
            {timer.pausedLeft !== null ? 'Verder' : 'Start'}
          </button>
        )}
        <button type="button" className={button} onClick={() => clockStore.update((s) => ({ ...s, timer: { ...s.timer, endsAt: null, pausedLeft: null } }))}>Opnieuw</button>
      </div>
      {!running && (
        <>
          <div className="flex flex-wrap justify-center gap-1">
            {PRESETS.map((m) => (
              <button key={m} type="button" className={small} onClick={() => { set(m); setMinutes(String(m)) }}>{m} min</button>
            ))}
          </div>
          <label className="mx-auto flex w-48 flex-col gap-1">
            Eigen tijd (minuten)
            <input
              type="number" min={1} max={1440} className={field} value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value)
                const m = Number(e.target.value)
                if (Number.isFinite(m) && m >= 1 && m <= 1440) set(m)
              }}
            />
          </label>
        </>
      )}
      <p className="text-center text-xs text-nx-muted">Je krijgt een melding als de tijd om is, ook als Klok dicht is, zolang NEXUS openstaat.</p>
    </section>
  )
}

function Stopwatch() {
  const { stopwatch } = useClock()
  const running = stopwatch.startedAt !== null
  const now = useNow(100, running)
  const total = stopwatchElapsed(stopwatch, now)
  const times = lapTimes(stopwatch.laps)
  const best = times.length > 1 ? Math.min(...times) : null
  return (
    <section className="space-y-4">
      <p className="text-center text-6xl font-semibold tabular-nums" role="timer" aria-label="Stopwatch">{formatDuration(total, true)}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {running ? (
          <>
            <button type="button" className={primaryButton} onClick={() => clockStore.update((s) => ({ ...s, stopwatch: pauseStopwatch(s.stopwatch, Date.now()) }))}>Stop</button>
            <button type="button" className={button} onClick={() => clockStore.update((s) => ({ ...s, stopwatch: lap(s.stopwatch, Date.now()) }))}>Ronde</button>
          </>
        ) : (
          <>
            <button type="button" className={primaryButton} onClick={() => clockStore.update((s) => ({ ...s, stopwatch: startStopwatch(s.stopwatch, Date.now()) }))}>
              {total > 0 ? 'Verder' : 'Start'}
            </button>
            <button type="button" className={button} disabled={total === 0} onClick={() => clockStore.update((s) => ({ ...s, stopwatch: { startedAt: null, elapsed: 0, laps: [] } }))}>Wissen</button>
          </>
        )}
      </div>
      {times.length > 0 && (
        <ol className="mx-auto max-w-sm divide-y divide-nx-border rounded-lg border border-nx-border">
          {times.map((t, i) => ({ t, i })).reverse().map(({ t, i }) => (
            <li key={i} className="flex justify-between px-3 py-1.5 tabular-nums">
              <span>Ronde {i + 1}{best === t ? ' · snelste' : ''}</span>
              <span>{formatDuration(t, true)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function WorldClock() {
  const { zones } = useClock()
  const now = useNow(15_000)
  const [pick, setPick] = useState('')
  const free = WORLD_CITIES.filter((c) => !zones.includes(c.zone) && c.zone !== HOME)
  const label = (zone: string) => WORLD_CITIES.find((c) => c.zone === zone)?.label ?? zone
  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-nx-border px-3 py-2">
        <p className="text-xs text-nx-muted">Hier</p>
        <p className="text-3xl font-semibold tabular-nums">{timeIn(HOME, now)}</p>
      </div>
      <ul className="divide-y divide-nx-border rounded-lg border border-nx-border">
        {zones.map((z) => (
          <li key={z} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block">{label(z)}</span>
              <span className="text-xs text-nx-muted">{[offsetLabel(z, HOME, now), zoneDayLabel(z, HOME, now)].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="text-2xl font-semibold tabular-nums">{timeIn(z, now)}</span>
            <button type="button" className={small} aria-label={`${label(z)} weghalen`} onClick={() => clockStore.update((s) => ({ ...s, zones: s.zones.filter((x) => x !== z) }))}>×</button>
          </li>
        ))}
      </ul>
      {zones.length < MAX_WORLD_CITIES && free.length > 0 && (
        <div className="flex gap-2">
          <select className={field} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Stad">
            <option value="">Kies een stad</option>
            {free.map((c) => <option key={c.zone} value={c.zone}>{c.label}</option>)}
          </select>
          <button type="button" className={button} disabled={!pick} onClick={() => { clockStore.update((s) => ({ ...s, zones: [...s.zones, pick] })); setPick('') }}>Toevoegen</button>
        </div>
      )}
    </section>
  )
}

export function Clock() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = readStorage(TAB_KEY)
    return TABS.includes(saved as Tab) ? (saved as Tab) : 'Wekker'
  })
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
      <div role="tablist" aria-label="Klok" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} className={`${small} ${tab === t ? 'bg-nx-surface-2 font-medium' : ''}`} onClick={() => { setTab(t); writeStorage(TAB_KEY, t) }}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Wekker' && <Alarms />}
      {tab === 'Timer' && <Timer />}
      {tab === 'Stopwatch' && <Stopwatch />}
      {tab === 'Wereldklok' && <WorldClock />}
    </div>
  )
}
