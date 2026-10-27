import { openDeadlines, plannedDeadlineNotices, plannedFlowNotices, plannedReminders, safetyPlan, type PlannedNotice } from '@nexus/core'
import { phonesOf, type ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { inQuietHours } from '../flows/runner'
import { flowsStore, flowStudioEnabled } from '../flows/store'
import { lifeStore } from '../life/store'
import { remindersStore } from '../reminders/store'
import { readStorage, writeStorage } from '../state/storage'

const CHECK_MS = 60_000
/** Sent again at least this often, so the phone always looks a few days ahead. */
const REFRESH_MS = 12 * 60 * 60_000
const sentKey = (phoneId: string) => `nexus.safety.sent.${phoneId}`

/** The notifications this device will send the phone in the coming days. */
export function currentPlan(now = Date.now()): PlannedNotice[] {
  const reminders = remindersStore.getSnapshot()
  const life = lifeStore.getSnapshot()
  const { flows, settings } = flowsStore.getSnapshot()
  const flowNotices = flowStudioEnabled()
    ? plannedFlowNotices({
        flows,
        paused: settings.paused,
        quietAt: (at, timeZone) => inQuietHours(settings, at, timeZone),
        deadlines: [...reminders.map((r) => ({ id: r.id, title: r.title, at: r.at })), ...openDeadlines(life).map((d) => ({ id: d.id, title: d.title, at: d.dueAt }))],
        now,
      })
    : []
  return safetyPlan([...plannedReminders(reminders, now), ...plannedDeadlineNotices(life, now), ...flowNotices])
}

interface Sent {
  key: string
  at: number
}

function readSent(phoneId: string): Sent | null {
  try {
    const raw = JSON.parse(readStorage(sentKey(phoneId)) ?? 'null') as Sent | null
    return raw && typeof raw.key === 'string' && typeof raw.at === 'number' ? raw : null
  } catch {
    return null
  }
}

/**
 * Sends each phone the plan when it changed or is getting old: the companion gets it to set alarms,
 * a phone with web push gets each notice as a push the database sends when due. Returns how many
 * phones got it.
 */
export async function sendPlanIfChanged(
  connect: Pick<ConnectEngine, 'getSnapshot' | 'sendPlan' | 'sendPushPlan'>,
  plan: PlannedNotice[],
  now = Date.now(),
): Promise<number> {
  const state = connect.getSnapshot()
  if (state.status !== 'ready') return 0
  const key = JSON.stringify(plan)
  let sent = 0
  for (const phone of phonesOf(state)) {
    const last = readSent(phone.id)
    // Nothing planned and nothing sent before: the phone has nothing to forget either.
    if (!last && plan.length === 0) continue
    if (last && last.key === key && now - last.at < REFRESH_MS) continue
    try {
      if (phone.platform === 'android') await connect.sendPlan(phone.id, plan)
      else await connect.sendPushPlan(phone.id, plan)
      writeStorage(sentKey(phone.id), JSON.stringify({ key, at: now }))
      sent++
    } catch (err) {
      logEvent('connect', `Vangnet naar ${phone.name} versturen mislukt: ${err instanceof Error ? err.message : err}`, true)
    }
  }
  return sent
}

/**
 * Keeps the phone's safety net up to date while NEXUS is open: after every change to reminders or
 * flows, and every minute. Only one tab does it.
 */
export function startSafetyNet(connect: ConnectEngine): () => void {
  let stopped = false
  let busy = false
  let timer: ReturnType<typeof setInterval> | undefined
  let debounce: ReturnType<typeof setTimeout> | undefined
  let release: (() => void) | undefined
  const unsubscribers: Array<() => void> = []
  const check = () => {
    if (busy || stopped) return
    busy = true
    void sendPlanIfChanged(connect, currentPlan()).finally(() => (busy = false))
  }
  const soon = () => {
    clearTimeout(debounce)
    debounce = setTimeout(check, 2000)
  }
  const run = () => {
    check()
    timer = setInterval(check, CHECK_MS)
    unsubscribers.push(remindersStore.subscribe(soon), lifeStore.subscribe(soon), flowsStore.subscribe(soon), connect.subscribe(soon))
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-safety', () => {
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
    clearTimeout(debounce)
    unsubscribers.forEach((u) => u())
    release?.()
  }
}
