import { useState, type DragEvent, type ReactNode } from 'react'
import {
  ACTION_LABELS,
  ACTION_TYPES,
  CONDITION_LABELS,
  CONDITION_TYPES,
  describeAction,
  describeCondition,
  describeTrigger,
  MAX_ACTIONS,
  MAX_CONDITIONS,
  TRIGGER_LABELS,
  TRIGGER_TYPES,
  type FlowAction,
  type FlowCondition,
  type FlowDefinition,
  type FlowTrigger,
} from '@nexus/core'
import { appName } from './runner'
import { DRAG_TYPE, dropBlock, moveItem, parseDragged, removeBlock, type Dragged, type Lane } from './canvas'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'

export interface CanvasEditors {
  trigger(t: FlowTrigger, onChange: (t: FlowTrigger) => void): ReactNode
  condition(c: FlowCondition, onChange: (c: FlowCondition) => void): ReactNode
  action(a: FlowAction, onChange: (a: FlowAction) => void): ReactNode
}

type Selected = { lane: 'trigger' } | { lane: 'conditions' | 'actions'; index: number } | null

const LANES: Array<{ lane: Lane; title: string; hint: string; tone: string }> = [
  { lane: 'trigger', title: 'Wanneer', hint: 'Sleep een trigger hierheen om de huidige te vervangen.', tone: 'border-l-sky-500' },
  { lane: 'conditions', title: 'Alleen als', hint: 'Alle voorwaarden moeten waar zijn.', tone: 'border-l-amber-500' },
  { lane: 'actions', title: 'Doe dit', hint: 'Van boven naar onder, één voor één.', tone: 'border-l-emerald-500' },
]

const setDrag = (e: DragEvent, d: Dragged) => {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(d))
  e.dataTransfer.effectAllowed = d.from === 'palette' ? 'copy' : 'move'
}

/**
 * The canvas view of the Flow Studio builder. Drag blocks from the palette onto a lane, drag them
 * up or down within it, or onto the bin. Everything also works without dragging: a palette block
 * adds itself when clicked, and a selected block has buttons to move or remove it.
 */
export function FlowCanvas({ flow, onChange, editors }: { flow: FlowDefinition; onChange: (flow: FlowDefinition) => void; editors: CanvasEditors }) {
  const [selected, setSelected] = useState<Selected>({ lane: 'trigger' })
  const [over, setOver] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const apply = (next: FlowDefinition | null, why: string) => {
    if (!next) {
      setNotice(why)
      return false
    }
    setNotice(null)
    onChange(next)
    return true
  }

  const drop = (lane: Lane, at: number) => (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(null)
    setDragging(false)
    const d = parseDragged(e.dataTransfer.getData(DRAG_TYPE))
    if (!d) return
    if (d.lane !== lane) {
      setNotice(`Dit blok hoort bij "${LANES.find((l) => l.lane === d.lane)?.title}".`)
      return
    }
    const ok = apply(dropBlock(flow, d, lane, at), lane === 'conditions' ? `Hoogstens ${MAX_CONDITIONS} voorwaarden.` : `Hoogstens ${MAX_ACTIONS} acties.`)
    if (!ok) return
    if (lane === 'trigger') setSelected({ lane: 'trigger' })
    else setSelected({ lane, index: d.from === 'canvas' ? (d.index < at ? at - 1 : at) : at })
  }

  const allow = (key: string) => (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
    e.preventDefault()
    e.stopPropagation()
    setOver(key)
  }

  const add = (d: Dragged & { from: 'palette' }) => {
    const at = d.lane === 'conditions' ? flow.conditions.length : d.lane === 'actions' ? flow.actions.length : 0
    if (apply(dropBlock(flow, d, d.lane, at), d.lane === 'conditions' ? `Hoogstens ${MAX_CONDITIONS} voorwaarden.` : `Hoogstens ${MAX_ACTIONS} acties.`)) {
      setSelected(d.lane === 'trigger' ? { lane: 'trigger' } : { lane: d.lane, index: at })
    }
  }

  const remove = (lane: 'conditions' | 'actions', index: number) => {
    if (apply(removeBlock(flow, lane, index), 'Een flow heeft minstens één actie.')) setSelected(null)
  }

  const move = (lane: 'conditions' | 'actions', index: number, to: number) => {
    const list = lane === 'conditions' ? flow.conditions : flow.actions
    if (to < 0 || to >= list.length) return
    onChange(lane === 'conditions' ? { ...flow, conditions: moveItem(flow.conditions, index, to) } : { ...flow, actions: moveItem(flow.actions, index, to) })
    setSelected({ lane, index: to })
  }

  const blocks = (lane: Lane): Array<{ label: string; index: number }> =>
    lane === 'trigger'
      ? [{ label: describeTrigger(flow.trigger), index: 0 }]
      : lane === 'conditions'
        ? flow.conditions.map((c, index) => ({ label: describeCondition(c), index }))
        : flow.actions.map((a, index) => ({ label: describeAction(a, {}, appName), index }))

  const isSelected = (lane: Lane, index: number) => selected !== null && selected.lane === lane && (lane === 'trigger' || ('index' in selected && selected.index === index))

  return (
    <div className="space-y-3" onDragEnd={() => {
        setDragging(false)
        setOver(null)
      }}>
      <section aria-label="Blokken" className="rounded-lg border border-nx-border p-3">
        <h3 className="mb-1 font-semibold">Blokken</h3>
        <p className="mb-2 text-xs text-nx-muted">Sleep een blok naar het canvas, of klik erop om het toe te voegen.</p>
        <div className="grid gap-2 md:grid-cols-3">
          <Palette title="Wanneer" items={TRIGGER_TYPES.map((type) => ({ key: type, label: TRIGGER_LABELS[type], d: { from: 'palette', lane: 'trigger', type } as const }))} onAdd={add} onDragStart={() => setDragging(true)} />
          <Palette title="Alleen als" items={CONDITION_TYPES.map((type) => ({ key: type, label: CONDITION_LABELS[type], d: { from: 'palette', lane: 'conditions', type } as const }))} onAdd={add} onDragStart={() => setDragging(true)} />
          <Palette title="Doe dit" items={ACTION_TYPES.map((type) => ({ key: type, label: ACTION_LABELS[type], d: { from: 'palette', lane: 'actions', type } as const }))} onAdd={add} onDragStart={() => setDragging(true)} />
        </div>
      </section>

      {notice && (
        <p role="status" className="text-sm text-nx-muted">
          {notice}
        </p>
      )}

      <div aria-label="Canvas" role="group" className="grid items-start gap-2 rounded-lg border border-dashed border-nx-border bg-nx-surface/40 p-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {LANES.map(({ lane, title, hint, tone }, laneIndex) => {
          const items = blocks(lane)
          return [
            laneIndex > 0 && (
              <div key={`${lane}-arrow`} aria-hidden="true" className="self-center text-center text-xl text-nx-muted md:pt-8">
                <span className="md:hidden">↓</span>
                <span className="hidden md:inline">→</span>
              </div>
            ),
            <section
              key={lane}
              aria-label={title}
              onDragOver={allow(`${lane}:end`)}
              onDragLeave={() => setOver(null)}
              onDrop={drop(lane, items.length)}
              className={`min-h-28 rounded-lg p-2 ${over === `${lane}:end` ? 'bg-nx-surface-2 ring-2 ring-nx-accent' : ''}`}
            >
              <h4 className="font-semibold">{title}</h4>
              <p className="mb-2 text-xs text-nx-muted">{hint}</p>
              <ol className="space-y-2">
                {items.map(({ label, index }) => (
                  <li
                    key={`${lane}-${index}`}
                    draggable={lane !== 'trigger'}
                    onDragStart={
                      lane === 'trigger'
                        ? undefined
                        : (e) => {
                            setDrag(e, { from: 'canvas', lane, index })
                            setDragging(true)
                          }
                    }
                    onDragOver={lane === 'trigger' ? undefined : allow(`${lane}:${index}`)}
                    onDrop={lane === 'trigger' ? undefined : drop(lane, index)}
                    className={`rounded-lg border border-l-4 border-nx-border ${tone} bg-nx-surface ${over === `${lane}:${index}` ? 'border-t-4 border-t-nx-accent' : ''} ${isSelected(lane, index) ? 'ring-2 ring-nx-accent' : ''}`}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected(lane, index)}
                      aria-label={`${title}${lane === 'trigger' ? '' : ` ${index + 1}`}: ${label}`}
                      onClick={() => setSelected(lane === 'trigger' ? { lane } : { lane, index })}
                      className={`w-full px-3 py-2 text-left ${lane === 'trigger' ? '' : 'cursor-grab'}`}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ol>
              {lane === 'conditions' && items.length === 0 && <p className="text-xs text-nx-muted">Geen: de flow loopt altijd.</p>}
            </section>,
          ]
        })}
      </div>

      {dragging && (
        <div
          aria-hidden="true"
          onDragOver={allow('bin')}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(null)
            setDragging(false)
            const d = parseDragged(e.dataTransfer.getData(DRAG_TYPE))
            if (d?.from === 'canvas') remove(d.lane, d.index)
          }}
          className={`rounded-lg border-2 border-dashed p-3 text-center text-sm ${over === 'bin' ? 'border-red-500 text-red-500' : 'border-nx-border text-nx-muted'}`}
        >
          Sleep hierheen om weg te halen
        </div>
      )}

      {selected && (
        <section aria-label="Blok bewerken" className="rounded-lg border border-nx-border p-3">
          {selected.lane === 'trigger' ? (
            <>
              <h3 className="mb-2 font-semibold">Wanneer bewerken</h3>
              {editors.trigger(flow.trigger, (trigger) => onChange({ ...flow, trigger }))}
            </>
          ) : (
            <SelectedBlock flow={flow} lane={selected.lane} index={selected.index} editors={editors} onChange={onChange} onMove={move} onRemove={remove} />
          )}
        </section>
      )}
    </div>
  )
}

function SelectedBlock({
  flow,
  lane,
  index,
  editors,
  onChange,
  onMove,
  onRemove,
}: {
  flow: FlowDefinition
  lane: 'conditions' | 'actions'
  index: number
  editors: CanvasEditors
  onChange: (flow: FlowDefinition) => void
  onMove: (lane: 'conditions' | 'actions', index: number, to: number) => void
  onRemove: (lane: 'conditions' | 'actions', index: number) => void
}) {
  const list = lane === 'conditions' ? flow.conditions : flow.actions
  if (index >= list.length) return null
  const title = lane === 'conditions' ? `Voorwaarde ${index + 1}` : `Actie ${index + 1}`
  return (
    <>
      <h3 className="mb-2 font-semibold">{title} bewerken</h3>
      {lane === 'conditions'
        ? editors.condition(flow.conditions[index], (c) => onChange({ ...flow, conditions: flow.conditions.map((x, i) => (i === index ? c : x)) }))
        : editors.action(flow.actions[index], (a) => onChange({ ...flow, actions: flow.actions.map((x, i) => (i === index ? a : x)) }))}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={button} disabled={index === 0} onClick={() => onMove(lane, index, index - 1)}>
          Naar boven
        </button>
        <button type="button" className={button} disabled={index === list.length - 1} onClick={() => onMove(lane, index, index + 1)}>
          Naar beneden
        </button>
        <button type="button" className={button} onClick={() => onRemove(lane, index)}>
          Weghalen
        </button>
      </div>
    </>
  )
}

function Palette({
  title,
  items,
  onAdd,
  onDragStart,
}: {
  title: string
  items: Array<{ key: string; label: string; d: Dragged & { from: 'palette' } }>
  onAdd: (d: Dragged & { from: 'palette' }) => void
  onDragStart: () => void
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-nx-muted uppercase">{title}</p>
      <ul className="flex flex-wrap gap-1">
        {items.map(({ key, label, d }) => (
          <li key={key}>
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                setDrag(e, d)
                onDragStart()
              }}
              onClick={() => onAdd(d)}
              aria-label={`${title}: ${label} ${d.lane === 'trigger' ? 'kiezen' : 'toevoegen'}`}
              className="cursor-grab rounded-full border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2"
            >
              + {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
