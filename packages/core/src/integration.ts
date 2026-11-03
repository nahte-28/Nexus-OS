/**
 * Integratieronde (Next Frontier): what belongs together across modules. A deadline knows its
 * project, the Project Hub task it came from, the Inbox items about it and the Vault files linked
 * to its project; Financiën gets a payment calendar; Platform Health groups events into chains.
 * Nothing is stored here: everything is worked out from data the modules already keep. Pure logic.
 */
import type { NexusEvent } from './events'
import { addDays, nextDate, type FinanceState } from './finance'
import type { LifeItem } from './life'
import type { ProjectHubState } from './projectHub'
import type { AppId } from './windows'

export interface RelatedLink {
  /** What it is, in words: "Project", "Taak in Project Hub", "Melding", "Bestand", "Deadline". */
  label: string
  title: string
  app: AppId
  id?: string
}

export interface RelatedInput {
  life: LifeItem[]
  /** Inbox items (or events) that link to the Agenda. */
  inbox: Array<Pick<NexusEvent, 'id' | 'title' | 'at' | 'link'>>
  hub?: ProjectHubState | null
  /** Vault files linked to the project, already looked up. */
  files?: Array<{ id: string; name: string }>
  /** Where a project opens: the Project Hub when it is on, else the Agenda. */
  projectApp: 'projecthub' | 'agenda'
}

const MAX_RELATED = 12

/** Everything linked to one Agenda item (deadline, appointment or project), most useful first. */
export function relatedTo(itemId: string, input: RelatedInput): RelatedLink[] {
  const item = input.life.find((i) => i.id === itemId && i.deletedAt === null)
  if (!item) return []
  const out: RelatedLink[] = []
  const project = (id: string | null) => (id ? input.life.find((i) => i.id === id && i.kind === 'project' && i.deletedAt === null) : undefined)
  const tasks = input.hub ? input.hub.tasks.filter((t) => t.deletedAt === null) : []
  const inboxFor = (ids: Set<string>) =>
    [...input.inbox]
      .filter((e) => e.link?.app === 'agenda' && e.link.id && ids.has(e.link.id))
      .sort((a, b) => b.at - a.at)
      .map((e): RelatedLink => ({ label: 'Melding', title: e.title, app: 'inbox', id: e.id }))

  if (item.kind === 'deadline') {
    const p = project(item.projectId)
    if (p && p.kind === 'project') out.push({ label: 'Project', title: p.name, app: input.projectApp, id: p.id })
    for (const t of tasks.filter((t) => t.deadlineId === item.id)) out.push({ label: 'Taak in Project Hub', title: t.title, app: 'projecthub', id: t.projectId })
    out.push(...inboxFor(new Set([item.id])))
  } else if (item.kind === 'appointment') {
    out.push(...inboxFor(new Set([item.id])))
  } else {
    const deadlines = input.life.filter((i) => i.kind === 'deadline' && i.deletedAt === null && i.projectId === item.id)
    const open = deadlines.filter((d) => d.kind === 'deadline' && d.doneAt === null).sort((a, b) => (a.kind === 'deadline' && b.kind === 'deadline' ? a.dueAt - b.dueAt : 0))
    for (const d of open) if (d.kind === 'deadline') out.push({ label: 'Deadline', title: d.title, app: 'agenda', id: d.id })
    const openTasks = tasks.filter((t) => t.projectId === item.id && t.column !== 'done').length
    if (openTasks > 0) out.push({ label: 'Project Hub', title: `${openTasks} open ${openTasks === 1 ? 'taak' : 'taken'}`, app: 'projecthub', id: item.id })
    for (const f of input.files ?? []) out.push({ label: 'Bestand', title: f.name, app: 'files', id: f.id })
    out.push(...inboxFor(new Set(deadlines.map((d) => d.id))))
  }
  return out.slice(0, MAX_RELATED)
}

export interface PaymentDay {
  date: string
  items: Array<{ kind: 'subscription' | 'recurring'; id: string; name: string; category: string; /** Cents; negative is money going out. */ amount: number }>
}

export interface PaymentCalendar {
  month: string
  days: PaymentDay[]
  out: number
  in: number
}

const lastDay = (month: string) => {
  const [y, mo] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`
}

/**
 * Subscriptions and fixed amounts that fall in [month], per day. Dates before an item's next date
 * are left out: those were paid or added already and are in the transactions.
 */
export function paymentCalendar(s: FinanceState, month: string): PaymentCalendar {
  const first = `${month}-01`
  const last = lastDay(month)
  const byDay = new Map<string, PaymentDay['items']>()
  const add = (date: string, item: PaymentDay['items'][number]) => byDay.set(date, [...(byDay.get(date) ?? []), item])
  const datesOf = (next: string, cycle: Parameters<typeof nextDate>[1]) => {
    const out: string[] = []
    for (let day = next, n = 0; day <= last && n < 400; day = nextDate(day, cycle), n++) if (day >= first) out.push(day)
    return out
  }
  for (const sub of s.subscriptions.filter((x) => x.deletedAt === null)) for (const day of datesOf(sub.next, sub.cycle)) add(day, { kind: 'subscription', id: sub.id, name: sub.name, category: sub.category, amount: -Math.abs(sub.amount) })
  for (const r of s.recurring.filter((x) => x.deletedAt === null))
    for (const day of datesOf(r.next, r.cycle)) add(day, { kind: 'recurring', id: r.id, name: r.name, category: r.category, amount: r.kind === 'income' ? Math.abs(r.amount) : -Math.abs(r.amount) })
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, items: items.sort((a, b) => a.name.localeCompare(b.name, 'nl')) }))
  const all = days.flatMap((d) => d.items)
  return { month, days, out: all.filter((i) => i.amount < 0).reduce((n, i) => n - i.amount, 0), in: all.filter((i) => i.amount > 0).reduce((n, i) => n + i.amount, 0) }
}

/** The weekdays of [month] as a grid of weeks starting on Monday; null fills the gaps. */
export function monthGrid(month: string): Array<Array<string | null>> {
  const first = `${month}-01`
  const [y, mo] = month.split('-').map(Number)
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7
  const cells: Array<string | null> = Array.from({ length: lead }, () => null)
  for (let day = first; day <= lastDay(month); day = addDays(day, 1)) cells.push(day)
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
}

export interface EventChain {
  correlationId: string
  events: NexusEvent[]
  first: number
  last: number
}

/** Events with the same correlationId, as chains of two or more, newest chain first. */
export function eventChains(events: NexusEvent[], min = 2): EventChain[] {
  const groups = new Map<string, NexusEvent[]>()
  for (const e of events) if (e.correlationId) groups.set(e.correlationId, [...(groups.get(e.correlationId) ?? []), e])
  return [...groups.entries()]
    .filter(([, list]) => list.length >= min)
    .map(([correlationId, list]) => {
      const sorted = [...list].sort((a, b) => a.at - b.at)
      return { correlationId, events: sorted, first: sorted[0].at, last: sorted[sorted.length - 1].at }
    })
    .sort((a, b) => b.last - a.last)
}

/** Events per source within [hours] before [now]. */
export function eventCounts(events: NexusEvent[], now: number, hours = 24): Array<{ source: NexusEvent['source']; count: number; high: number }> {
  const since = now - hours * 3_600_000
  const counts = new Map<NexusEvent['source'], { count: number; high: number }>()
  for (const e of events) {
    if (e.at < since) continue
    const c = counts.get(e.source) ?? { count: 0, high: 0 }
    counts.set(e.source, { count: c.count + 1, high: c.high + (e.priority === 'high' ? 1 : 0) })
  }
  return [...counts.entries()].map(([source, c]) => ({ source, ...c })).sort((a, b) => b.count - a.count)
}

export type HealthLevel = 'ok' | 'warn' | 'bad'

export interface HealthCheck {
  id: string
  title: string
  level: HealthLevel
  detail: string
}

export interface HealthInput {
  online: boolean
  signedIn: boolean
  /** From the Offline-centrum channels. */
  channels: Array<{ label: string; pending: number; error: string | null }>
  registryProblems: string[]
  /** Modules switched on whose used modules are off, by title. */
  missingUses: Array<{ title: string; missing: string[] }>
  /** Bytes NEXUS keeps in localStorage, and the usual browser limit. */
  storageBytes: number
  storageLimit?: number
  /** High-priority events in the last 24 hours. */
  highEvents: number
}

/** The Platform Health checks, worst first. */
export function platformHealth(h: HealthInput): HealthCheck[] {
  const limit = h.storageLimit ?? 5 * 1024 * 1024
  const failing = h.channels.filter((c) => c.error)
  const pending = h.channels.reduce((n, c) => n + c.pending, 0)
  const share = h.storageBytes / limit
  const checks: HealthCheck[] = [
    { id: 'network', title: 'Verbinding', level: h.online ? 'ok' : 'warn', detail: h.online ? 'Online.' : 'Offline: wijzigingen wachten tot je weer online bent.' },
    {
      id: 'sync',
      title: 'Synchronisatie',
      level: !h.signedIn ? 'warn' : failing.length ? 'bad' : 'ok',
      detail: !h.signedIn ? 'Niet aangemeld: alles staat alleen op dit apparaat.' : failing.length ? `Problemen bij ${failing.map((c) => c.label).join(', ')}.` : pending ? `${pending} wijziging(en) wachten.` : 'Alles is verstuurd.',
    },
    { id: 'registry', title: 'Moduleregister', level: h.registryProblems.length ? 'bad' : 'ok', detail: h.registryProblems.length ? h.registryProblems.join(' · ') : 'Elke module heeft een manifest en een geldige app.' },
    {
      id: 'uses',
      title: 'Samenhang van modules',
      level: h.missingUses.length ? 'warn' : 'ok',
      detail: h.missingUses.length ? h.missingUses.map((x) => `${x.title} werkt beter met ${x.missing.join(', ')}`).join(' · ') : 'Wat aan staat, heeft wat het gebruikt.',
    },
    {
      id: 'storage',
      title: 'Opslag op dit apparaat',
      level: share > 0.9 ? 'bad' : share > 0.7 ? 'warn' : 'ok',
      detail: `${(h.storageBytes / 1024).toFixed(0)} kB van ongeveer ${(limit / 1024 / 1024).toFixed(0)} MB (${Math.round(share * 100)} %).`,
    },
    { id: 'events', title: 'Belangrijke meldingen (24 u)', level: h.highEvents > 10 ? 'warn' : 'ok', detail: h.highEvents ? `${h.highEvents} met hoge prioriteit.` : 'Geen met hoge prioriteit.' },
  ]
  const order: Record<HealthLevel, number> = { bad: 0, warn: 1, ok: 2 }
  return checks.sort((a, b) => order[a.level] - order[b.level])
}

/**
 * Where a notification leads when you tap it: the app and record its ref (the tag every NEXUS
 * notification carries) points at, or null when it points at nothing in particular.
 */
export function refLink(ref: string): { app: AppId; id?: string } | null {
  const match = /^([a-z-]+):([^@|:]*)/.exec(ref)
  if (!match) return null
  const [, kind, id] = match
  switch (kind) {
    case 'deadline':
    case 'appointment':
      return id ? { app: 'agenda', id } : { app: 'agenda' }
    case 'habit':
      return { app: 'habits' }
    case 'subscription':
    case 'finance':
      return { app: 'finance' }
    case 'flow':
      return id ? { app: 'flows', id } : { app: 'flows' }
    case 'dagstart':
    case 'review':
      return { app: 'agenda' }
    case 'sleep':
      return { app: 'gaming' }
    default:
      return null
  }
}
