import { useState, useSyncExternalStore } from 'react'
import { focusChange, formatMark, insights, isoWeek, moodEmoji, moodWeeks, percent, type WeekInsight } from '@nexus/core'
import { flashcardsStore } from '../flashcards/store'
import { gradesStore } from '../grades/store'
import { habitsStore } from '../habits/store'
import { journalStore } from '../journal/store'
import { lifeStore } from '../life/store'
import { focusStore } from '../study/timer'

const hours = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} u${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`)
const weekLabel = (w: WeekInsight) => `wk ${isoWeek(w.monday)}`

/** Inzichten: the last eight weeks at a glance, from Studie, Gewoontes, Agenda, Leerkaarten and Cijfers. */
export function Insights() {
  const focus = useSyncExternalStore(focusStore.subscribe, focusStore.getSnapshot)
  const habits = useSyncExternalStore(habitsStore.subscribe, habitsStore.getSnapshot)
  const items = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const flashcards = useSyncExternalStore(flashcardsStore.subscribe, flashcardsStore.getSnapshot)
  const grades = useSyncExternalStore(gradesStore.subscribe, gradesStore.getSnapshot)
  const journal = useSyncExternalStore(journalStore.subscribe, journalStore.getSnapshot)
  const data = insights({ now: Date.now(), focus: focus.log, habits, items, flashcards, grades })
  const [current, previous] = [data.weeks.at(-1)!, data.weeks.at(-2)!]
  // The same eight weeks, ending with this one.
  const moods = moodWeeks(journal, Date.now(), data.weeks.length)
  const moodOf = (w: WeekInsight) => moods[data.weeks.indexOf(w)]?.average ?? null
  const habitRate = percent(current.habitsDone, current.habitsDue)
  const onTime = percent(
    data.weeks.reduce((n, w) => n + w.deadlinesOnTime, 0),
    data.weeks.reduce((n, w) => n + w.deadlinesDue, 0),
  )

  return (
    <div className="h-full space-y-5 overflow-y-auto p-4 text-sm">
      <div>
        <h2 className="text-lg font-semibold">Inzichten</h2>
        <p className="text-nx-muted">Hoe je laatste acht weken liepen, uit Studie, Gewoontes, Dagboek, Agenda, Leerkaarten en Cijfers. Alles wordt op dit apparaat berekend.</p>
      </div>
      <section aria-label="Deze week" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Focustijd deze week" value={hours(current.focusMinutes)} note={`${focusChange(current.focusMinutes, previous.focusMinutes)} t.o.v. vorige week`} />
        <Tile label="Gewoontes deze week" value={habitRate === null ? '–' : `${habitRate}%`} note={current.habitsDue > 0 ? `${current.habitsDone} van ${current.habitsDue} keer` : 'Nog niets te doen'} />
        <Tile label="Deadlines op tijd" value={onTime === null ? '–' : `${onTime}%`} note="in 8 weken" />
        <Tile
          label={data.average !== null ? 'Gemiddelde' : 'Leerkaarten'}
          value={data.average !== null ? formatMark(data.average) : String(data.cards.total)}
          note={data.average !== null ? `${data.cards.learned} van ${data.cards.total} kaarten goed gekend` : `${data.cards.learned} goed gekend, ${data.cards.due} te herhalen`}
        />
      </section>
      {data.bestHabit && (
        <p>
          Je sterkste gewoonte: <span className="font-medium">{data.bestHabit.name}</span> ({Math.round(data.bestHabit.rate * 100)}% van de keren gedaan).
        </p>
      )}
      <Bars title="Focustijd per week" weeks={data.weeks} value={(w) => w.focusMinutes} format={hours} />
      <Bars title="Gewoontes gedaan per week" weeks={data.weeks} value={(w) => percent(w.habitsDone, w.habitsDue)} format={(v) => `${v}%`} max={100} />
      {moods.some((m) => m.average !== null) && (
        <Bars title="Stemming per week (Dagboek)" weeks={data.weeks} value={moodOf} format={(v) => `${moodEmoji(v)} ${String(v).replace('.', ',')} van 5`} max={5} />
      )}
      <Bars title="Deadlines op tijd per week" weeks={data.weeks} value={(w) => percent(w.deadlinesOnTime, w.deadlinesDue)} format={(v) => `${v}%`} max={100} detail={(w) => `${w.deadlinesOnTime} van ${w.deadlinesDue}`} />
      <details className="rounded-lg border border-nx-border p-3">
        <summary className="cursor-pointer font-medium">Als tabel</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-nx-muted">
            <tr>
              <th className="py-1 font-normal">Week</th>
              <th className="py-1 font-normal">Focus</th>
              <th className="py-1 font-normal">Gewoontes</th>
              <th className="py-1 font-normal">Deadlines op tijd</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => (
              <tr key={w.monday} className="border-t border-nx-border">
                <td className="py-1">{weekLabel(w)}</td>
                <td className="py-1">{hours(w.focusMinutes)}</td>
                <td className="py-1">{w.habitsDue > 0 ? `${w.habitsDone}/${w.habitsDue}` : '–'}</td>
                <td className="py-1">{w.deadlinesDue > 0 ? `${w.deadlinesOnTime}/${w.deadlinesDue}` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      <p className="text-xs text-nx-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-nx-muted">{note}</p>
    </div>
  )
}

const W = 320
const H = 100
const PAD_TOP = 4
const PAD_BOTTOM = 1

/** One measure, one bar per week; the current week is the last. Weeks without data get no bar. */
function Bars({ title, weeks, value, format, max, detail }: { title: string; weeks: WeekInsight[]; value: (w: WeekInsight) => number | null; format: (v: number) => string; max?: number; detail?: (w: WeekInsight) => string }) {
  const [hover, setHover] = useState<number | null>(null)
  const values = weeks.map(value)
  const top = max ?? Math.max(1, ...values.map((v) => v ?? 0))
  const slot = W / weeks.length
  const bar = Math.min(24, slot - 8)
  const plot = H - PAD_TOP - PAD_BOTTOM
  const shown = hover ?? weeks.length - 1
  const shownValue = values[shown]
  return (
    <figure className="space-y-1">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-nx-muted tabular-nums" aria-live="polite">
          {weekLabel(weeks[shown])}: {shownValue === null ? 'geen gegevens' : format(shownValue)}
          {shownValue !== null && detail ? ` (${detail(weeks[shown])})` : ''}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label={`${title}: ${weeks.map((w, i) => `${weekLabel(w)} ${values[i] === null ? 'geen' : format(values[i]!)}`).join(', ')}`}>
        <line x1={0} x2={W} y1={H - PAD_BOTTOM} y2={H - PAD_BOTTOM} className="stroke-nx-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {weeks.map((w, i) => {
          const v = values[i]
          const h = v === null ? 0 : Math.max(v > 0 ? 3 : 0, (v / top) * plot)
          const x = i * slot + (slot - bar) / 2
          const y = H - PAD_BOTTOM - h
          return (
            <g key={w.monday} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              {/* Hit target: the whole column, larger than the bar. */}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {h > 0 && <path d={`M${x},${H - PAD_BOTTOM} V${y + 4} q0,-4 4,-4 h${bar - 8} q4,0 4,4 V${H - PAD_BOTTOM} Z`} fill="var(--nx-accent)" opacity={hover === null || hover === i ? 1 : 0.45} />}
            </g>
          )
        })}
      </svg>
      <div aria-hidden="true" className="flex text-xs tabular-nums">
        {weeks.map((w, i) => (
          <span key={w.monday} className={`flex-1 text-center ${i === shown ? 'text-nx-text' : 'text-nx-muted'}`}>
            {isoWeek(w.monday)}
          </span>
        ))}
      </div>
    </figure>
  )
}
