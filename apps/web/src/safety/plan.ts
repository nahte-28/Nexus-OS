import { openDeadlines, plannedBirthdayNotices, plannedCalendarNotices, plannedDagstart, plannedSleepNotices, type PlanDartsGame, type PlanTogether, type PlanGaming, type PlanWeather, type PlanToday, buildPlanToday, emptyGoals, plannedSubscriptionNotices, plannedDeadlineNotices, plannedHabitNotices, plannedFlowNotices, plannedReminders, safetyPlan, type PlannedNotice } from '@nexus/core'
import { phonesOf, type ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { inQuietHours } from '../flows/runner'
import { financeStore } from '../finance/store'
import { flowsStore, flowStudioEnabled } from '../flows/store'
import { dagstartInput, dagstartSettings } from '../life/dagstart'
import { dagstartExtra } from '../briefing/store'
import { habitsStore } from '../habits/store'
import { contactsStore } from '../contacts/store'
import { isFeatureOn } from '../features/store'
import { weatherForWatch, weatherStore } from '../weather/store'
import { gamingStore } from '../gaming/store'
import { currentSleepPlan, gamingNow, planGaming } from '../gaming/timer'
import { lifeStore } from '../life/store'
import { profilesStore } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import { readStorage, writeStorage } from '../state/storage'
import { goalsStore } from '../goals/store'
import { gradesStore } from '../grades/store'
import { focusStore } from '../study/timer'
import { dartsWatchStore } from '../darts/watch'
import { togetherWatchStore } from '../study/watch'

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
  return safetyPlan([...plannedReminders(reminders, now), ...plannedDeadlineNotices(life, now), ...plannedDagstart(dagstartInput(), dagstartSettings(), now, undefined, dagstartExtra()), ...plannedHabitNotices(habitsStore.getSnapshot(), now), ...plannedSubscriptionNotices(financeStore.getSnapshot(), now), ...plannedSleepNotices(currentSleepPlan(now), gamingNow(), now), ...plannedCalendarNotices(profilesStore.getSnapshot().state, now), ...(isFeatureOn('contacts') ? plannedBirthdayNotices(contactsStore.getSnapshot(), now) : []), ...flowNotices])
}

/** Vandaag for the watch: today's agenda, the habits due today and your goals (when Doelen is on). */
export function todayForWatch(now = Date.now()): PlanToday | null {
  const facts = { grades: gradesStore.getSnapshot(), habits: habitsStore.getSnapshot(), focusLog: focusStore.getSnapshot().log }
  return buildPlanToday({ agenda: dagstartInput(), goals: isFeatureOn('goals') ? goalsStore.getSnapshot() : emptyGoals(), facts }, now)
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
  gaming: PlanGaming | null = null,
  weather: PlanWeather | null = null,
  today: PlanToday | null = null,
  darts: PlanDartsGame[] = [],
  together: PlanTogether[] = [],
): Promise<number> {
  const state = connect.getSnapshot()
  if (state.status !== 'ready') return 0
  // The fetch time alone does not make it worth sending again.
  const shownWeather = weather ? { ...weather, at: 0 } : null
  const pushKey = JSON.stringify(gaming || shownWeather ? { plan, gaming, ...(shownWeather ? { weather: shownWeather } : {}) } : plan)
  // Vandaag, Darts online and Samen studeren only go to the companion and the watch; a ticked habit does not replan web pushes.
  const watchOnly = today || darts.length > 0 || together.length > 0
  const watchKey = watchOnly ? JSON.stringify({ plan, gaming, ...(shownWeather ? { weather: shownWeather } : {}), today, ...(darts.length > 0 ? { darts } : {}), ...(together.length > 0 ? { together } : {}) }) : pushKey
  let sent = 0
  for (const phone of phonesOf(state)) {
    const last = readSent(phone.id)
    const android = phone.platform === 'android'
    const key = android ? watchKey : pushKey
    // Nothing planned and nothing sent before: the phone has nothing to forget either.
    if (!last && plan.length === 0 && !gaming && !(android && watchOnly)) continue
    if (last && last.key === key && now - last.at < REFRESH_MS) continue
    try {
      if (!android) await connect.sendPushPlan(phone.id, plan)
      else if (together.length > 0) await connect.sendPlan(phone.id, plan, gaming, weather ?? undefined, today ?? undefined, darts, together)
      else if (darts.length > 0) await connect.sendPlan(phone.id, plan, gaming, weather ?? undefined, today ?? undefined, darts)
      else if (today) await connect.sendPlan(phone.id, plan, gaming, weather ?? undefined, today)
      else if (weather) await connect.sendPlan(phone.id, plan, gaming, weather)
      else await connect.sendPlan(phone.id, plan, gaming)
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
    void sendPlanIfChanged(connect, currentPlan(), Date.now(), planGaming(), isFeatureOn('weather') ? weatherForWatch() : null, todayForWatch(), dartsWatchStore.getSnapshot(), togetherWatchStore.getSnapshot()).finally(() => (busy = false))
  }
  const soon = () => {
    clearTimeout(debounce)
    debounce = setTimeout(check, 2000)
  }
  const run = () => {
    check()
    timer = setInterval(check, CHECK_MS)
    unsubscribers.push(remindersStore.subscribe(soon), lifeStore.subscribe(soon), flowsStore.subscribe(soon), profilesStore.subscribe(soon), habitsStore.subscribe(soon), contactsStore.subscribe(soon), weatherStore.subscribe(soon), financeStore.subscribe(soon), gamingStore.subscribe(soon), goalsStore.subscribe(soon), gradesStore.subscribe(soon), dartsWatchStore.subscribe(soon), togetherWatchStore.subscribe(soon), connect.subscribe(soon))
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
