import {
  financeFlowFacts,
  openDeadlines,
  DEFAULT_TIMEOUT_SECONDS,
  describeAction,
  failingCondition,
  fillText,
  flowRef,
  localClock,
  markHandled,
  planRuns,
  type FlowAction,
  type FlowContext,
  type FlowDefinition,
  type FlowEvent,
  type NotifyTarget,
  type PlannedRun,
  type ProfileDuration,
  type ProfileId,
} from '@nexus/core'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { getUpdateState } from '../platform/update'
import { chooseFor, profilesStore } from '../profiles/store'
import { financeStore } from '../finance/store'
import { lifeStore } from '../life/store'
import { remindersStore } from '../reminders/store'
import type { ConnectEngine } from '../connect/engine'
import { showLocalNotification } from '../platform/notify'
import { addPrompt, type FlowPrompt } from './prompts'
import { claimFlowRun } from './sync'
import { FLOWS_STORAGE_KEY, flowsStore, flowStudioEnabled, type FlowRun, type FlowSettings, type FlowStepResult, type FlowsStore } from './store'

const TICK_MS = 30_000

/** What actions may touch. Everything goes through the existing Profiles, Connect and updater. */
export interface FlowEffects {
  /** Pause between tries of a failing action; a timer unless a test passes its own. */
  sleep?(ms: number): Promise<void>
  activateProfile(profile: ProfileId, duration: ProfileDuration, by?: string): void
  /** [ref] ties it to the phone's safety net, so the phone shows it once. */
  notify(title: string, text: string, target: NotifyTarget, ref?: string): Promise<void>
  prompt(prompt: FlowPrompt): void
  /**
   * Asks the account whether this device may run the event: false when another device already
   * did. Without an account or connection the answer is yes, so flows keep working offline.
   */
  claim?(run: FlowRun): Promise<boolean>
  /** Name of this device in NEXUS Connect, for the run history. */
  deviceName?(): string | undefined
}

export const APP_NAMES: Partial<Record<string, string>> = {
  klashub: 'KlasHub',
  notes: 'Notities',
  reminders: 'Herinneringen',
  assistant: 'NEXUS AI',
  notifications: 'Meldingen',
  devices: 'Apparaten',
  profiles: 'Profielen',
  finance: 'Financiën',
}
export const appName = (id: string) => APP_NAMES[id] ?? id

export function inQuietHours(settings: FlowSettings, now: number, timeZone: string): boolean {
  const { enabled, start, end } = settings.quiet
  if (!enabled) return false
  const m = localClock(now, timeZone).minutes
  const s = Number(start.slice(0, 2)) * 60 + Number(start.slice(3))
  const e = Number(end.slice(0, 2)) * 60 + Number(end.slice(3))
  return s <= e ? m >= s && m < e : m >= s || m < e
}

export interface ActionsResult {
  steps: FlowStepResult[]
  /** Set when the run reached a wait block: where and when it goes on. */
  resume?: { nextIndex: number; resumeAt: number }
}

const clock = (at: number) => new Date(at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })

/** Rejects after [ms]; the action itself may still finish, but the run no longer waits for it. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Duurde langer dan ${Math.round(ms / 1000)} s`)), ms)
    work.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

/**
 * Runs the actions of one flow in order, from [from]; a failing action does not stop the next
 * ones. A failing action is tried again as often as the flow allows, and each try has a time-out.
 * At a wait block it stops and says when to go on.
 */
export async function runActions(
  flow: FlowDefinition,
  event: FlowEvent,
  effects: FlowEffects,
  settings: FlowSettings,
  now: number,
  from = 0,
): Promise<ActionsResult> {
  const steps: FlowStepResult[] = []
  const tries = (flow.retries ?? 0) + 1
  const timeout = (flow.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000
  const sleep = effects.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  for (const [index, action] of flow.actions.entries()) {
    if (index < from) continue
    const label = describeAction(action, event.vars, appName)
    if (action.type === 'wait') {
      const resumeAt = now + action.minutes * 60_000
      steps.push({ type: action.type, action: label, status: 'ok', detail: `verder om ${clock(resumeAt)}` })
      return { steps, resume: { nextIndex: index + 1, resumeAt } }
    }
    for (let attempt = 1; ; attempt++) {
      try {
        const skipped = await withTimeout(Promise.resolve(runAction(action, flow, event, effects, settings, now, index)), timeout)
        const retried = attempt > 1 ? `gelukt bij poging ${attempt}` : undefined
        steps.push(skipped ? { type: action.type, action: label, status: 'skipped', detail: skipped } : { type: action.type, action: label, status: 'ok', ...(retried ? { detail: retried } : {}) })
        break
      } catch (err) {
        if (attempt < tries) {
          await sleep(1000 * 2 ** (attempt - 1))
          continue
        }
        const why = err instanceof Error ? err.message : String(err)
        steps.push({ type: action.type, action: label, status: 'failed', detail: tries > 1 ? `${why} (na ${tries} pogingen)` : why })
        break
      }
    }
  }
  return { steps }
}

/** Does one action; returns why it was skipped, or nothing when it ran. */
async function runAction(
  action: FlowAction,
  flow: FlowDefinition,
  event: FlowEvent,
  effects: FlowEffects,
  settings: FlowSettings,
  now: number,
  index: number,
): Promise<string | void> {
  switch (action.type) {
    case 'profile.activate':
      effects.activateProfile(action.profile, action.duration, `flow ${flow.name}`)
      return
    case 'notification.send':
      if (inQuietHours(settings, now, flow.timeZone)) return 'Stille uren'
      await effects.notify(fillText(action.title, event.vars), fillText(action.text, event.vars), action.target, flowRef(flow.id, event.id, index))
      return
    case 'app.open_prompt':
      effects.prompt({ id: `${flow.id}|${event.id}|${index}`, flowName: flow.name, kind: 'app', app: action.app, at: now })
      return
    case 'update.prompt':
      effects.prompt({ id: `${flow.id}|${event.id}|${index}`, flowName: flow.name, kind: 'update', at: now })
      return
    case 'wait':
      // runActions stops at a wait block before it gets here.
      return
  }
}

const SKIP_REASONS = { condition: 'Voorwaarde niet voldaan', paused: 'Alles gepauzeerd', 'rate-limit': 'Te vaak dit uur' } as const

function newRun(planned: PlannedRun, effects: FlowEffects, now: number, manual = false): FlowRun {
  const device = effects.deviceName?.()
  return {
    id: crypto.randomUUID(),
    flowId: planned.flow.id,
    flowName: planned.flow.name,
    event: planned.event.label,
    eventId: planned.event.id,
    trigger: manual ? 'manual' : planned.flow.trigger.type,
    at: now,
    status: 'ok',
    ...(manual ? { manual } : {}),
    ...(device ? { device } : {}),
    ...(Object.keys(planned.event.vars).length > 0 ? { vars: planned.event.vars } : {}),
    steps: [],
  }
}

const finished = (run: FlowRun, steps: FlowStepResult[]): FlowRun => ({ ...run, status: steps.some((s) => s.status === 'failed') ? 'failed' : 'ok', steps })

/**
 * Does the actions of a run, or the rest of them after a wait block. Returns the finished run, or
 * null when it parked at (another) wait block.
 */
async function continueRun(run: FlowRun, flow: FlowDefinition, event: FlowEvent, from: number, effects: FlowEffects, settings: FlowSettings, now: number, store: FlowsStore): Promise<FlowRun | null> {
  const { steps, resume } = await runActions(flow, event, effects, settings, now, from)
  const all = [...run.steps, ...steps]
  if (resume) {
    store.setWaiting((w) => [...w.filter((x) => x.run.id !== run.id), { run: { ...run, steps: all }, event, ...resume }])
    return null
  }
  return finished(run, all)
}

async function finishRun(run: FlowRun, planned: PlannedRun, effects: FlowEffects, settings: FlowSettings, now: number, store: FlowsStore): Promise<FlowRun | null> {
  if (planned.skipped) return { ...run, status: 'skipped', reason: SKIP_REASONS[planned.skipped] }
  return continueRun(run, planned.flow, planned.event, 0, effects, settings, now, store)
}

/** Goes on with the runs whose wait block is over. A deleted or paused flow ends its run. */
async function resumeWaiting(effects: FlowEffects, store: FlowsStore, now: number): Promise<FlowRun[]> {
  const due = store.getSnapshot().waiting.filter((w) => w.resumeAt <= now)
  if (due.length === 0) return []
  // Take them out first, so a reload halfway can never do the same actions twice.
  const ids = new Set(due.map((w) => w.run.id))
  store.setWaiting((w) => w.filter((x) => !ids.has(x.run.id)))
  const { flows, settings } = store.getSnapshot()
  const out: FlowRun[] = []
  for (const w of due) {
    const flow = flows.find((f) => f.id === w.run.flowId)
    if (!flow || !flow.enabled || settings.paused) {
      const why = !flow ? 'De flow is verwijderd' : settings.paused ? 'Alles gepauzeerd' : 'De flow staat uit'
      out.push({ ...finished(w.run, w.run.steps), reason: `${why} tijdens het wachten` })
      continue
    }
    const run = await continueRun(w.run, flow, w.event, w.nextIndex, effects, settings, now, store)
    if (run) out.push(run)
  }
  return out
}

/** Checks every flow once: runs what is due and records it, so nothing runs twice. */
export async function tickFlows(context: FlowContext, effects: FlowEffects, store: FlowsStore = flowsStore): Promise<FlowRun[]> {
  const runs = await resumeWaiting(effects, store, context.now)
  const { flows, settings, runtime } = store.getSnapshot()
  const planned = planRuns(flows, context, runtime, settings.paused)
  if (planned.length > 0) {
    // Mark first: a reload halfway through can then never run the same event again.
    store.update((s) => ({ ...s, runtime: markHandled(s.runtime, planned, context.now) }))
    for (const p of planned) {
      const run = newRun(p, effects, context.now)
      // Another device of the account already ran this event: nothing to do or show here.
      if (!p.skipped && effects.claim && !(await effects.claim(run))) continue
      const done = await finishRun(run, p, effects, settings, context.now, store)
      if (done) runs.push(done)
    }
  }
  store.addRuns(runs, context.now)
  runs.forEach(announce)
  return runs
}

/** A run that did something lands in the log and the Inbox: a summary, or the error. */
function announce(run: FlowRun): void {
  if (run.status === 'skipped') return
  logEvent('system', `Flow ${run.flowName}: ${run.status === 'ok' ? 'gelukt' : 'deels mislukt'}`, run.status === 'failed')
  eventBus.publish({
    id: `flow:${run.flowId}|${run.eventId ?? run.id}`,
    source: 'flow',
    type: run.status === 'ok' ? 'flow.ran' : 'flow.failed',
    at: run.at,
    title: run.status === 'ok' ? `Flow ${run.flowName} is uitgevoerd` : `Flow ${run.flowName} is deels mislukt`,
    body: run.event,
    priority: run.status === 'ok' ? 'low' : 'high',
    link: { app: 'flows', id: run.flowId },
  })
}

/**
 * "Uitvoeren" in Flow Studio: runs the actions now, whatever the trigger, but still checks
 * conditions. With [again], "Opnieuw proberen" for an earlier run: the same event text. Returns
 * the run, or null when it now waits at a wait block.
 */
export async function runNow(flow: FlowDefinition, context: FlowContext, effects: FlowEffects, store: FlowsStore = flowsStore, again?: FlowRun): Promise<FlowRun | null> {
  const { settings } = store.getSnapshot()
  const event: FlowEvent = again
    ? { id: `retry:${again.id}:${context.now}`, label: `Opnieuw: ${again.manual ? 'met de hand' : again.event}`, vars: again.vars ?? {} }
    : { id: `manual:${context.now}`, label: 'Met de hand', vars: {} }
  const condition = failingCondition(flow, context)
  const skipped = settings.paused ? 'paused' : condition ? 'condition' : undefined
  const planned: PlannedRun = { flow, event, ...(skipped ? { skipped } : {}) }
  const run = await finishRun(newRun(planned, effects, context.now, true), planned, effects, settings, context.now, store)
  if (!run) return null
  store.addRuns([run], context.now)
  announce(run)
  return run
}

/** The context from Profiles, Reminders, Financiën, Connect and the updater, right now. */
export function currentContext(connect: ConnectEngine, now = Date.now()): FlowContext {
  const connectState = connect.getSnapshot()
  const update = getUpdateState()
  return {
    now,
    activeProfile: profilesStore.getSnapshot().active.id,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    deadlines: [
      ...remindersStore.getSnapshot().map((r) => ({ id: r.id, title: r.title, at: r.at })),
      ...openDeadlines(lifeStore.getSnapshot()).map((d) => ({ id: d.id, title: d.title, at: d.dueAt })),
    ],
    devices:
      connectState.status === 'ready'
        ? connectState.devices
            .filter((d) => !d.isThisDevice && !d.revokedAt)
            .map((d) => ({ id: d.id, name: d.name, lastSeenAt: Date.parse(d.lastSeenAt) || now }))
        : [],
    update: update.status === 'available' ? { version: update.update.version } : null,
    finance: financeFlowFacts(financeStore.getSnapshot(), now),
  }
}

/** The real effects: Profiles, local notifications, NEXUS Connect to the phone, and prompts. */
export function defaultEffects(connect: ConnectEngine): FlowEffects {
  return {
    activateProfile: (profile, duration, by) => chooseFor(profile, duration, Date.now(), undefined, by),
    async notify(title, text, target, ref) {
      await showLocalNotification(title, text || 'Van Flow Studio', `flow-${title}`)
      if (target !== 'phone') return
      await connect.notifyPhones(title, text || undefined, ref)
    },
    prompt(prompt) {
      addPrompt(prompt)
      const what = prompt.kind === 'update' ? 'de update installeren' : `${appName(prompt.app ?? '')} openen`
      void showLocalNotification(prompt.flowName, `Voorstel: ${what}. Open NEXUS om te kiezen.`, prompt.id)
    },
    claim: claimFlowRun,
    deviceName() {
      const state = connect.getSnapshot()
      return state.status === 'ready' ? state.devices.find((d) => d.isThisDevice)?.name : undefined
    },
  }
}

/**
 * Runs flows while NEXUS is open on this device. Only one tab does it (Web Locks); it also checks
 * right away when NEXUS comes back from sleep or the background.
 */
export function startFlowRunner(connect: ConnectEngine, store: FlowsStore = flowsStore): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  let running = false
  const effects = defaultEffects(connect)
  const tick = () => {
    if (running || !flowStudioEnabled()) return
    running = true
    void tickFlows(currentContext(connect), effects, store).finally(() => (running = false))
  }
  const onVisible = () => document.visibilityState === 'visible' && tick()
  const onStorage = (e: StorageEvent) => e.key === FLOWS_STORAGE_KEY && store.reload()
  window.addEventListener('storage', onStorage)
  const run = () => {
    tick()
    timer = setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', tick)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-flows', () => {
      if (stopped) return
      run()
      return new Promise<void>((resolve) => (release = resolve))
    })
  } else {
    run()
  }
  return () => {
    stopped = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', tick)
    window.removeEventListener('storage', onStorage)
    release?.()
  }
}
