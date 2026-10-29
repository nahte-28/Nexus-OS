import { useSyncExternalStore } from 'react'
import {
  adjustDraft,
  decide,
  draftToFlow,
  evaluateRules,
  localClock,
  openDeadlines,
  parseIntel,
  refreshSuggestions,
  resetFeedback,
  SCHOOL_TIME_ZONE,
  setRule,
  validateFlow,
  type FlowDraft,
  type IntelFacts,
  type IntelState,
  type RuleId,
  type Suggestion,
} from '@nexus/core'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { flowsStore, flowStudioEnabled, setFlowStudioEnabled } from '../flows/store'
import { lifeStore } from '../life/store'
import { isDesktopApp } from '../platform/desktop'
import { getUpdateState } from '../platform/update'
import { profilesStore } from '../profiles/store'
import { readStorage, writeStorage } from '../state/storage'

const KEY = 'nexus.intelligence'

/** Proposals, your answers and the rule switches; on this device, like the rules themselves. */
export class IntelStore {
  private state: IntelState
  private listeners = new Set<() => void>()

  constructor(private persist = true) {
    let raw: unknown = null
    try {
      raw = persist ? JSON.parse(readStorage(KEY) ?? 'null') : null
    } catch {
      raw = null
    }
    this.state = parseIntel(raw)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): IntelState => this.state

  update(change: (s: IntelState) => IntelState): void {
    const next = change(this.state)
    if (next === this.state) return
    this.state = next
    if (this.persist) writeStorage(KEY, JSON.stringify(next))
    this.listeners.forEach((l) => l())
  }
}

export const intelStore = new IntelStore(typeof window !== 'undefined')

export function useIntel(): IntelState {
  return useSyncExternalStore(intelStore.subscribe, intelStore.getSnapshot)
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `in-${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** What the rules look at, right now. Only days, times and counts; no titles or contents. */
export function gatherFacts(now = Date.now()): IntelFacts {
  const profiles = profilesStore.getSnapshot().state
  const first: Partial<Record<number, string>> = {}
  const note = (day: number, time: string) => {
    if (!first[day] || time < first[day]!) first[day] = time
  }
  for (const l of profiles.lessons) note(l.day, l.start)
  for (const e of profiles.calendarEvents) {
    if (e.start < now || e.start > now + 14 * 86_400_000) continue
    const { day, minutes } = localClock(e.start, SCHOOL_TIME_ZONE)
    note(day, `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
  }
  const update = getUpdateState()
  return {
    now,
    firstLessons: first,
    scheduleOn: profiles.schedule.enabled && profiles.schedule.profile === 'school',
    flows: flowsStore.getSnapshot().flows,
    deadlinesSoon: openDeadlines(lifeStore.getSnapshot()).filter((d) => d.dueAt > now && d.dueAt - now <= 7 * 86_400_000).length,
    isDesktop: isDesktopApp,
    updateAvailable: update.status === 'available' ? update.update.version : null,
  }
}

/** Runs the rules and updates the proposals; a new one also lands in the Inbox. */
export function refreshNow(now = Date.now(), facts: IntelFacts = gatherFacts(now), store = intelStore): Suggestion | null {
  let added: Suggestion | null = null
  store.update((s) => {
    const r = refreshSuggestions(s, evaluateRules(facts), now, newId)
    added = r.added
    return r.state
  })
  const a = added as Suggestion | null
  if (a) {
    eventBus.publish({ id: `suggestion:${a.id}`, source: 'suggestion', type: 'suggestion.new', at: now, title: `Voorstel: ${a.title}`, body: a.reason, priority: 'low', link: { app: 'intelligence', id: a.id } })
  }
  return a
}

/**
 * Approving: the proposal becomes an ordinary flow in Flow Studio (checked like one from the
 * builder). Flow Studio is switched on when it was off, because otherwise no flow runs.
 */
export function approve(id: string, now = Date.now(), store = intelStore): string {
  const s = store.getSnapshot().suggestions.find((x) => x.id === id)
  if (!s || (s.status !== 'open' && s.status !== 'snoozed')) throw new Error('Dit voorstel is er niet meer.')
  const flow = draftToFlow(s.flow, newId(), now)
  const problem = validateFlow(flow)
  if (problem) throw new Error(problem)
  const saved = flowsStore.save(flow, now)
  if (!flowStudioEnabled()) setFlowStudioEnabled(true)
  store.update((st) => decide(st, id, 'accept', now, saved.id))
  logEvent('system', `Intelligence: voorstel "${s.title}" goedgekeurd als flow "${saved.name}"`)
  return saved.id
}

export const dismiss = (id: string, now = Date.now(), store = intelStore) => store.update((s) => decide(s, id, 'dismiss', now))
export const snooze = (id: string, now = Date.now(), store = intelStore) => store.update((s) => decide(s, id, 'snooze', now))
export const adjust = (id: string, flow: FlowDraft, store = intelStore) => store.update((s) => adjustDraft(s, id, flow))
export const switchRule = (rule: RuleId, on: boolean, store = intelStore) => store.update((s) => setRule(s, rule, on))
export const forgetFeedback = (store = intelStore) => store.update(resetFeedback)

/** While the module is on: the rules run every 10 minutes and shortly after a relevant change. */
export function startIntelligence(enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = () => {
    if (enabled()) refreshNow()
  }
  const soon = () => {
    clearTimeout(timer)
    timer = setTimeout(run, 5_000)
  }
  run()
  const poll = setInterval(run, 10 * 60_000)
  const offs = [flowsStore.subscribe(soon), profilesStore.subscribe(soon), lifeStore.subscribe(soon), onEnabled(run)]
  return () => {
    clearTimeout(timer)
    clearInterval(poll)
    offs.forEach((off) => off())
  }
}
