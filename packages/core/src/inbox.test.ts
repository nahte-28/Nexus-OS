import { describe, expect, it } from 'vitest'
import { makeEvent } from './events'
import {
  backFromSnooze,
  changeItems,
  deadlineEvents,
  dueForArchive,
  inboxView,
  ingest,
  INBOX_MAX,
  markSeen,
  MAX_DELIVERY_DEVICES,
  mergeDelivery,
  mergeInbox,
  mergeInboxRules,
  parseInboxPolicy,
  parseInboxRules,
  ruleFor,
  snoozeTimes,
  toInboxEntry,
  unreadCount,
} from './inbox'

const ev = (id: string, at: number, extra: Partial<Parameters<typeof makeEvent>[0]> = {}) =>
  makeEvent({ id, source: 'flow', type: 'flow.failed', at, title: id, ...extra })

describe('universal inbox', () => {
  it('takes each event once, and only from sources that are allowed', () => {
    const items = ingest([], [ev('a', 1), ev('a', 2), ev('b', 3, { source: 'update', type: 'update.available' }), ev('c', 4, { source: 'system', type: 'space.opened' })], {
      update: false,
    })
    expect(items.map((i) => i.id)).toEqual(['a'])
    expect(ingest(items, [ev('a', 5)], {})).toBe(items)
  })

  it('splits into Inbox, Priority, Gepland and Archief, with filters', () => {
    let items = ingest([], [ev('low', 1, { priority: 'low' }), ev('high', 2, { priority: 'high', deviceId: 'pc' }), ev('later', 3)], {})
    items = changeItems(items, ['later'], { snoozedUntil: 100 }, 10)
    items = changeItems(items, ['low'], { archived: true }, 10)
    expect(inboxView(items, 'inbox', 50).map((i) => i.id)).toEqual(['high'])
    expect(inboxView(items, 'priority', 50).map((i) => i.id)).toEqual(['high'])
    expect(inboxView(items, 'scheduled', 50).map((i) => i.id)).toEqual(['later'])
    expect(inboxView(items, 'archive', 50).map((i) => i.id)).toEqual(['low'])
    expect(inboxView(items, 'inbox', 150).map((i) => i.id)).toEqual(['later', 'high'])
    expect(inboxView(items, 'inbox', 150, { deviceId: 'pc' }).map((i) => i.id)).toEqual(['high'])
    expect(unreadCount(items, 150)).toBe(2)
    expect(unreadCount(changeItems(items, ['high'], { read: true }, 160), 170)).toBe(1)
  })

  it('merges copies per item, newest change first, and stays within the limit', () => {
    const base = ingest([], [ev('a', 1)], {})
    const read = changeItems(base, ['a'], { read: true }, 20)
    const archived = changeItems(base, ['a'], { archived: true }, 30)
    expect(mergeInbox(read, archived)[0]).toMatchObject({ readAt: null, archivedAt: 30 })
    const many = ingest([], Array.from({ length: INBOX_MAX + 20 }, (_, i) => ev(`e${i}`, i)), {})
    expect(many).toHaveLength(INBOX_MAX)
    expect(many[0].id).toBe(`e${INBOX_MAX + 19}`)
  })

  it('reads stored items back', () => {
    const [item] = changeItems(ingest([], [ev('a', 1)], {}), ['a'], { read: true }, 5)
    expect(toInboxEntry(JSON.parse(JSON.stringify(item)))).toEqual(item)
    expect(toInboxEntry({ id: 'x' })).toBeNull()
  })

  it('makes deadline events a day ahead and when overdue', () => {
    const now = Date.UTC(2026, 9, 29, 12)
    const events = deadlineEvents(
      [
        { id: 'soon', title: 'Verslag', dueAt: now + 3_600_000 },
        { id: 'far', title: 'Later', dueAt: now + 3 * 86_400_000 },
        { id: 'late', title: 'Labo', dueAt: now - 60_000 },
      ],
      now,
    )
    expect(events.map((e) => e.id)).toEqual([`deadline:soon@${now + 3_600_000}`, `deadline:late@${now - 60_000}:over`])
    expect(events[1].title).toBe('Deadline verstreken: Labo')
  })

  it('offers snooze moments in the future', () => {
    const now = Date.now()
    for (const t of snoozeTimes(now)) expect(t.until).toBeGreaterThan(now)
  })
})

describe('universal inbox 2.0', () => {
  it('applies the rule of a source: off, quiet, own priority', () => {
    const policy = { update: { mode: 'off' as const, priority: 'keep' as const, archiveAfterDays: null }, flow: { mode: 'quiet' as const, priority: 'low' as const, archiveAfterDays: null } }
    const items = ingest([], [ev('a', 1, { priority: 'high' }), ev('b', 2, { source: 'update', type: 'update.available' })], policy, 'Pc')
    expect(items.map((i) => [i.id, i.priority, i.readAt])).toEqual([['a', 'low', 1]])
    expect(items[0].delivery).toEqual({ Pc: { seenAt: 1, readAt: 1 } })
    expect(unreadCount(items, 5)).toBe(0)
    expect(ruleFor({ update: false }, 'update').mode).toBe('off')
    expect(parseInboxPolicy({ update: false, flow: { mode: 'x', priority: 'high', archiveAfterDays: 3 }, nope: true })).toEqual({
      update: { mode: 'off', priority: 'keep', archiveAfterDays: null },
      flow: { mode: 'on', priority: 'high', archiveAfterDays: null },
    })
  })

  it('archives by itself after the days of the rule', () => {
    const day = 86_400_000
    const items = ingest([], [ev('old', 0), ev('new', 2 * day), ev('other', 0, { source: 'update', type: 'update.available' })], {})
    expect(dueForArchive(items, { flow: { mode: 'on', priority: 'keep', archiveAfterDays: 1 } }, 2.5 * day)).toEqual(['old'])
  })

  it('brings a snoozed item back unread and on top', () => {
    let items = ingest([], [ev('a', 1), ev('b', 2)], {})
    items = changeItems(items, ['a'], { read: true }, 3)
    items = changeItems(items, ['a'], { snoozedUntil: 100 }, 4)
    expect(items.find((i) => i.id === 'a')?.readAt).toBeNull()
    expect(inboxView(items, 'inbox', 50).map((i) => i.id)).toEqual(['b'])
    expect(inboxView(items, 'inbox', 150).map((i) => i.id)).toEqual(['a', 'b'])
    expect(backFromSnooze(items.find((i) => i.id === 'a')!, 150)).toBe(true)
  })

  it('keeps per device the first arrival and read, whatever copy wins', () => {
    const [base] = ingest([], [ev('a', 1)], {}, 'Pc')
    const onPhone = markSeen([base], 'Gsm', 10)
    expect(markSeen(onPhone, 'Gsm', 20)).toBe(onPhone)
    const readOnPc = changeItems([base], ['a'], { read: true }, 30, 'Pc')
    const merged = mergeInbox(onPhone, readOnPc)[0]
    expect(merged.readAt).toBe(30)
    expect(merged.delivery).toEqual({ Pc: { seenAt: 1, readAt: 30 }, Gsm: { seenAt: 10 } })
    expect(mergeDelivery({ X: { seenAt: 5, readAt: 9 } }, { X: { seenAt: 3 } })).toEqual({ X: { seenAt: 3, readAt: 9 } })
    expect(toInboxEntry(JSON.parse(JSON.stringify(merged)))).toEqual(merged)
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`D${i}`, { seenAt: i }]))
    expect(Object.keys(mergeDelivery(many, {}))).toHaveLength(MAX_DELIVERY_DEVICES)
  })

  it('merges the synced rules by last change', () => {
    const a = parseInboxRules({ rules: { update: false }, updatedAt: 5, revision: 1 })
    const b = parseInboxRules({ rules: {}, updatedAt: 9, revision: 2 })
    expect(mergeInboxRules(a, b)).toBe(b)
    expect(a.rules.update?.valueOf()).toEqual({ mode: 'off', priority: 'keep', archiveAfterDays: null })
  })
})
