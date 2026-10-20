/**
 * The phone as a safety net. NEXUS sends the phone, ahead of time and encrypted, the notifications
 * it will send it in the coming days. The phone sets an alarm for each one; when NEXUS delivers the
 * notification itself, the alarm is dropped. When the pc is off or NEXUS is closed, the alarm shows
 * it anyway. Every notice has a ref that the real notification carries too, so the phone never
 * shows the same one twice, whichever comes first.
 */
import { conditionHolds, fillText, localDate, nextScheduledRun, type FlowContext, type FlowDefinition } from './flows'
import { advance, type Reminder } from './reminders'

export interface PlannedNotice {
  /** The same ref travels with the real notification. */
  ref: string
  at: number
  title: string
  text?: string
}

/** How far ahead the phone knows; after that it needs NEXUS to be open again somewhere. */
export const SAFETY_HORIZON_MS = 3 * 24 * 60 * 60_000
export const MAX_PLANNED = 50
/** How long the phone waits for NEXUS before it shows a notice itself. */
export const SAFETY_GRACE_MS = 2 * 60_000

export const reminderRef = (r: Pick<Reminder, 'id' | 'at'>) => `reminder:${r.id}@${r.at}`
export const flowRef = (flowId: string, eventId: string, actionIndex: number) => `flow:${flowId}|${eventId}|${actionIndex}`

/** The phone reminders of the coming days, repeats included. */
export function plannedReminders(reminders: Reminder[], now: number, horizon = SAFETY_HORIZON_MS): PlannedNotice[] {
  const out: PlannedNotice[] = []
  for (const first of reminders) {
    if (first.target !== 'phone') continue
    let r: Reminder | null = first
    while (r && r.at <= now + horizon && out.length < MAX_PLANNED * 2) {
      if (r.at > now) out.push({ ref: reminderRef(r), at: r.at, title: r.title, ...(r.text ? { text: r.text } : {}) })
      r = advance(r, r.at)
    }
  }
  return out
}

export interface FlowPlanInput {
  flows: FlowDefinition[]
  paused: boolean
  /** True when quiet hours hold at that time: flows then send nothing. */
  quietAt: (at: number, timeZone: string) => boolean
  deadlines: FlowContext['deadlines']
  now: number
}

/**
 * The phone notifications flows will send in the coming days. Only flows whose moment is known in
 * advance (a fixed time or a deadline) and whose conditions only look at the time of day: whether a
 * profile is active or the network is up cannot be known ahead.
 */
export function plannedFlowNotices({ flows, paused, quietAt, deadlines, now }: FlowPlanInput, horizon = SAFETY_HORIZON_MS): PlannedNotice[] {
  if (paused) return []
  const out: PlannedNotice[] = []
  for (const flow of flows) {
    if (!flow.enabled || flow.conditions.some((c) => c.type !== 'local_time.in_range')) continue
    const actions = flow.actions.flatMap((a, i) => (a.type === 'notification.send' && a.target === 'phone' ? [{ a, i }] : []))
    if (actions.length === 0) continue
    const moments: Array<{ at: number; eventId: string; vars: Record<string, string> }> = []
    const t = flow.trigger
    if (t.type === 'schedule.at_time') {
      for (let at = nextScheduledRun(flow, now); at !== null && at <= now + horizon; at = nextScheduledRun(flow, at + 60_000)) {
        moments.push({ at, eventId: `at:${localDate(at, flow.timeZone)}`, vars: { tijd: t.time } })
      }
    } else if (t.type === 'deadline.upcoming') {
      for (const d of deadlines) {
        const at = d.at - t.minutesBefore * 60_000
        if (at <= now || at > now + horizon) continue
        const tijd = new Intl.DateTimeFormat('nl-BE', { timeZone: flow.timeZone || undefined, hour: '2-digit', minute: '2-digit' }).format(new Date(d.at))
        moments.push({ at, eventId: `deadline:${d.id}@${d.at}`, vars: { titel: d.title, tijd } })
      }
    }
    for (const m of moments) {
      const ctx: FlowContext = { now: m.at, activeProfile: 'personal', online: true, deadlines: [], devices: [], update: null }
      if (!flow.conditions.every((c) => conditionHolds(c, ctx, flow.timeZone)) || quietAt(m.at, flow.timeZone)) continue
      for (const { a, i } of actions) {
        if (a.type !== 'notification.send') continue
        const text = fillText(a.text, m.vars)
        out.push({ ref: flowRef(flow.id, m.eventId, i), at: m.at, title: fillText(a.title, m.vars), ...(text ? { text } : {}) })
      }
    }
  }
  return out
}

/** Everything for the phone, soonest first, within the limit the phone keeps. */
export function safetyPlan(notices: PlannedNotice[]): PlannedNotice[] {
  const byRef = new Map(notices.map((n) => [n.ref, n]))
  return [...byRef.values()]
    .sort((a, b) => a.at - b.at || a.ref.localeCompare(b.ref))
    .slice(0, MAX_PLANNED)
    .map((n) => ({ ...n, title: n.title.slice(0, 120), ...(n.text ? { text: n.text.slice(0, 1000) } : {}) }))
}
