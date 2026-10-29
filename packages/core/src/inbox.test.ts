import { describe, expect, it } from 'vitest'
import { makeEvent } from './events'
import { changeItems, deadlineEvents, inboxView, ingest, INBOX_MAX, mergeInbox, snoozeTimes, toInboxEntry, unreadCount } from './inbox'

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
