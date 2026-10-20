import {
  describeAction,
  failingCondition,
  fillText,
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
import { getUpdateState } from '../platform/update'
import { chooseFor, profilesStore } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import type { ConnectEngine } from '../connect/engine'
import { showLocalNotification } from '../platform/notify'
import { addPrompt, type FlowPrompt } from './prompts'
import { FLOWS_STORAGE_KEY, flowsStore, flowStudioEnabled, type FlowRun, type FlowSettings, type FlowStepResult, type FlowsStore } from './store'

const TICK_MS = 30_000

/** What actions may touch. Everything goes through the existing Profiles, Connect and updater. */
export interface FlowEffects {
  activateProfile(profile: ProfileId, duration: ProfileDuration): void
  notify(title: string, text: string, target: NotifyTarget): Promise<void>
  prompt(prompt: FlowPrompt): void
}

export const APP_NAMES: Partial<Record<string, string>> = {
  klashub: 'KlasHub',
  notes: 'Notities',
  reminders: 'Herinneringen',
  assistant: 'NEXUS AI',
  notifications: 'Meldingen',
  devices: 'Apparaten',
  profiles: 'Profielen',
}
export const appName = (id: string) => APP_NAMES[id] ?? id

function inQuietHours(settings: FlowSettings, now: number, timeZone: string): boolean {
  const { enabled, start, end } = settings.quiet
  if (!enabled) return false
  const m = localClock(now, timeZone).minutes
  const s = Number(start.slice(0, 2)) * 60 + Number(start.slice(3))
  const e = Number(end.slice(0, 2)) * 60 + Number(end.slice(3))
  return s <= e ? m >= s && m < e : m >= s || m < e
}

/** Runs the actions of one flow in order; a failing action does not stop the next ones. */
export async function runActions(
  flow: FlowDefinition,
  event: FlowEvent,
  effects: FlowEffects,
  settings: FlowSettings,
  now: number,
): Promise<FlowStepResult[]> {
  const steps: FlowStepResult[] = []
  for (const [index, action] of flow.actions.entries()) {
    const label = describeAction(action, event.vars, appName)
    try {
      const skipped = await runAction(action, flow, event, effects, settings, now, index)
      steps.push(skipped ? { action: label, status: 'skipped', detail: skipped } : { action: label, status: 'ok' })
    } catch (err) {
      steps.push({ action: label, status: 'failed', detail: err instanceof Error ? err.message : String(err) })
    }
  }
  return steps
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
      effects.activateProfile(action.profile, action.duration)
      return
    case 'notification.send':
      if (inQuietHours(settings, now, flow.timeZone)) return 'Stille uren'
      await effects.notify(fillText(action.title, event.vars), fillText(action.text, event.vars), action.target)
      return
    case 'app.open_prompt':
      effects.prompt({ id: `${flow.id}|${event.id}|${index}`, flowName: flow.name, kind: 'app', app: action.app, at: now })
      return
    case 'update.prompt':
      effects.prompt({ id: `${flow.id}|${event.id}|${index}`, flowName: flow.name, kind: 'update', at: now })
      return
  }
}

const SKIP_REASONS = { condition: 'Voorwaarde niet voldaan', paused: 'Alles gepauzeerd', 'rate-limit': 'Te vaak dit uur' } as const

async function toRun(planned: PlannedRun, effects: FlowEffects, settings: FlowSettings, now: number, manual = false): Promise<FlowRun> {
  const base = { id: crypto.randomUUID(), flowId: planned.flow.id, flowName: planned.flow.name, event: planned.event.label, at: now, ...(manual ? { manual } : {}) }
  if (planned.skipped) return { ...base, status: 'skipped', reason: SKIP_REASONS[planned.skipped], steps: [] }
  const steps = await runActions(planned.flow, planned.event, effects, settings, now)
  return { ...base, status: steps.some((s) => s.status === 'failed') ? 'failed' : 'ok', steps }
}

/** Checks every flow once: runs what is due and records it, so nothing runs twice. */
export async function tickFlows(context: FlowContext, effects: FlowEffects, store: FlowsStore = flowsStore): Promise<FlowRun[]> {
  const { flows, settings, runtime } = store.getSnapshot()
  const planned = planRuns(flows, context, runtime, settings.paused)
  if (planned.length === 0) return []
  // Mark first: a reload halfway through can then never run the same event again.
  store.update((s) => ({ ...s, runtime: markHandled(s.runtime, planned, context.now) }))
  const runs: FlowRun[] = []
  for (const p of planned) runs.push(await toRun(p, effects, settings, context.now))
  store.addRuns(runs, context.now)
  for (const run of runs) {
    if (run.status !== 'skipped') logEvent('system', `Flow ${run.flowName}: ${run.status === 'ok' ? 'gelukt' : 'deels mislukt'}`, run.status === 'failed')
  }
  return runs
}

/** "Uitvoeren" in Flow Studio: runs the actions now, whatever the trigger, but still checks conditions. */
export async function runNow(flow: FlowDefinition, context: FlowContext, effects: FlowEffects, store: FlowsStore = flowsStore): Promise<FlowRun> {
  const { settings } = store.getSnapshot()
  const event: FlowEvent = { id: `manual:${context.now}`, label: 'Met de hand', vars: {} }
  const condition = failingCondition(flow, context)
  const skipped = settings.paused ? 'paused' : condition ? 'condition' : undefined
  const run = await toRun({ flow, event, ...(skipped ? { skipped } : {}) }, effects, settings, context.now, true)
  store.addRuns([run], context.now)
  return run
}

/** The context from Profiles, Reminders, Connect and the updater, right now. */
export function currentContext(connect: ConnectEngine, now = Date.now()): FlowContext {
  const connectState = connect.getSnapshot()
  const update = getUpdateState()
  return {
    now,
    activeProfile: profilesStore.getSnapshot().active.id,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    deadlines: remindersStore.getSnapshot().map((r) => ({ id: r.id, title: r.title, at: r.at })),
    devices:
      connectState.status === 'ready'
        ? connectState.devices
            .filter((d) => !d.isThisDevice && !d.revokedAt)
            .map((d) => ({ id: d.id, name: d.name, lastSeenAt: Date.parse(d.lastSeenAt) || now }))
        : [],
    update: update.status === 'available' ? { version: update.update.version } : null,
  }
}

/** The real effects: Profiles, local notifications, NEXUS Connect to the phone, and prompts. */
export function defaultEffects(connect: ConnectEngine): FlowEffects {
  return {
    activateProfile: (profile, duration) => chooseFor(profile, duration),
    async notify(title, text, target) {
      await showLocalNotification(title, text || 'Van Flow Studio', `flow-${title}`)
      if (target !== 'phone') return
      const state = connect.getSnapshot()
      if (state.status !== 'ready') throw new Error('NEXUS Connect is niet verbonden, dus de gsm kreeg ze niet.')
      const phones = state.devices.filter((d) => d.platform === 'android' && !d.revokedAt)
      if (phones.length === 0) throw new Error('Geen gsm gekoppeld.')
      await Promise.all(phones.map((p) => connect.sendNotification(p.id, title, text || undefined)))
    },
    prompt(prompt) {
      addPrompt(prompt)
      const what = prompt.kind === 'update' ? 'de update installeren' : `${appName(prompt.app ?? '')} openen`
      void showLocalNotification(prompt.flowName, `Voorstel: ${what}. Open NEXUS om te kiezen.`, prompt.id)
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
