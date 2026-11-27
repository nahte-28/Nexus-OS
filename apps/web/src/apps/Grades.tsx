import { useState, useSyncExternalStore } from 'react'
import { activeCourses, courseResult, DEFAULT_TARGET, formatMark, gradesOverview, nextExamNeed, PASS_MARK, type Course, type CourseResult, type GradePart } from '@nexus/core'
import { gradesStore, gradesSyncProblem } from '../grades/store'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const smallButton = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const useGrades = () => useSyncExternalStore(gradesStore.subscribe, gradesStore.getSnapshot)
const number = (text: string) => {
  const n = Number(text.replace(',', '.'))
  return text.trim() === '' || !Number.isFinite(n) ? null : n
}
const decimal = (n: number) => n.toLocaleString('nl-BE', { maximumFractionDigits: 1 })

function changeCourse(id: string, change: (c: Course) => Course) {
  gradesStore.update((s) => ({ ...s, courses: s.courses.map((c) => (c.id === id ? { ...change(c), updatedAt: Date.now() } : c)) }))
}

function statusText(r: CourseResult, target: number): { text: string; tone: string } {
  switch (r.status) {
    case 'empty':
      return { text: 'Voeg de onderdelen van dit vak toe.', tone: 'text-nx-muted' }
    case 'passed':
      return { text: 'Geslaagd', tone: 'text-nx-success' }
    case 'failed':
      return { text: `Niet geslaagd: je hebt minstens ${PASS_MARK}/20 nodig`, tone: 'text-nx-danger' }
    case 'safe':
      return { text: `Je haalt je doel van ${formatMark(target)} sowieso.`, tone: 'text-nx-success' }
    case 'impossible':
      return { text: `Je doel van ${formatMark(target)} haal je niet meer, zelfs niet met 20/20 op de rest.`, tone: 'text-nx-danger' }
    default:
      return { text: `Voor ${formatMark(target)} heb je gemiddeld ${formatMark(r.needed ?? 0)} nodig op de rest.`, tone: r.needed !== null && r.needed > 14 ? 'text-nx-warning' : '' }
  }
}

/** Cijfers: your marks per course, your average and what you still need. */
export function Grades() {
  const state = useGrades()
  const problem = useSyncExternalStore(gradesSyncProblem.subscribe, gradesSyncProblem.getSnapshot)
  const courses = activeCourses(state)
  const overview = gradesOverview(state)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4 text-sm">
      {problem?.startsWith('setup:') && (
        <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          Je cijfers staan alleen op dit apparaat: de database is nog niet bijgewerkt. Voer <code className="font-mono text-xs">{problem.slice(6)}</code> uit in de SQL Editor van Supabase.
        </p>
      )}
      <section aria-label="Overzicht" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Gemiddelde" value={overview.average === null ? '–' : formatMark(overview.average)} />
        <Stat label="Studiepunten behaald" value={`${decimal(overview.earned)} van ${decimal(overview.credits)}`} />
        <Stat label="Vakken" value={String(courses.length)} />
      </section>
      <AddCourse onAdded={setOpen} />
      {courses.length === 0 ? (
        <p className="text-nx-muted">Nog geen vakken. Voeg je vakken toe met hun studiepunten, en per vak de onderdelen (examen, labo, project) met hoeveel ze meetellen.</p>
      ) : (
        <ul className="space-y-2" aria-label="Vakken">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />
          ))}
        </ul>
      )}
      <p className="text-xs text-nx-muted">Punten op 20, geslaagd vanaf {PASS_MARK}/20. Het gemiddelde weegt elk vak met zijn studiepunten. Dit is een eigen berekening, je officiële punten staan op je puntenlijst.</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      <p className="text-xs text-nx-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function AddCourse({ onAdded }: { onAdded: (id: string) => void }) {
  const [name, setName] = useState('')
  const [credits, setCredits] = useState('6')
  const add = () => {
    const id = crypto.randomUUID()
    gradesStore.update((s) => ({
      ...s,
      courses: [
        ...s.courses,
        { id, name: name.trim(), credits: number(credits) ?? 0, target: DEFAULT_TARGET, parts: [{ id: crypto.randomUUID(), name: 'Examen', weight: 100, score: null, max: 20 }], updatedAt: Date.now(), deletedAt: null },
      ],
    }))
    setName('')
    onAdded(id)
  }
  return (
    <form
      aria-label="Nieuw vak"
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) add()
      }}
    >
      <label className="min-w-40 flex-1">
        <span className="text-xs text-nx-muted">Vak</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Elektronica 1" className={field} />
      </label>
      <label className="w-28">
        <span className="text-xs text-nx-muted">Studiepunten</span>
        <input value={credits} inputMode="decimal" onChange={(e) => setCredits(e.target.value)} className={field} />
      </label>
      <button type="submit" disabled={!name.trim()} className={primaryButton}>
        Vak toevoegen
      </button>
    </form>
  )
}

function CourseCard({ course, open, onToggle }: { course: Course; open: boolean; onToggle: () => void }) {
  const result = courseResult(course)
  const status = statusText(result, course.target)
  return (
    <li className="rounded-lg border border-nx-border bg-nx-surface-2">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{course.name}</span>
          <span className={`block text-xs ${status.tone || 'text-nx-muted'}`}>{status.text}</span>
        </span>
        <span className="shrink-0 text-right tabular-nums">
          <span className="block text-base font-semibold">{result.score === null ? '–' : formatMark(result.score)}</span>
          <span className="block text-xs text-nx-muted">
            {decimal(course.credits)} sp · {decimal(result.graded)}% binnen
          </span>
        </span>
      </button>
      {open && <CourseEditor course={course} result={result} />}
    </li>
  )
}

function CourseEditor({ course, result }: { course: Course; result: CourseResult }) {
  const setPart = (id: string, patch: Partial<GradePart>) => changeCourse(course.id, (c) => ({ ...c, parts: c.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  return (
    <div className="space-y-3 border-t border-nx-border p-3">
      <div className="flex flex-wrap gap-2">
        <label className="min-w-40 flex-1">
          <span className="text-xs text-nx-muted">Naam</span>
          <input aria-label="Naam van het vak" value={course.name} onChange={(e) => changeCourse(course.id, (c) => ({ ...c, name: e.target.value }))} className={field} />
        </label>
        <NumberField label="Studiepunten" value={course.credits} onChange={(n) => changeCourse(course.id, (c) => ({ ...c, credits: Math.max(0, n ?? 0) }))} />
        <NumberField label="Doel (op 20)" value={course.target} onChange={(n) => changeCourse(course.id, (c) => ({ ...c, target: Math.min(20, Math.max(0, n ?? DEFAULT_TARGET)) }))} />
      </div>
      <table className="w-full text-left">
        <thead className="text-xs text-nx-muted">
          <tr>
            <th className="font-normal">Onderdeel</th>
            <th className="w-20 font-normal">Telt mee %</th>
            <th className="w-20 font-normal">Punt</th>
            <th className="w-16 font-normal">Op</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {course.parts.map((p) => (
            <tr key={p.id}>
              <td className="pr-1 pb-1">
                <input aria-label="Onderdeel" value={p.name} onChange={(e) => setPart(p.id, { name: e.target.value })} className={field} />
              </td>
              <td className="pr-1 pb-1">
                <NumberInput label={`${p.name} telt mee`} value={p.weight} onChange={(n) => n !== null && n > 0 && setPart(p.id, { weight: Math.min(100, n) })} />
              </td>
              <td className="pr-1 pb-1">
                <NumberInput label={`${p.name} punt`} value={p.score} placeholder="nog niet" onChange={(n) => setPart(p.id, { score: n === null ? null : Math.min(p.max, Math.max(0, n)) })} />
              </td>
              <td className="pr-1 pb-1">
                <NumberInput label={`${p.name} op`} value={p.max} onChange={(n) => n !== null && n > 0 && setPart(p.id, { max: n, score: p.score === null ? null : Math.min(p.score, n) })} />
              </td>
              <td className="pb-1">
                <button type="button" aria-label={`${p.name} verwijderen`} className={smallButton} onClick={() => changeCourse(course.id, (c) => ({ ...c, parts: c.parts.filter((x) => x.id !== p.id) }))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {result.totalWeight !== 100 && course.parts.length > 0 && (
        <p className="text-xs text-nx-warning">De onderdelen tellen samen voor {decimal(result.totalWeight)}% mee in plaats van 100%. NEXUS rekent met die verhouding.</p>
      )}
      <NextExam course={course} result={result} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          onClick={() => changeCourse(course.id, (c) => ({ ...c, parts: [...c.parts, { id: crypto.randomUUID(), name: c.parts.length === 0 ? 'Examen' : 'Labo', weight: c.parts.length === 0 ? 100 : 30, score: null, max: 20 }] }))}
        >
          + Onderdeel
        </button>
        <button type="button" className={`${button} text-nx-danger`} onClick={() => changeCourse(course.id, (c) => ({ ...c, deletedAt: Date.now() }))}>
          Vak verwijderen
        </button>
      </div>
    </div>
  )
}

/** "Wat moet ik halen?": the mark your next exam needs, with the other open parts as you expect them. */
function NextExam({ course, result }: { course: Course; result: CourseResult }) {
  const open = course.parts.filter((p) => p.score === null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [expected, setExpected] = useState<number | null>(null)
  if (open.length === 0 || result.totalWeight === 0) return null
  const part = open.find((p) => p.id === chosen) ?? open[0]
  const others = open.length - 1
  const guess = expected ?? result.score ?? course.target
  const need = nextExamNeed(course, part.id, guess)
  if (!need) return null
  const out20 = part.max === 20
  let text: string
  let tone = ''
  if (need.status === 'safe') {
    text = `Je haalt je doel van ${formatMark(course.target)} al, wat je ook haalt op ${part.name}.`
    tone = 'text-nx-success'
  } else if (need.status === 'impossible') {
    text =
      others > 0 && need.minimum <= 20
        ? `Met ${formatMark(guess)} op de rest is zelfs ${part.max}/${part.max} op ${part.name} te weinig. Haal je meer op de rest, dan volstaat ${formatMark(need.minimum)}.`
        : `Je doel van ${formatMark(course.target)} haal je niet meer, zelfs niet met ${part.max}/${part.max} op ${part.name}.`
    tone = 'text-nx-danger'
  } else {
    text = `Op ${part.name} heb je minstens ${out20 ? formatMark(need.needed) : `${decimal(need.neededRaw)}/${decimal(part.max)} (${formatMark(need.needed)})`} nodig.`
    if (need.needed > 14) tone = 'text-nx-warning'
  }
  return (
    <section aria-label="Wat moet ik halen" className="space-y-2 rounded-lg border border-nx-border bg-nx-surface p-3">
      <p className="font-medium">Wat moet ik halen?</p>
      <div className="flex flex-wrap items-end gap-2">
        {open.length > 1 && (
          <label className="min-w-40 flex-1">
            <span className="text-xs text-nx-muted">Volgende examen</span>
            <select aria-label="Volgende examen" value={part.id} onChange={(e) => setChosen(e.target.value)} className={field}>
              {open.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({decimal(p.weight)}%)
                </option>
              ))}
            </select>
          </label>
        )}
        {others > 0 && (
          <label className="w-44">
            <span className="text-xs text-nx-muted">Verwacht op de rest (op 20)</span>
            <NumberInput label="Verwacht op de rest" value={guess} onChange={(n) => setExpected(n === null ? null : Math.min(20, Math.max(0, n)))} />
          </label>
        )}
      </div>
      <p className={tone} aria-live="polite">
        {text}
      </p>
      {others > 0 && need.status === 'open' && (
        <p className="text-xs text-nx-muted">
          Gerekend met {formatMark(guess)} op {others === 1 ? 'het andere open onderdeel' : `de ${others} andere open onderdelen`}. Haal je daar {formatMark(20)}, dan {need.minimum === 0 ? 'ben je al zeker door' : `volstaat ${formatMark(need.minimum)}`}.
        </p>
      )}
      <p className="text-xs text-nx-muted">Je doel van {formatMark(course.target)} ({decimal((course.target / 20) * 100)}%) pas je hierboven aan bij Doel.</p>
    </section>
  )
}

/** A number box that keeps what you type (also "12," halfway) and reports it once it is a number. */
function NumberInput({ label, value, placeholder, onChange }: { label: string; value: number | null; placeholder?: string; onChange: (n: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : decimal(value))
  const [focused, setFocused] = useState(false)
  const shown = focused ? text : value === null ? '' : decimal(value)
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={shown}
      placeholder={placeholder}
      onFocus={() => (setText(value === null ? '' : decimal(value)), setFocused(true))}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value)
        const n = number(e.target.value)
        if (n !== null || e.target.value.trim() === '') onChange(n)
      }}
      className={`${field} tabular-nums`}
    />
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number | null) => void }) {
  return (
    <label className="w-28">
      <span className="text-xs text-nx-muted">{label}</span>
      <NumberInput label={label} value={value} onChange={onChange} />
    </label>
  )
}
