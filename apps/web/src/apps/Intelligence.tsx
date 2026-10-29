import { useEffect, useState } from 'react'
import { describeFlow, RULE_IDS, RULE_INFO, type FlowDraft, type Suggestion } from '@nexus/core'
import { useFlows } from '../flows/store'
import { adjust, approve, dismiss, forgetFeedback, refreshNow, snooze, switchRule, useIntel } from '../intelligence/store'
import { onReveal, takeReveal } from '../search/reveal'
import { openApp } from '../shell/openApp'
import { readStorage, writeStorage } from '../state/storage'

const TABS = ['Voorstellen', 'Automatiseringen', 'Geschiedenis', 'Privacy'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.intelligence.tab'

const primary = 'rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text disabled:opacity-60'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2'
const field = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5'
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

/** Intelligence: rule-based proposals with an explanation, that only do something once you approve them. */
export function Intelligence() {
  const [tab, setTabState] = useState<Tab>(() => ((TABS as readonly string[]).includes(readStorage(TAB_KEY) ?? '') ? (readStorage(TAB_KEY) as Tab) : 'Voorstellen'))
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  // Opened from the Inbox: show the proposals.
  useEffect(() => {
    const check = () => takeReveal('intelligence') && setTab('Voorstellen')
    check()
    return onReveal(check)
  }, [])
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Intelligence" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {tab === 'Voorstellen' ? <Suggestions /> : tab === 'Automatiseringen' ? <Automations /> : tab === 'Geschiedenis' ? <History /> : <Privacy />}
      </div>
    </div>
  )
}

function Suggestions() {
  const { suggestions } = useIntel()
  const open = suggestions.filter((s) => s.status === 'open')
  const later = suggestions.filter((s) => s.status === 'snoozed')
  const [message, setMessage] = useState<string | null>(null)
  return (
    <>
      {message && (
        <p role="status" className="text-nx-muted">
          {message}
        </p>
      )}
      {open.length === 0 ? (
        <div className="space-y-2 text-nx-muted">
          <p>Geen voorstellen op dit moment. NEXUS kijkt elke 10 minuten en na een wijziging of er iets te verbeteren valt, en toont hoogstens één nieuw voorstel per uur.</p>
          <button type="button" className={small} onClick={() => setMessage(refreshNow() ? null : 'Niets nieuws gevonden.')}>
            Nu nakijken
          </button>
        </div>
      ) : (
        open.map((s) => <Card key={s.id} s={s} onDone={setMessage} />)
      )}
      {later.length > 0 && <p className="text-xs text-nx-muted">{later.length === 1 ? 'Eén voorstel komt' : `${later.length} voorstellen komen`} morgen terug (Later).</p>}
    </>
  )
}

function Card({ s, onDone }: { s: Suggestion; onDone: (m: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <article className="space-y-2 rounded-lg border border-nx-border p-3" aria-label={s.title}>
      <h3 className="font-medium">{s.title}</h3>
      <section>
        <h4 className="text-xs font-semibold text-nx-muted">Waarom</h4>
        <p>{s.reason}</p>
      </section>
      <section>
        <h4 className="text-xs font-semibold text-nx-muted">Gebruikte gegevens</h4>
        <ul className="list-disc pl-5">
          {s.data.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4 className="text-xs font-semibold text-nx-muted">Wat goedkeuren doet</h4>
        <ul className="list-disc pl-5" aria-label="Wat goedkeuren doet">
          {describeFlow(s.flow).map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
      {editing && <Editor draft={s.flow} onSave={(flow) => (adjust(s.id, flow), setEditing(false))} />}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primary}
          onClick={() => {
            try {
              approve(s.id)
              onDone(`Goedgekeurd: de flow "${s.flow.name}" staat in Flow Studio.`)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
        >
          Goedkeuren
        </button>
        <button type="button" className={button} onClick={() => setEditing(!editing)}>
          Aanpassen
        </button>
        <button type="button" className={button} onClick={() => (snooze(s.id), onDone('Dit voorstel komt morgen terug.'))}>
          Later
        </button>
        <button type="button" className={button} onClick={() => (dismiss(s.id), onDone(`Geweigerd. ${RULE_INFO[s.rule].title} stelt de komende 14 dagen niets voor.`))}>
          Weigeren
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
    </article>
  )
}

/** Changes the parts a proposal has: days and time, how long before a deadline, or the evening window. */
function Editor({ draft, onSave }: { draft: FlowDraft; onSave: (d: FlowDraft) => void }) {
  const [d, setD] = useState(draft)
  const t = d.trigger
  const evening = d.conditions.find((c) => c.type === 'local_time.in_range')
  return (
    <div className="space-y-2 rounded-md border border-nx-border p-2">
      {t.type === 'schedule.at_time' && (
        <>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((name, i) => (
              <label key={name} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={t.days.includes(i + 1)}
                  onChange={(e) => setD({ ...d, trigger: { ...t, days: e.target.checked ? [...t.days, i + 1].sort() : t.days.filter((x) => x !== i + 1) } })}
                  className="accent-[var(--nx-accent)]"
                />
                {name}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2">
            Om
            <input aria-label="Tijd" type="time" value={t.time} onChange={(e) => setD({ ...d, trigger: { ...t, time: e.target.value } })} className={field} />
          </label>
        </>
      )}
      {t.type === 'deadline.upcoming' && (
        <label className="flex items-center gap-2">
          Waarschuwen
          <select aria-label="Hoelang vooraf" value={t.minutesBefore} onChange={(e) => setD({ ...d, trigger: { ...t, minutesBefore: Number(e.target.value) } })} className={field}>
            <option value={60}>1 uur vooraf</option>
            <option value={180}>3 uur vooraf</option>
            <option value={1440}>1 dag vooraf</option>
          </select>
        </label>
      )}
      {evening && evening.type === 'local_time.in_range' && (
        <label className="flex flex-wrap items-center gap-2">
          Tussen
          <input aria-label="Van" type="time" value={evening.start} onChange={(e) => setD({ ...d, conditions: d.conditions.map((c) => (c === evening ? { ...evening, start: e.target.value } : c)) })} className={field} />
          en
          <input aria-label="Tot" type="time" value={evening.end} onChange={(e) => setD({ ...d, conditions: d.conditions.map((c) => (c === evening ? { ...evening, end: e.target.value } : c)) })} className={field} />
        </label>
      )}
      <button type="button" className={small} onClick={() => onSave(d)}>
        Wijziging bewaren
      </button>
    </div>
  )
}

function Automations() {
  const { suggestions, rules } = useIntel()
  const { flows } = useFlows()
  const made = suggestions.filter((s) => s.status === 'accepted' && s.flowId)
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">Regels</legend>
        {RULE_IDS.map((r) => (
          <label key={r} className="flex items-start gap-2">
            <input type="checkbox" checked={rules[r].enabled} onChange={(e) => switchRule(r, e.target.checked)} className="mt-1 accent-[var(--nx-accent)]" />
            <span>
              <span className="font-medium">{RULE_INFO[r].title}</span>
              <span className="block text-xs text-nx-muted">{RULE_INFO[r].description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <section className="space-y-2">
        <h3 className="font-medium">Flows uit voorstellen</h3>
        {made.length === 0 ? (
          <p className="text-nx-muted">Nog geen goedgekeurde voorstellen.</p>
        ) : (
          <ul className="space-y-2">
            {made.map((s) => {
              const flow = flows.find((f) => f.id === s.flowId)
              return (
                <li key={s.id} className="rounded-lg border border-nx-border p-3">
                  <div className="font-medium">{flow?.name ?? s.flow.name}</div>
                  <div className="text-xs text-nx-muted">
                    Goedgekeurd {when(s.decidedAt ?? s.createdAt)} · {flow ? (flow.enabled ? 'staat aan' : 'staat uit') : 'verwijderd in Flow Studio'}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <button type="button" className={small} onClick={() => openApp('flows')}>
          Flow Studio openen
        </button>
      </section>
    </div>
  )
}

const DECISIONS: Record<string, string> = { accepted: 'Goedgekeurd', dismissed: 'Geweigerd', expired: 'Verlopen (een week niets mee gedaan)' }

function History() {
  const { suggestions } = useIntel()
  const done = suggestions.filter((s) => s.status === 'accepted' || s.status === 'dismissed' || s.status === 'expired')
  if (done.length === 0) return <p className="text-nx-muted">Nog geen beslissingen.</p>
  return (
    <ul className="space-y-2" aria-label="Geschiedenis">
      {done.map((s) => (
        <li key={s.id} className="rounded-lg border border-nx-border p-3">
          <div className="font-medium">
            {DECISIONS[s.status]}: {s.title}
          </div>
          <div className="text-xs text-nx-muted">
            {when(s.decidedAt ?? s.createdAt)} · regel {RULE_INFO[s.rule].title}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Privacy() {
  const [done, setDone] = useState(false)
  return (
    <div className="space-y-3">
      <p>De regels draaien op dit toestel en gebruiken geen AI. Ze kijken alleen naar dagen, uren en aantallen: welke dagen je les hebt, hoeveel deadlines eraan komen, of er een update klaarstaat en welke flows je al hebt. Titels van deadlines en de inhoud van notities gebruiken ze niet.</p>
      <p>Niets gebeurt zonder dat jij het goedkeurt. Een goedgekeurd voorstel wordt een gewone flow in Flow Studio, die je daar kan aanpassen, pauzeren of verwijderen.</p>
      <p>Je antwoorden (goedgekeurd, geweigerd, later) blijven op dit toestel. Weigeren houdt een regel 14 dagen stil, en hetzelfde voorstel komt niet terug.</p>
      <button type="button" className={button} onClick={() => (forgetFeedback(), setDone(true))}>
        Antwoorden en wachttijden vergeten
      </button>
      {done && <p role="status" className="text-nx-muted">Vergeten. De regels mogen weer voorstellen doen.</p>}
    </div>
  )
}
