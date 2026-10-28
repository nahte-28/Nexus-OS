/** NEXUS Connect: devices and the notifications they forward to each other. */

export type DevicePlatform = 'web' | 'android' | 'desktop'

export interface Device {
  id: string
  name: string
  platform: DevicePlatform
  /** P-256 public key as an uncompressed point, base64. */
  publicKey: string
  createdAt: string
  lastSeenAt: string
  revokedAt: string | null
  /** NEXUS in a browser that can be woken by web push, also when NEXUS is closed there. */
  push?: boolean
}

/** What a device sends, before encryption. The server never sees these fields. */
export interface ConnectPayload {
  v: 1
  kind: 'notification' | 'test'
  /** Android package name, or "nexus" for NEXUS' own messages. */
  app: string
  appName: string
  title: string
  /** Absent when the sender only shares titles for this app. */
  text?: string
  postedAt: number
  /** Ties a notification to a notice in the phone's safety net (see safetyNet.ts), so it shows once. */
  ref?: string
}

/** The phone's safety net: the notifications NEXUS will send it soon. Replaces the previous plan of the sender. */
export interface PlanPayload {
  v: 1
  kind: 'plan'
  items: Array<{ ref: string; at: number; title: string; text?: string }>
  sentAt: number
}

/**
 * Something done on another device. "done": a deadline or habit ticked off on the watch; the [ref] is
 * the one of the notice it came from (deadline:<id>@... or habit:<id>@<date>). "focus": a focus round
 * finished on the watch, for the focus log of Studie and Inzichten.
 */
export type ActionPayload =
  | { v: 1; kind: 'action'; action: 'done'; ref: string; at: number }
  | { v: 1; kind: 'action'; action: 'focus'; minutes: number; task: string; at: number }

export type ActionTarget = { kind: 'deadline'; id: string } | { kind: 'habit'; id: string; date: string }

export function parseAction(value: unknown): ActionPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const p = value as Record<string, unknown>
  if (p.v !== 1 || p.kind !== 'action' || typeof p.at !== 'number' || !Number.isFinite(p.at)) return null
  if (p.action === 'done') {
    const ref = str(p.ref, 300)
    return ref ? { v: 1, kind: 'action', action: 'done', ref, at: p.at } : null
  }
  if (p.action === 'focus' && typeof p.minutes === 'number' && Number.isInteger(p.minutes) && p.minutes >= 1 && p.minutes <= 180) {
    return { v: 1, kind: 'action', action: 'focus', minutes: p.minutes, task: str(p.task, 160) ?? '', at: p.at }
  }
  return null
}

/** What a notice ref points at, when it can be ticked off: a deadline or a habit on one day. */
export function actionTarget(ref: string): ActionTarget | null {
  const deadline = /^deadline:([^@]+)@/.exec(ref)
  if (deadline) return { kind: 'deadline', id: deadline[1] }
  const habit = /^habit:([^@]+)@(\d{4}-\d{2}-\d{2})$/.exec(ref)
  if (habit) return { kind: 'habit', id: habit[1], date: habit[2] }
  return null
}

/** A received notification as kept on the device (never in the cloud). */
export interface InboxItem extends ConnectPayload {
  id: string
  fromDeviceId: string
  receivedAt: number
  read: boolean
}

const MAX_FIELD = 4000

function str(value: unknown, max = MAX_FIELD): string | null {
  return typeof value === 'string' ? value.slice(0, max) : null
}

/** Validates a decrypted payload; anything malformed is dropped rather than shown. */
export function parsePayload(value: unknown): ConnectPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const p = value as Record<string, unknown>
  const app = str(p.app, 200)
  const appName = str(p.appName, 200)
  const title = str(p.title)
  if (p.v !== 1 || (p.kind !== 'notification' && p.kind !== 'test') || app === null || appName === null || title === null) {
    return null
  }
  if (typeof p.postedAt !== 'number' || !Number.isFinite(p.postedAt)) return null
  const text = str(p.text)
  const ref = str(p.ref, 300)
  return { v: 1, kind: p.kind, app, appName, title, ...(text !== null ? { text } : {}), postedAt: p.postedAt, ...(ref !== null ? { ref } : {}) }
}

/** Newest first, optionally narrowed to one app and a search term over app, title and text. */
export function filterInbox(items: InboxItem[], { app, query }: { app?: string | null; query?: string } = {}): InboxItem[] {
  const q = query?.trim().toLocaleLowerCase('nl') ?? ''
  return items
    .filter((i) => !app || i.app === app)
    .filter(
      (i) => !q || [i.appName, i.title, i.text ?? ''].some((field) => field.toLocaleLowerCase('nl').includes(q)),
    )
    .sort((a, b) => b.postedAt - a.postedAt || b.receivedAt - a.receivedAt)
}

/** Apps that appear in the inbox, for the filter list, most frequent first. */
export function inboxApps(items: InboxItem[]): Array<{ app: string; appName: string; count: number }> {
  const byApp = new Map<string, { app: string; appName: string; count: number }>()
  for (const i of items) {
    const entry = byApp.get(i.app) ?? { app: i.app, appName: i.appName, count: 0 }
    entry.count++
    byApp.set(i.app, entry)
  }
  return [...byApp.values()].sort((a, b) => b.count - a.count || a.appName.localeCompare(b.appName, 'nl'))
}

/** Keeps the inbox bounded to the `max` most recently received items. */
export function trimInbox(items: InboxItem[], max: number): InboxItem[] {
  if (items.length <= max) return items
  const sorted = [...items].sort((a, b) => b.receivedAt - a.receivedAt)
  return sorted.slice(0, max)
}

export function activeDevices(devices: Device[]): Device[] {
  return devices.filter((d) => d.revokedAt === null)
}

export const PLATFORM_LABELS: Record<DevicePlatform, string> = {
  web: 'Webbrowser',
  android: 'Android',
  desktop: 'Windows-app',
}

/** A readable default name for this browser, e.g. "Chrome op Windows". */
export function defaultDeviceName(userAgent: string): string {
  const os = /Android/i.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/i.test(userAgent)
      ? 'iOS'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac OS X/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : null
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser'
  return os ? `${browser} op ${os}` : browser
}
