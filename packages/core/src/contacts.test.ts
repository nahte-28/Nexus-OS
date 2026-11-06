import { describe, expect, it } from 'vitest'
import {
  birthdayLabel, birthdayNotices, birthdaysOn, cleanBirthday, dagstartBirthdayLine, deleteContact, emptyContact, emptyContacts, importContacts, listContacts, mergeContacts, nextBirthday,
  parseContacts, parseVCards, plannedBirthdayNotices, saveContact, telHref, toVCards, upcomingBirthdays, type ContactsState,
} from './contacts'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const save = (s: ContactsState, name: string, extra: Partial<ReturnType<typeof emptyContact>> = {}, id = name, now = 1) => {
  const r = saveContact(s, { ...emptyContact(), name, ...extra }, id, now)
  if (typeof r === 'string') throw new Error(r)
  return r
}

describe('contacten', () => {
  it('keeps, searches and sorts contacts', () => {
    let s = save(emptyContacts(), 'Zoë', { phone: '+32 470 12 34 56' })
    s = save(s, 'anna', { email: 'anna@voorbeeld.be' })
    s = save(s, 'Bert', { favorite: true })
    expect(listContacts(s).map((c) => c.name)).toEqual(['Bert', 'anna', 'Zoë'])
    expect(listContacts(s, '0470 12').map((c) => c.name)).toEqual(['Zoë'])
    expect(listContacts(s, 'VOORBEELD').map((c) => c.name)).toEqual(['anna'])
    expect(saveContact(s, { ...emptyContact(), name: '  ' }, 'x')).toBe('Geef de contactpersoon een naam.')
    expect(telHref('+32 470 12 34 56')).toBe('tel:+32470123456')
    expect(telHref('nee')).toBeNull()
  })

  it('syncs changes and deletions contact by contact', () => {
    const base = save(save(emptyContacts(), 'Anna', {}, 'a', 1), 'Bert', {}, 'b', 1)
    const pc = deleteContact(base, 'a', 5)
    const phone = save(base, 'Bert Peeters', {}, 'b', 6)
    const merged = mergeContacts(pc, phone, 10)
    expect(listContacts(merged).map((c) => c.name)).toEqual(['Bert Peeters'])
    expect(merged.contacts.find((c) => c.id === 'a')?.deleted).toBe(true)
    // An old deletion is cleaned up after 90 days.
    expect(mergeContacts(merged, merged, 5 + 91 * 86_400_000).contacts.map((c) => c.id)).toEqual(['b'])
    expect(parseContacts(JSON.parse(JSON.stringify(merged)))).toEqual(merged)
  })

  it('works out birthdays, also on 29 February', () => {
    expect(cleanBirthday('2004-02-30')).toBe('')
    expect(cleanBirthday('--12-25')).toBe('--12-25')
    expect(nextBirthday('2004-11-10', at(2026, 11, 6, 15))).toEqual({ at: at(2026, 11, 10), turns: 22 })
    expect(nextBirthday('2004-11-06', at(2026, 11, 6, 15))).toEqual({ at: at(2026, 11, 6), turns: 22 })
    expect(nextBirthday('2004-02-29', at(2026, 11, 6))).toEqual({ at: at(2027, 2, 28), turns: 23 })
    expect(nextBirthday('--01-02', at(2026, 11, 6))).toEqual({ at: at(2027, 1, 2), turns: null })
    let s = save(emptyContacts(), 'Anna', { birthday: '2004-11-10' })
    s = save(s, 'Bert', { birthday: '--11-07', remindBirthday: false })
    s = save(s, 'Carl', { birthday: '1990-03-01' })
    expect(upcomingBirthdays(s, at(2026, 11, 6, 12)).map((b) => [b.contact.name, b.daysLeft, b.turns])).toEqual([['Bert', 1, null], ['Anna', 4, 22]])
  })

  it('plans a notice on the day at the chosen time', () => {
    let s = save(emptyContacts(), 'Anna', { birthday: '2004-11-07' }, 'a')
    s = save(s, 'Bert', { birthday: '--11-07', remindBirthday: false }, 'b')
    const notices = birthdayNotices(s, at(2026, 11, 6, 12), at(2026, 11, 8))
    expect(notices).toEqual([{ ref: 'birthday:a@2026-11-07', at: at(2026, 11, 7, 9), title: 'Verjaardag: Anna', text: 'Anna wordt vandaag 22.', target: 'phone' }])
    expect(birthdayNotices(s, at(2026, 11, 7, 9), at(2026, 11, 8))).toEqual([])
    expect(plannedBirthdayNotices(s, at(2026, 11, 6, 12))).toHaveLength(1)
    const here = { ...s, settings: { ...s.settings, birthdayTarget: 'this_device' as const } }
    expect(plannedBirthdayNotices(here, at(2026, 11, 6, 12))).toEqual([])
  })

  it('reads and writes vCards', () => {
    const vcf = [
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Peeters;Anna;;;', 'FN:Anna Peeters', 'TEL;TYPE=CELL:+32 470 11 22 33', 'TEL;TYPE=HOME:03 123 45 67',
      'EMAIL;TYPE=INTERNET:anna@voorbeeld.be', 'BDAY:20041110', 'ADR;TYPE=HOME:;;Meir 1;Antwerpen;;2000;België', 'NOTE:Klasgenote\\, 1IT3', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:2.1', 'N:Janssens;Bert', 'BDAY:--0107', 'END:VCARD',
      'BEGIN:VCARD', 'END:VCARD',
    ].join('\r\n')
    const drafts = parseVCards(vcf)
    expect(drafts).toEqual([
      { ...emptyContact(), name: 'Anna Peeters', phone: '+32 470 11 22 33', email: 'anna@voorbeeld.be', birthday: '2004-11-10', address: 'Meir 1, Antwerpen, 2000, België', notes: 'Klasgenote, 1IT3' },
      { ...emptyContact(), name: 'Bert Janssens', birthday: '--01-07' },
    ])
    let n = 0
    const first = importContacts(emptyContacts(), drafts, () => `c${n++}`, 1)
    expect(first.added).toBe(2)
    expect(importContacts(first.state, drafts, () => `c${n++}`, 2)).toMatchObject({ added: 0, skipped: 2 })
    const back = parseVCards(toVCards(listContacts(first.state)))
    expect(back.map((d) => [d.name, d.phone, d.birthday, d.notes])).toEqual([['Anna Peeters', '+32 470 11 22 33', '2004-11-10', 'Klasgenote, 1IT3'], ['Bert Janssens', '', '--01-07', '']])
  })
})

describe('verjaardagen in de agenda', () => {
  it('lists who is jarig on a day', () => {
    let s = save(emptyContacts(), 'Anna', { birthday: '2004-11-07' }, 'a')
    s = save(s, 'Bert', { birthday: '--11-07' }, 'b')
    s = save(s, 'Carl', { birthday: '1990-11-08' }, 'c')
    expect(birthdaysOn(s, at(2026, 11, 7)).map(birthdayLabel)).toEqual(['Anna wordt 22', 'Bert verjaart'])
    expect(dagstartBirthdayLine(s, at(2026, 11, 8))).toBe('Jarig: Carl wordt 36')
    expect(dagstartBirthdayLine(s, at(2026, 11, 9))).toBeNull()
  })
})
