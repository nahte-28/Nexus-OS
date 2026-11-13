import { describe, expect, it } from 'vitest'
import { conversations, openText, sealText, type DirectMessage } from './directMessages'

const m = (id: string, sender: string, recipient: string, createdAt: number, readAt: number | null = null): DirectMessage => ({ id, sender, recipient, createdAt, readAt, text: id })

describe('privéberichten', () => {
  it('seals and opens a versioned text', () => {
    expect(openText(sealText('hoi'))).toBe('hoi')
    expect(openText('{"v":2,"text":"x"}')).toBeNull()
    expect(openText('geen json')).toBeNull()
    expect(openText(null)).toBeNull()
  })

  it('lists conversations, the latest first, with unread messages from the friend', () => {
    const list = conversations(['r', 'z', 'b'], [m('1', 'r', 'me', 10), m('2', 'me', 'r', 20), m('3', 'z', 'me', 30), m('4', 'z', 'me', 40, 41), m('5', 'x', 'y', 99)], 'me')
    expect(list.map((c) => [c.friendId, c.last?.id ?? null, c.unread])).toEqual([
      ['z', '4', 1],
      ['r', '2', 1],
      ['b', null, 0],
    ])
  })
})
