/** Herinneringen: planned NEXUS notifications, the first automation. Pure logic, no storage. */

export type ReminderRepeat = 'none' | 'daily' | 'weekly'
/** this_device: a notification where NEXUS runs. phone: also on the phone, and through it on the watch. */
export type ReminderTarget = 'this_device' | 'phone'

export interface Reminder {
  id: string
  title: string
  text?: string
  /** Next time it goes off, epoch ms. */
  at: number
  repeat: ReminderRepeat
  target: ReminderTarget
  createdAt: number
}

export type ReminderDraft = Pick<Reminder, 'title' | 'text' | 'at' | 'repeat' | 'target'>

const REPEATS: ReminderRepeat[] = ['none', 'daily', 'weekly']
const TARGETS: ReminderTarget[] = ['this_device', 'phone']

export const REPEAT_LABELS: Record<ReminderRepeat, string> = { none: 'Eenmalig', daily: 'Elke dag', weekly: 'Elke week' }
export const TARGET_LABELS: Record<ReminderTarget, string> = {
  this_device: 'Alleen hier',
  phone: 'Ook op gsm en horloge',
}

export function dueReminders(reminders: Reminder[], now: number): Reminder[] {
  return reminders.filter((r) => r.at <= now).sort((a, b) => a.at - b.at)
}

/**
 * The reminder after it went off: the next occurrence in the future for a repeating one
 * (same local time of day, also across daylight saving changes), or null when it is done.
 */
export function advance(reminder: Reminder, now: number): Reminder | null {
  if (reminder.repeat === 'none') return null
  const step = reminder.repeat === 'daily' ? 1 : 7
  const next = new Date(reminder.at)
  do next.setDate(next.getDate() + step)
  while (next.getTime() <= now)
  return { ...reminder, at: next.getTime() }
}

/** Validates a reminder from a form or from the AI; times must lie in the future. */
export function parseReminder(
  input: unknown,
  now: number,
): { ok: true; value: ReminderDraft } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Ongeldige herinnering.' }
  const { title, text, at, repeat = 'none', target = 'phone' } = input as Record<string, unknown>
  if (typeof title !== 'string' || !title.trim()) return { ok: false, error: 'Een herinnering heeft een titel nodig.' }
  if (text !== undefined && typeof text !== 'string') return { ok: false, error: 'De tekst moet tekst zijn.' }
  const time = typeof at === 'number' ? at : typeof at === 'string' ? Date.parse(at) : NaN
  if (!Number.isFinite(time)) return { ok: false, error: 'Onbekend tijdstip. Gebruik bv. 2026-10-20T09:00:00+02:00.' }
  if (time <= now) return { ok: false, error: 'Dat tijdstip ligt in het verleden.' }
  if (!REPEATS.includes(repeat as ReminderRepeat)) return { ok: false, error: 'Herhaling moet none, daily of weekly zijn.' }
  if (!TARGETS.includes(target as ReminderTarget)) return { ok: false, error: 'Doel moet this_device of phone zijn.' }
  return {
    ok: true,
    value: {
      title: title.trim().slice(0, 120),
      text: (text as string | undefined)?.trim().slice(0, 1000) || undefined,
      at: time,
      repeat: repeat as ReminderRepeat,
      target: target as ReminderTarget,
    },
  }
}
