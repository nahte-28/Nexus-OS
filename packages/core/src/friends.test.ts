import { describe, expect, it } from 'vitest'
import { friendCodeFromPath, friendLink, normalizeFriendCode, requestResult, sortFriends } from './friends'

describe('vrienden', () => {
  it('reads codes and links', () => {
    expect(normalizeFriendCode(' abcd-efgh ')).toBe('ABCDEFGH')
    expect(normalizeFriendCode('ABCD-EFG1')).toBeNull()
    expect(friendLink('https://nexus.app/', 'ABCDEFGH')).toBe('https://nexus.app/vriend/ABCD-EFGH')
    expect(friendCodeFromPath('/vriend/abcd-efgh')).toBe('ABCD-EFGH')
    expect(friendCodeFromPath('/join/ABCD-EFGH')).toBeNull()
  })

  it('puts requests to answer first', () => {
    const list = sortFriends([
      { userId: '1', displayName: 'Zoë', kind: 'friend', since: 0 },
      { userId: '2', displayName: 'Remo', kind: 'outgoing', since: 0 },
      { userId: '3', displayName: 'Bram', kind: 'incoming', since: 0 },
      { userId: '4', displayName: 'Anna', kind: 'friend', since: 0 },
    ])
    expect(list.map((f) => f.displayName)).toEqual(['Bram', 'Anna', 'Zoë', 'Remo'])
    expect(requestResult('accepted', 'Remo')).toBe('Jij en Remo zijn nu vrienden.')
  })
})
