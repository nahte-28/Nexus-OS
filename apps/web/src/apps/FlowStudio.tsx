import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  ACTION_LABELS,
  ACTION_TYPES,
  CONDITION_LABELS,
  CONDITION_TYPES,
  conditionHolds,
  defaultAction,
  defaultCondition,
  defaultTrigger,
  describeAction,
  describeCondition,
  describeTrigger,
  FLOW_TEMPLATES,
  MAX_ACTIONS,
  MAX_CONDITIONS,
  MAX_RUNS_PER_HOUR,
  nextScheduledRun,
  PROFILE_IDS,
  PROMPT_APPS,
  TRIGGER_LABELS,
  TRIGGER_TYPES,
  validateFlow,
  type ActionType,
  type ConditionType,
  type FlowAction,
  type FlowCondition,
  type FlowDefinition,
  type FlowTemplate,
  type FlowTrigger,
  type ProfileId,
  type TriggerType,
} from '@nexus/core'
import { useConnect } from '../connect/ConnectContext'
import { builderView, setBuilderView, type BuilderView } from '../flows/canvas'
import { FlowCanvas } from '../flows/FlowCanvas'
import { appName, currentContext, defaultEffects, runNow } from '../flows/runner'
import { flowsStore, useFlowRuns, useFlows, type FlowRun } from '../flows/store'
import { clearFlowRuns, fetchFlowsServerStatus, flowsSyncOn, flowsSyncStatus, setFlowsSyncOn, type FlowsServerStatus } from '../flows/sync'

const field = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const card = 'rounded-lg border border-nx-border p-3'

type Tab = 'flows' | 'templates' | 'builder' | 'runs' | 'settings'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'flows', label: 'Mijn flows' },
  { id: 'templates', label: 'Sjablonen' },
  { id: 'builder', label: 'Bouwer' },
  { id: 'runs', label: 'Runs' },
  { id: 'settings', label: 'Instellingen' },
]

const PROFILE_NAMES: Record<ProfileId, string> = { school: 'School', personal: 'Persoonlijk', gaming: 'Gaming', developer: 'Developer' }
const DAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const time = (at: number) => new Date(at).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function newFlow(from?: FlowTemplate['flow'], now = Date.now()): FlowDefinition {
  return {
    id: crypto.randomUUID(),
    name: from?.name ?? 'Nieuwe flow',
    enabled: true,
    version: 0,
    trigger: from ? structuredClone(from.trigger) : defaultTrigger('schedule.at_time'),
    conditions: from ? structuredClone(from.conditions) : [],
    actions: from ? structuredClone(from.actions) : [defaultAction('notification.send')],
    timeZone: '',
    createdAt: now,
    updatedAt: now,
  }
}

/** What a flow needs that may be missing, shown on its card. */
function needs(flow: FlowDefinition): string[] {
  const list: string[] = []
  if (flow.actions.some((a) => a.type === 'notification.send' && a.target === 'phone')) list.push('NEXUS Connect met een gsm')
  if (flow.trigger.type === 'device.offline') list.push('NEXUS Connect')
  if (flow.trigger.type === 'update.available') list.push('de Windows-app')
  if (flow.trigger.type === 'deadline.upcoming') list.push('herinneringen')
  if (flow.trigger.type.startsWith('finance.')) list.push('Financiën')
  return list
}

/** The builder's draft with undo and redo; kept here so switching tabs never loses it. */
function useDraft() {
  const [history, setHistory] = useState<{ past: FlowDefinition[]; present: FlowDefinition | null; future: FlowDefinition[] }>({
    past: [],
    present: null,
    future: [],
  })
  const [saved, setSaved] = useState<string | null>(null)
  return {
    draft: history.present,
    dirty: history.present !== null && JSON.stringify(history.present) !== saved,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    open(flow: FlowDefinition) {
      setHistory({ past: [], present: flow, future: [] })
      setSaved(flow.version > 0 ? JSON.stringify(flow) : null)
    },
    change(flow: FlowDefinition) {
      setHistory((h) => ({ past: h.present ? [...h.past, h.present].slice(-50) : h.past, present: flow, future: [] }))
    },
    undo() {
      setHistory((h) => (h.past.length && h.present ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h))
    },
    redo() {
      setHistory((h) => (h.future.length && h.present ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h))
    },
    markSaved(flow: FlowDefinition) {
      setHistory((h) => ({ ...h, present: flow }))
      setSaved(JSON.stringify(flow))
    },
    close() {
      setHistory({ past: [], present: null, future: [] })
      setSaved(null)
    },
  }
}

/** NEXUS Flow Studio: automations from a trigger, conditions and actions. */
export function FlowStudio() {
  const [tab, setTab] = useState<Tab>('flows')
  const draft = useDraft()
  const edit = (flow: FlowDefinition) => {
    draft.open(flow)
    setTab('builder')
  }
  return (
    <div className="flex h-full flex-col text-sm">
      <div role="tablist" aria-label="Flow Studio" className="flex shrink-0 gap-1 overflow-x-auto border-b border-nx-border px-3 pt-2">
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
            {t.id === 'builder' && draft.dirty ? ' •' : ''}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === 'flows' && <MyFlows onEdit={edit} onNew={() => edit(newFlow())} />}
        {tab === 'templates' && <Templates onUse={(t) => edit(newFlow(t.flow))} />}
        {tab === 'builder' && <Builder draft={draft} onNew={() => edit(newFlow())} onDone={() => setTab('flows')} />}
        {tab === 'runs' && <Runs />}
        {tab === 'settings' && <FlowSettingsTab />}
      </div>
    </div>
  )
}

function MyFlows({ onEdit, onNew }: { onEdit: (flow: FlowDefinition) => void; onNew: () => void }) {
  const { flows, settings } = useFlows()
  const runs = useFlowRuns()
  const { engine } = useConnect()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-nx-muted">
          Flows lopen zolang NEXUS ergens open is (de Windows-app in het systeemvak is het betrouwbaarst), en elke keer op één apparaat. Ze
          openen nooit zelf apps en installeren nooit zelf iets.
        </p>
        <button type="button" className={primaryButton} onClick={onNew}>
          Nieuwe flow
        </button>
      </div>
      {settings.paused && (
        <p role="status" className="rounded-lg border border-nx-accent p-2">
          Alle flows zijn gepauzeerd. Zet ze terug aan in Instellingen.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {flows.length === 0 ? (
        <p className="text-nx-muted">Nog geen flows. Begin met een sjabloon of maak er zelf een.</p>
      ) : (
        <ul aria-label="Flows" className="space-y-2">
          {flows.map((flow) => {
            const last = runs.find((r) => r.flowId === flow.id)
            const next = nextScheduledRun(flow, Date.now())
            const required = needs(flow)
            return (
              <li key={flow.id} className={card}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">{flow.name}</p>
                    <p className="text-nx-muted">{describeTrigger(flow.trigger)}</p>
                    <p className="text-xs text-nx-muted">
                      {last ? `Laatste run: ${time(last.at)} · ${RUN_STATUS[last.status]}` : 'Nog niet gelopen'}
                      {next ? ` · Volgende: ${time(next)}` : ''}
                    </p>
                    {required.length > 0 && <p className="text-xs text-nx-muted">Nodig: {required.join(', ')}</p>}
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={flow.enabled}
                      onChange={(e) => flowsStore.setEnabled(flow.id, e.target.checked)}
                      className="accent-[var(--nx-accent)]"
                      aria-label={`${flow.name} aan`}
                    />
                    Aan
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={button} onClick={() => onEdit(structuredClone(flow))}>
                    Bewerken
                  </button>
                  <button
                    type="button"
                    className={button}
                    onClick={() => {
                      void runNow(flow, currentContext(engine), defaultEffects(engine)).then((run) =>
                        setMessage(`${flow.name}: ${RUN_STATUS[run.status]}${run.reason ? ` (${run.reason})` : ''}`),
                      )
                    }}
                  >
                    Uitvoeren
                  </button>
                  <button
                    type="button"
                    className={button}
                    onClick={() => flowsStore.save({ ...structuredClone(flow), id: crypto.randomUUID(), name: `${flow.name} (kopie)`, version: 0, enabled: false })}
                  >
                    Dupliceren
                  </button>
                  {deleting === flow.id ? (
                    <>
                      <button
                        type="button"
                        className={`${button} border-red-500 text-red-500`}
                        onClick={() => {
                          flowsStore.remove(flow.id)
                          setDeleting(null)
                        }}
                      >
                        Ja, verwijderen
                      </button>
                      <button type="button" className={button} onClick={() => setDeleting(null)}>
                        Annuleren
                      </button>
                    </>
                  ) : (
                    <button type="button" className={button} onClick={() => setDeleting(flow.id)}>
                      Verwijderen
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Templates({ onUse }: { onUse: (template: FlowTemplate) => void }) {
  return (
    <ul aria-label="Sjablonen" className="grid gap-2 sm:grid-cols-2">
      {FLOW_TEMPLATES.map((t) => (
        <li key={t.id} className={`${card} flex flex-col gap-2`}>
          <div>
            <p className="text-xs font-semibold tracking-wide text-nx-accent uppercase">{t.category}</p>
            <p className="font-medium">{t.title}</p>
            <p className="text-nx-muted">{t.description}</p>
          </div>
          <ul className="list-disc pl-5 text-xs text-nx-muted">
            <li>{describeTrigger(t.flow.trigger)}</li>
            {t.flow.conditions.map((c, i) => (
              <li key={i}>Alleen als: {describeCondition(c)}</li>
            ))}
            {t.flow.actions.map((a, i) => (
              <li key={i}>{describeAction(a, {}, appName)}</li>
            ))}
          </ul>
          <div className="mt-auto">
            <button type="button" className={button} onClick={() => onUse(t)}>
              Gebruiken
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Builder({ draft, onNew, onDone }: { draft: ReturnType<typeof useDraft>; onNew: () => void; onDone: () => void }) {
  const flow = draft.draft
  const [message, setMessage] = useState<string | null>(null)
  const [view, setView] = useState<BuilderView>(builderView)
  if (!flow) {
    return (
      <div className="space-y-2">
        <p className="text-nx-muted">Kies een flow om te bewerken, begin met een sjabloon, of maak een nieuwe.</p>
        <button type="button" className={primaryButton} onClick={onNew}>
          Nieuwe flow
        </button>
      </div>
    )
  }
  const error = validateFlow(flow)
  const set = (patch: Partial<FlowDefinition>) => {
    draft.change({ ...flow, ...patch })
    setMessage(null)
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          Naam
          <input className={field} value={flow.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={flow.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="accent-[var(--nx-accent)]" />
          Aan
        </label>
        <button type="button" className={button} onClick={draft.undo} disabled={!draft.canUndo}>
          Ongedaan maken
        </button>
        <button type="button" className={button} onClick={draft.redo} disabled={!draft.canRedo}>
          Opnieuw
        </button>
        <button
          type="button"
          className={primaryButton}
          disabled={error !== null}
          onClick={() => {
            const saved = flowsStore.save(flow)
            draft.markSaved(saved)
            setMessage('Bewaard.')
          }}
        >
          Bewaren
        </button>
        {draft.dirty ? (
          <button
            type="button"
            className={button}
            onClick={() => {
              draft.close()
              onDone()
            }}
          >
            Wijzigingen weggooien
          </button>
        ) : (
          <button
            type="button"
            className={button}
            onClick={() => {
              draft.close()
              onDone()
            }}
          >
            Klaar
          </button>
        )}
      </div>
      {draft.dirty && <p className="text-nx-muted">Niet bewaard.</p>}
      {message && <p role="status">{message}</p>}

      <div role="radiogroup" aria-label="Weergave" className="inline-flex rounded-lg border border-nx-border p-0.5">
        {(['list', 'canvas'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            onClick={() => {
              setView(v)
              setBuilderView(v)
            }}
            className={`rounded-md px-3 py-1 ${view === v ? 'bg-nx-accent text-nx-accent-text' : 'text-nx-muted'}`}
          >
            {v === 'list' ? 'Lijst' : 'Canvas'}
          </button>
        ))}
      </div>

      {view === 'canvas' ? (
        <div className="space-y-4">
          <FlowCanvas
            flow={flow}
            onChange={(next) => set(next)}
            editors={{
              trigger: (t, onChange) => <TriggerEditor trigger={t} onChange={onChange} />,
              condition: (c, onChange) => <ConditionEditor condition={c} onChange={onChange} />,
              action: (a, onChange) => <ActionEditor action={a} onChange={onChange} />,
            }}
          />
          <DryRun flow={flow} error={error} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
          <div className="space-y-3">
            <section aria-label="Wanneer" className={card}>
              <h3 className="mb-2 font-semibold">1. Wanneer</h3>
              <TriggerEditor trigger={flow.trigger} onChange={(trigger) => set({ trigger })} />
            </section>
            <section aria-label="Alleen als" className={card}>
              <h3 className="mb-2 font-semibold">2. Alleen als (allemaal waar)</h3>
              <ul className="space-y-2">
                {flow.conditions.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-end gap-2">
                    <ConditionEditor condition={c} onChange={(next) => set({ conditions: flow.conditions.map((x, j) => (j === i ? next : x)) })} />
                    <button type="button" className={button} onClick={() => set({ conditions: flow.conditions.filter((_, j) => j !== i) })}>
                      Weg
                    </button>
                  </li>
                ))}
              </ul>
              {flow.conditions.length < MAX_CONDITIONS && (
                <AddSelect
                  label="Voorwaarde toevoegen"
                  options={CONDITION_TYPES.map((t) => ({ id: t, label: CONDITION_LABELS[t] }))}
                  onAdd={(t) => set({ conditions: [...flow.conditions, defaultCondition(t as ConditionType)] })}
                />
              )}
            </section>
            <section aria-label="Doe dit" className={card}>
              <h3 className="mb-2 font-semibold">3. Doe dit</h3>
              <ol className="space-y-3">
                {flow.actions.map((a, i) => (
                  <li key={i} className="space-y-2 border-b border-nx-border pb-3 last:border-0 last:pb-0">
                    <ActionEditor action={a} onChange={(next) => set({ actions: flow.actions.map((x, j) => (j === i ? next : x)) })} />
                    <button type="button" className={button} onClick={() => set({ actions: flow.actions.filter((_, j) => j !== i) })}>
                      Actie weg
                    </button>
                  </li>
                ))}
              </ol>
              {flow.actions.length < MAX_ACTIONS && (
                <AddSelect
                  label="Actie toevoegen"
                  options={ACTION_TYPES.map((t) => ({ id: t, label: ACTION_LABELS[t] }))}
                  onAdd={(t) => set({ actions: [...flow.actions, defaultAction(t as ActionType)] })}
                />
              )}
            </section>
          </div>
          <DryRun flow={flow} error={error} />
        </div>
      )}
    </div>
  )
}

function AddSelect({ label, options, onAdd }: { label: string; options: Array<{ id: string; label: string }>; onAdd: (id: string) => void }) {
  return (
    <label className="mt-2 flex flex-col gap-1 sm:max-w-xs">
      {label}
      <select
        className={field}
        value=""
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value)
        }}
      >
        <option value="">Kies…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ProfileSelect({ value, onChange, label = 'Profiel' }: { value: ProfileId; onChange: (id: ProfileId) => void; label?: string }) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      <select className={field} value={value} onChange={(e) => onChange(e.target.value as ProfileId)}>
        {PROFILE_IDS.map((id) => (
          <option key={id} value={id}>
            {PROFILE_NAMES[id]}
          </option>
        ))}
      </select>
    </label>
  )
}

function TriggerEditor({ trigger, onChange }: { trigger: FlowTrigger; onChange: (t: FlowTrigger) => void }) {
  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1 sm:max-w-xs">
        Start
        <select className={field} value={trigger.type} onChange={(e) => onChange(defaultTrigger(e.target.value as TriggerType))}>
          {TRIGGER_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      {trigger.type === 'schedule.at_time' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            Tijdstip
            <input type="time" className={field} value={trigger.time} onChange={(e) => onChange({ ...trigger, time: e.target.value })} />
          </label>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Dagen</legend>
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={trigger.days.includes(i + 1)}
                  onChange={(e) =>
                    onChange({ ...trigger, days: e.target.checked ? [...trigger.days, i + 1].sort() : trigger.days.filter((x) => x !== i + 1) })
                  }
                  className="accent-[var(--nx-accent)]"
                />
                {d}
              </label>
            ))}
          </fieldset>
        </div>
      )}
      {trigger.type === 'deadline.upcoming' && (
        <label className="flex flex-col gap-1 sm:max-w-xs">
          Minuten op voorhand
          <input
            type="number"
            min={5}
            className={field}
            value={trigger.minutesBefore}
            onChange={(e) => onChange({ ...trigger, minutesBefore: Math.round(Number(e.target.value)) })}
          />
        </label>
      )}
      {trigger.type === 'device.offline' && (
        <label className="flex flex-col gap-1 sm:max-w-xs">
          Minuten offline
          <input type="number" min={15} className={field} value={trigger.minutes} onChange={(e) => onChange({ ...trigger, minutes: Math.round(Number(e.target.value)) })} />
        </label>
      )}
      {trigger.type === 'finance.budget_used' && (
        <label className="flex flex-col gap-1 sm:max-w-xs">
          Percentage van het budget
          <input type="number" min={1} max={200} className={field} value={trigger.percent} onChange={(e) => onChange({ ...trigger, percent: Math.round(Number(e.target.value)) })} />
        </label>
      )}
      {trigger.type === 'finance.payment_due' && (
        <label className="flex flex-col gap-1 sm:max-w-xs">
          Dagen op voorhand
          <input type="number" min={0} max={30} className={field} value={trigger.daysBefore} onChange={(e) => onChange({ ...trigger, daysBefore: Math.round(Number(e.target.value)) })} />
        </label>
      )}
      {trigger.type === 'finance.expense_added' && (
        <label className="flex flex-col gap-1 sm:max-w-xs">
          Vanaf welk bedrag (€)
          <input
            type="number"
            min={0}
            step="0.01"
            className={field}
            value={trigger.minAmount / 100}
            onChange={(e) => onChange({ ...trigger, minAmount: Math.max(0, Math.round(Number(e.target.value) * 100)) })}
          />
        </label>
      )}
      <p className="text-xs text-nx-muted">
        {trigger.type === 'finance.budget_used' && 'Kijkt naar je budgetten in Financiën, één keer per budget per maand. In de tekst kun je {categorie}, {procent} en {over} gebruiken.'}
        {trigger.type === 'finance.payment_due' && 'Kijkt naar je abonnementen in Financiën. In de tekst kun je {naam}, {bedrag} en {datum} gebruiken.'}
        {trigger.type === 'finance.expense_added' &&
          'Voor uitgaven die je zelf toevoegt, niet voor een import uit je bank. In de tekst kun je {bedrag} en {categorie} gebruiken.'}
        {trigger.type === 'deadline.upcoming' && 'Kijkt naar je herinneringen. In de tekst kun je {titel} en {tijd} gebruiken.'}
        {trigger.type === 'device.offline' && 'Kijkt naar je gekoppelde apparaten. Eén melding per keer offline; {apparaat} is de naam.'}
        {trigger.type === 'update.available' && 'Alleen in de Windows-app. {versie} is het nieuwe versienummer.'}
        {trigger.type === 'schedule.at_time' && 'Lukt het niet meteen (NEXUS sliep), dan loopt de flow nog tot een halfuur later, één keer per dag.'}
        {trigger.type === 'manual' && 'Start met Uitvoeren in Mijn flows.'}
      </p>
    </div>
  )
}

function ConditionEditor({ condition, onChange }: { condition: FlowCondition; onChange: (c: FlowCondition) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        Voorwaarde
        <select className={field} value={condition.type} onChange={(e) => onChange(defaultCondition(e.target.value as ConditionType))}>
          {CONDITION_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONDITION_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      {condition.type === 'profile.is_active' && <ProfileSelect value={condition.profile} onChange={(profile) => onChange({ ...condition, profile })} />}
      {condition.type === 'local_time.in_range' && (
        <>
          <label className="flex flex-col gap-1">
            Van
            <input type="time" className={field} value={condition.start} onChange={(e) => onChange({ ...condition, start: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            Tot
            <input type="time" className={field} value={condition.end} onChange={(e) => onChange({ ...condition, end: e.target.value })} />
          </label>
        </>
      )}
    </div>
  )
}

function ActionEditor({ action, onChange }: { action: FlowAction; onChange: (a: FlowAction) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        Actie
        <select className={field} value={action.type} onChange={(e) => onChange(defaultAction(e.target.value as ActionType))}>
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTION_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      {action.type === 'profile.activate' && (
        <>
          <ProfileSelect value={action.profile} onChange={(profile) => onChange({ ...action, profile })} />
          <label className="flex flex-col gap-1">
            Hoelang
            <select className={field} value={action.duration} onChange={(e) => onChange({ ...action, duration: e.target.value as typeof action.duration })}>
              <option value="until-change">Tot het schema wisselt</option>
              <option value="hour">Eén uur</option>
              <option value="today">Tot het einde van de dag</option>
            </select>
          </label>
        </>
      )}
      {action.type === 'notification.send' && (
        <>
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            Titel
            <input className={field} value={action.title} maxLength={120} onChange={(e) => onChange({ ...action, title: e.target.value })} />
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            Tekst
            <input className={field} value={action.text} maxLength={1000} onChange={(e) => onChange({ ...action, text: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            Waar
            <select className={field} value={action.target} onChange={(e) => onChange({ ...action, target: e.target.value as typeof action.target })}>
              <option value="this_device">Op het apparaat dat de flow uitvoert</option>
              <option value="phone">Ook op gsm en horloge</option>
            </select>
          </label>
        </>
      )}
      {action.type === 'app.open_prompt' && (
        <label className="flex flex-col gap-1">
          App
          <select className={field} value={action.app} onChange={(e) => onChange({ ...action, app: e.target.value as typeof action.app })}>
            {PROMPT_APPS.map((id) => (
              <option key={id} value={id}>
                {appName(id)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

/** Shows what the flow would do right now, without doing anything. */
function DryRun({ flow, error }: { flow: FlowDefinition; error: string | null }) {
  const { engine } = useConnect()
  const [tick, setTick] = useState(0)
  const context = useMemo(() => currentContext(engine), [engine, tick])
  const next = nextScheduledRun({ ...flow, enabled: true }, context.now)
  const conditions = flow.conditions.map((c) => ({ c, ok: conditionHolds(c, context, flow.timeZone) }))
  const wouldRun = conditions.every((x) => x.ok)
  return (
    <aside aria-label="Proefrun" className={`${card} h-fit space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Proefrun</h3>
        <button type="button" className={button} onClick={() => setTick((t) => t + 1)}>
          Opnieuw testen
        </button>
      </div>
      <p className="text-xs text-nx-muted">Laat zien wat er nu zou gebeuren. Er wordt niets veranderd of verstuurd.</p>
      {error ? (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      ) : (
        <>
          <p>{describeTrigger(flow.trigger)}</p>
          {next && <p className="text-nx-muted">Volgende keer: {time(next)}</p>}
          {conditions.length > 0 && (
            <ul>
              {conditions.map(({ c, ok }, i) => (
                <li key={i}>
                  {ok ? '✓' : '✗'} {describeCondition(c)}
                </li>
              ))}
            </ul>
          )}
          <p className="font-medium">{wouldRun ? 'Zou nu dit doen:' : 'Zou nu niets doen, een voorwaarde klopt niet. Anders:'}</p>
          <ol className="list-decimal pl-5">
            {flow.actions.map((a, i) => (
              <li key={i}>{describeAction(a, {}, appName)}</li>
            ))}
          </ol>
          {needs(flow).length > 0 && <p className="text-xs text-nx-muted">Nodig: {needs(flow).join(', ')}</p>}
        </>
      )}
    </aside>
  )
}

const RUN_STATUS: Record<FlowRun['status'], string> = { ok: 'gelukt', failed: 'mislukt', skipped: 'overgeslagen' }

function Runs() {
  const runs = useFlowRuns()
  const { flows } = useFlows()
  const { engine } = useConnect()
  if (runs.length === 0) return <p className="text-nx-muted">Nog geen runs. Hier zie je wat elke flow deed en waarom iets niet lukte.</p>
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" className={button} onClick={() => void clearFlowRuns()}>
          Geschiedenis wissen
        </button>
      </div>
      <ul aria-label="Runs" className="space-y-2">
        {runs.map((run) => {
          const flow = flows.find((f) => f.id === run.flowId)
          return (
            <li key={run.id} className={card}>
              <p className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{run.flowName}</span>
                <span className={run.status === 'failed' ? 'text-red-500' : 'text-nx-muted'}>
                  {RUN_STATUS[run.status]}
                  {run.reason ? `: ${run.reason}` : ''}
                </span>
              </p>
              <p className="text-xs text-nx-muted">
                {time(run.at)} · {run.manual ? 'met de hand' : run.event}
                {run.device ? ` · op ${run.device}` : ''}
              </p>
              {run.steps.length > 0 && (
                <ul className="mt-1 text-xs">
                  {run.steps.map((s, i) => (
                    <li key={i}>
                      {s.status === 'ok' ? '✓' : s.status === 'skipped' ? '–' : '✗'} {s.action}
                      {s.detail ? ` (${s.detail})` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {run.status === 'failed' && flow && (
                <button type="button" className={`${button} mt-2`} onClick={() => void runNow(flow, currentContext(engine), defaultEffects(engine))}>
                  Opnieuw proberen
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function FlowSettingsTab() {
  const { settings } = useFlows()
  const setSettings = (patch: Partial<Omit<typeof settings, 'updatedAt'>>) => flowsStore.setSettings(patch)
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.paused} onChange={(e) => setSettings({ paused: e.target.checked })} className="accent-[var(--nx-accent)]" />
        Alles pauzeren: geen enkele flow loopt, tot je dit weer uitzet
      </label>
      <FlowsSyncSetting />
      <fieldset className="space-y-2 border-t border-nx-border pt-4">
        <legend className="mb-2 font-semibold text-nx-muted">Stille uren</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.quiet.enabled}
            onChange={(e) => setSettings({ quiet: { ...settings.quiet, enabled: e.target.checked } })}
            className="accent-[var(--nx-accent)]"
          />
          Flows sturen dan geen meldingen (de rest gebeurt wel)
        </label>
        <div className="flex gap-2">
          <label className="flex flex-col gap-1">
            Van
            <input type="time" className={field} value={settings.quiet.start} onChange={(e) => setSettings({ quiet: { ...settings.quiet, start: e.target.value } })} />
          </label>
          <label className="flex flex-col gap-1">
            Tot
            <input type="time" className={field} value={settings.quiet.end} onChange={(e) => setSettings({ quiet: { ...settings.quiet, end: e.target.value } })} />
          </label>
        </div>
      </fieldset>
      <div className="space-y-1 border-t border-nx-border pt-4 text-nx-muted">
        <p>
          Grenzen: hoogstens {MAX_RUNS_PER_HOUR} runs per flow per uur, {MAX_CONDITIONS} voorwaarden en {MAX_ACTIONS} acties. De geschiedenis houdt de
          laatste 100 runs, hoogstens 30 dagen. Je account bewaart van een run alleen welke flow, wanneer, op welk apparaat en wat elke actie
          deed, nooit de titel van een deadline of de tekst van een melding.
        </p>
        <p>Flow Studio helemaal uitzetten kan in Instellingen.</p>
      </div>
    </div>
  )
}

const SYNC_TEXT = {
  unavailable: 'Deze versie van NEXUS heeft geen verbinding met Supabase, dus flows blijven op dit apparaat.',
  off: 'Uit: flows, pauze en stille uren blijven op dit apparaat.',
  'signed-out': 'Meld je aan in Account om je flows op al je apparaten te hebben.',
  syncing: 'Bezig met synchroniseren…',
  synced: 'Gesynchroniseerd',
  error: 'Synchroniseren lukte niet',
} as const

function FlowsSyncSetting() {
  const status = useSyncExternalStore(flowsSyncStatus.subscribe, flowsSyncStatus.getSnapshot)
  const [on, setOn] = useState(flowsSyncOn)
  return (
    <fieldset className="space-y-2 border-t border-nx-border pt-4">
      <legend className="mb-2 font-semibold text-nx-muted">Synchroniseren</legend>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked)
            setFlowsSyncOn(e.target.checked)
          }}
          className="accent-[var(--nx-accent)]"
        />
        Flows, pauze, stille uren en runs op al mijn apparaten
      </label>
      <p className="text-nx-muted" role="status">
        {SYNC_TEXT[status.state]}
        {status.state === 'synced' && status.at ? ` om ${new Date(status.at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}` : ''}
        {status.state === 'error' && status.error ? `: ${status.error}` : ''}
      </p>
      <p className="text-nx-muted">
        Staat een flow op meerdere apparaten, dan voert het eerste apparaat dat het moment ziet ze uit en slaan de andere het over. Zonder
        verbinding voert elk apparaat ze zelf uit, zodat een herinnering nooit op het netwerk wacht.
      </p>
      {status.state === 'synced' && <FlowsServerSetting />}
    </fieldset>
  )
}

/** Whether fixed-time profile flows also run while NEXUS is closed everywhere. */
function FlowsServerSetting() {
  const [server, setServer] = useState<FlowsServerStatus | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void fetchFlowsServerStatus().then((s) => live && setServer(s))
    return () => {
      live = false
    }
  }, [])
  if (server === undefined) return null
  const last = server?.lastRun
    ? ` Laatst: ${new Date(server.lastRun).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`
    : ''
  return (
    <p className="text-nx-muted" data-testid="flows-server">
      {server?.scheduled
        ? `Ook als NEXUS overal dicht is: een flow op een vast tijdstip die een profiel kiest, kiest het een paar minuten later toch in je account.${last}`
        : 'Flows lopen alleen terwijl NEXUS ergens open is. Voer de SQL voor flows op de server uit (Account › Database-check) om profielkeuzes ook te laten lopen als alles dicht is.'}
    </p>
  )
}
