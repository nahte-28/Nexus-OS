import { describe, expect, it } from 'vitest'
import { commentCounts, completeMention, findMentions, mentionNotice, mentionParts, mentionQuery, mentionSuggestions } from './taskComments'

const members = [
  { userId: 'e', displayName: 'Ethan' },
  { userId: 'r', displayName: 'Remo' },
  { userId: 'rv', displayName: 'Remo VG' },
  { userId: 'z', displayName: 'Zoë' },
]

describe('opmerkingen', () => {
  it('finds mentioned members, the longest name first, without yourself or doubles', () => {
    expect(findMentions('@remo vg en @Zoë, kijken jullie? @Remo ook', members)).toEqual(['rv', 'z', 'r'])
    expect(findMentions('@Ethan @Ethan', members, 'e')).toEqual([])
    expect(findMentions('mail@remo.be en @Remoo', members)).toEqual([])
  })

  it('suggests members while typing after @ and completes the name', () => {
    expect(mentionQuery('hoi @re', 7)).toEqual({ start: 4, query: 're' })
    expect(mentionQuery('hoi', 3)).toBeNull()
    expect(mentionQuery('a@re', 4)).toBeNull()
    expect(mentionSuggestions(members, 're', 'e').map((m) => m.userId)).toEqual(['r', 'rv'])
    expect(mentionSuggestions(members, 'vg').map((m) => m.userId)).toEqual(['rv'])
    expect(completeMention('hoi @re!', { start: 4, query: 're' }, 'Remo VG')).toEqual({ text: 'hoi @Remo VG !', caret: 13 })
  })

  it('splits a comment into text and mentions', () => {
    expect(mentionParts('Ok @zoë, top', members)).toEqual([{ text: 'Ok ' }, { text: '@zoë', userId: 'z' }, { text: ', top' }])
  })

  it('counts comments per task and writes a notice', () => {
    const counts = commentCounts([{ target: { kind: 'project', taskId: 'a' } }, { target: { kind: 'project', taskId: 'a' } }, { target: { kind: 'group', taskId: 'b' } }])
    expect([...counts]).toEqual([['a', 2], ['b', 1]])
    expect(mentionNotice('Remo', 'Verslag', 'Kijk  jij\ndit na?')).toEqual({ title: 'Remo noemde je bij Verslag', body: 'Kijk jij dit na?' })
  })
})
