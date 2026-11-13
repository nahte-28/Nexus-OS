import { describe, expect, it } from 'vitest'
import { chatNotice, chatRuns, cleanMessage, mergeMessages, TEAM_MESSAGE_MAX, unreadMessages, type TeamMessage } from './teamChat'

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const msg = (id: string, userId: string, createdAt: number, body = id): TeamMessage => ({ id, groupId: 'g', userId, body, createdAt })

describe('teamchat', () => {
  it('cleans what is sent', () => {
    expect(cleanMessage('  \n ')).toBeNull()
    expect(cleanMessage(' hoi\r\n\r\n\r\n\r\n\r\nallemaal ')).toBe('hoi\n\n\nallemaal')
    expect(cleanMessage('x'.repeat(TEAM_MESSAGE_MAX + 5))!.length).toBe(TEAM_MESSAGE_MAX)
  })

  it('merges without doubles, in time order', () => {
    const a = [msg('1', 'u', 10), msg('2', 'u', 20)]
    const b = [msg('2', 'u', 20), msg('3', 'v', 15)]
    expect(mergeMessages(a, b).map((m) => m.id)).toEqual(['1', '3', '2'])
  })

  it('groups one sender into runs with a day separator', () => {
    const now = at(2026, 11, 13, 12)
    const runs = chatRuns(
      [
        msg('a', 'u', at(2026, 11, 12, 20, 0)),
        msg('b', 'u', at(2026, 11, 12, 20, 3)),
        msg('c', 'v', at(2026, 11, 12, 20, 4)),
        msg('d', 'v', at(2026, 11, 12, 20, 30)),
        msg('e', 'v', at(2026, 11, 13, 9)),
      ],
      now,
    )
    expect(runs.map((r) => r.messages.map((m) => m.id).join(''))).toEqual(['ab', 'c', 'd', 'e'])
    expect(runs.map((r) => r.day)).toEqual(['Gisteren', null, null, 'Vandaag'])
  })

  it('counts unread messages of others only', () => {
    const list = [msg('1', 'me', 30), msg('2', 'u', 20), msg('3', 'u', 40)]
    expect(unreadMessages(list, 25, 'me')).toBe(1)
    expect(unreadMessages(list, 0, 'me')).toBe(2)
  })

  it('writes a short notice', () => {
    const n = chatNotice('Remo', 'Projectgroep IoT', `Wie   doet\nde ${'x'.repeat(200)}`)
    expect(n.title).toBe('Remo in Projectgroep IoT')
    expect(n.body.startsWith('Wie doet de x')).toBe(true)
    expect(n.body.length).toBe(140)
  })
})
