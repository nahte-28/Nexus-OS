import { advance, dueReminders, type Reminder, type ReminderDraft } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { getAll, update } from '../state/db'

type Listener = () => void

/** Reminders on this device, in IndexedDB so they also work offline. */
export class RemindersStore {
  private list: Reminder[] = []
  private listeners = new Set<Listener>()
  private channel: BroadcastChannel | null =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('nexus-reminders')
  ready: Promise<void>

  constructor() {
    this.ready = this.load()
    // Another tab changed something: read it again.
    if (this.channel) this.channel.onmessage = () => void this.load()
  }

  private async load(): Promise<void> {
    try {
      this.set(await getAll<Reminder>('reminders'), false)
    } catch {
      // No IndexedDB (private mode): reminders stay in memory only.
    }
  }

  private set(list: Reminder[], broadcast = true): void {
    this.list = [...list].sort((a, b) => a.at - b.at)
    this.listeners.forEach((l) => l())
    if (broadcast) this.channel?.postMessage('changed')
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): Reminder[] => this.list

  async add(draft: ReminderDraft, now = Date.now()): Promise<Reminder> {
    await this.ready
    const reminder: Reminder = { ...draft, id: crypto.randomUUID(), createdAt: now }
    await update('reminders', { put: [reminder] })
    this.set([...this.list, reminder])
    return reminder
  }

  /** Adds reminders from a back-up that are not on this device yet. */
  async restore(reminders: Reminder[]): Promise<number> {
    await this.ready
    const ids = new Set(this.list.map((r) => r.id))
    const fresh = reminders.filter((r) => !ids.has(r.id))
    if (fresh.length === 0) return 0
    await update('reminders', { put: fresh })
    this.set([...this.list, ...fresh])
    return fresh.length
  }

  async remove(id: string): Promise<boolean> {
    await this.ready
    if (!this.list.some((r) => r.id === id)) return false
    await update('reminders', { remove: [id] })
    this.set(this.list.filter((r) => r.id !== id))
    return true
  }

  /**
   * Fires every reminder that is due and moves it on (or removes it). Reminders missed while
   * NEXUS was closed go off once at the next start.
   */
  async fireDue(deliver: (reminder: Reminder) => Promise<void>, now = Date.now()): Promise<number> {
    await this.ready
    const due = dueReminders(this.list, now)
    for (const reminder of due) {
      try {
        await deliver(reminder)
        logEvent('reminders', `Herinnering afgegaan (${reminder.repeat === 'none' ? 'eenmalig' : reminder.repeat})`)
      } catch (err) {
        logEvent('reminders', `Herinnering versturen mislukt: ${err instanceof Error ? err.message : err}`, true)
      }
      const next = advance(reminder, now)
      await update('reminders', next ? { put: [next] } : { remove: [reminder.id] })
      this.set(this.list.map((r) => (r.id === reminder.id ? next : r)).filter((r): r is Reminder => r !== null))
    }
    return due.length
  }
}

export const remindersStore = new RemindersStore()

/**
 * Checks for due reminders while NEXUS runs. Only one tab does this (Web Locks), so a
 * reminder never goes off twice; the Windows app in the tray keeps it running all day.
 */
export function startReminderScheduler(deliver: (reminder: Reminder) => Promise<void>, store = remindersStore): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  const run = () => {
    const tick = () => void store.fireDue(deliver)
    tick()
    timer = setInterval(tick, 15_000)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-reminders', () => {
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
    release?.()
  }
}
