import { useMemo, useState } from 'react'
import { AI_MODULES, approvalCounts, filterApprovals, OUTCOME_LABELS, type ApprovalEntry, type ApprovalFilter } from '@nexus/core'
import { aiContextStore, approvalLog, useAiContext, useApprovals } from './context'
import { alwaysAllowedList, forgetAlways } from './session'
import { TOOL_SPECS } from './tools'

const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const when = (t: number) =>
  new Date(t).toLocaleString('nl-BE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Per module: may NEXUS AI see and use it. Plus the actions that run without asking. */
export function AiContextSettings() {
  const context = useAiContext()
  const [always, setAlways] = useState(alwaysAllowedList)
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">Wat NEXUS AI mag zien</legend>
        <p className="text-xs text-nx-muted">Een module die uitstaat, gaat niet mee naar NEXUS AI: de assistent kan ze niet lezen of veranderen, en het Weekoverzicht en het geldadvies laten ze weg. Dit geldt voor dit apparaat.</p>
        {AI_MODULES.map((m) => (
          <label key={m.id} className="flex items-start gap-2">
            <input type="checkbox" checked={context[m.id]} onChange={(e) => aiContextStore.set(m.id, e.target.checked)} className="mt-1 accent-[var(--nx-accent)]" />
            <span>
              <span className="font-medium">{m.title}</span>
              <span className="block text-xs text-nx-muted">{m.description}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-nx-muted">Een bestand dat je zelf kiest voor een studiesamenvatting gaat altijd mee, want daar vraag je het zelf.</p>
      </fieldset>
      <section className="space-y-2">
        <h3 className="font-medium">Altijd toegestaan</h3>
        {always.length === 0 ? (
          <p className="text-nx-muted">Geen. Elke actie vraagt eerst je toestemming.</p>
        ) : (
          <ul className="space-y-1">
            {always.map((name) => (
              <li key={name} className="flex items-center justify-between gap-2">
                <span>{TOOL_SPECS[name]?.label ?? name}</span>
                <button
                  type="button"
                  className={small}
                  aria-label={`${TOOL_SPECS[name]?.label ?? name} weer vragen`}
                  onClick={() => {
                    forgetAlways(name)
                    setAlways(alwaysAllowedList())
                  }}
                >
                  Weer vragen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const FILTERS: Array<{ id: ApprovalFilter; label: string }> = [
  { id: 'all', label: 'Alles' },
  { id: 'ai', label: 'NEXUS AI' },
  { id: 'intelligence', label: 'Voorstellen' },
  { id: 'denied', label: 'Geweigerd' },
]

const NO = new Set(['denied', 'blocked', 'dismissed'])

/**
 * Every approval on this device, newest first: actions of NEXUS AI and proposals of Intelligence.
 * [extra] adds older decisions that were made before the history existed (deduplicated by id).
 */
export function ApprovalHistory({ initial = 'all', extra = [] }: { initial?: ApprovalFilter; extra?: ApprovalEntry[] }) {
  const logged = useApprovals()
  const [filter, setFilter] = useState<ApprovalFilter>(initial)
  const all = useMemo(() => {
    const ids = new Set(logged.map((e) => e.id))
    return [...logged, ...extra.filter((e) => !ids.has(e.id))].sort((a, b) => b.at - a.at)
  }, [logged, extra])
  const shown = filterApprovals(all, filter)
  const counts = approvalCounts(all)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} className={`${small} ${filter === f.id ? 'bg-nx-surface-2 font-medium' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {all.length > 0 && (
        <p className="text-xs text-nx-muted">
          {counts.yes} keer ja, {counts.no} keer nee
          {counts.other > 0 ? `, ${counts.other} keer later of verlopen` : ''}.
        </p>
      )}
      {shown.length === 0 ? (
        <p className="text-nx-muted">Nog geen beslissingen.</p>
      ) : (
        <ul className="space-y-2" aria-label="Geschiedenis van goedkeuringen">
          {shown.map((e) => (
            <li key={e.id} className="rounded-lg border border-nx-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{e.label}</span>
                <span className={`text-xs ${NO.has(e.outcome) ? 'text-red-500' : 'text-nx-muted'}`}>{OUTCOME_LABELS[e.outcome]}</span>
              </div>
              <p className="text-xs">{e.detail}</p>
              <p className="text-xs text-nx-muted">
                {when(e.at)} · {e.source === 'ai' ? 'NEXUS AI' : 'Intelligence'}
              </p>
            </li>
          ))}
        </ul>
      )}
      {logged.length > 0 && (
        <button type="button" className={small} onClick={() => approvalLog.clear()}>
          Geschiedenis wissen
        </button>
      )}
      <p className="text-xs text-nx-muted">De geschiedenis blijft op dit apparaat, de laatste 300 beslissingen.</p>
    </div>
  )
}
