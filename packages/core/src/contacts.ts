// Contacten: your address book, synced as user_settings key 'contacts', with birthday notices. Pure logic.
import type { PlannedNotice } from './safetyNet'
import { SAFETY_HORIZON_MS } from './safetyNet'

export type BirthdayTarget = 'this_device' | 'phone'

export interface Contact {
  id: string
  name: string
  phone: string
  email: string
  /** 'YYYY-MM-DD', or '--MM-DD' when the year is unknown, or ''. */
  birthday: string
  address: string
  notes: string
  favorite: boolean
  /** A notice on the day itself. */
  remindBirthday: boolean
  updatedAt: number
  /** Kept a while so the deletion reaches your other devices. */
  deleted?: boolean
}

export interface ContactsSettings {
  /** When the birthday notice comes, like 09:00. */
  birthdayTime: string
  birthdayTarget: BirthdayTarget
  updatedAt: number
}

export interface ContactsState {
  contacts: Contact[]
  settings: ContactsSettings
  revision: number
}

export const MAX_CONTACTS = 1000
const TOMBSTONE_MS = 90 * 24 * 60 * 60_000
const LIMITS = { name: 100, phone: 40, email: 120, address: 200, notes: 1000 }

export const emptyContacts = (): ContactsState => ({ contacts: [], settings: { birthdayTime: '09:00', birthdayTarget: 'phone', updatedAt: 0 }, revision: 0 })

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** A birthday in one of the two forms, or '' for anything else. */
export function cleanBirthday(v: unknown): string {
  if (typeof v !== 'string') return ''
  const m = /^(\d{4}|-)-(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return ''
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  const year = m[1] === '-' ? 2000 : Number(m[1])
  if (m[1] !== '-' && (year < 1900 || year > 2100)) return ''
  const d = new Date(year, month - 1, day)
  if (d.getMonth() !== month - 1) return ''
  return m[1] === '-' ? `--${m[2]}-${m[3]}` : `${m[1]}-${m[2]}-${m[3]}`
}

const cleanTime = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '09:00')

function parseContact(raw: unknown): Contact | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const id = str(o.id, 80)
  if (!id) return null
  const c: Contact = {
    id,
    name: str(o.name, LIMITS.name),
    phone: str(o.phone, LIMITS.phone),
    email: str(o.email, LIMITS.email),
    birthday: cleanBirthday(o.birthday),
    address: str(o.address, LIMITS.address),
    notes: str(o.notes, LIMITS.notes),
    favorite: o.favorite === true,
    remindBirthday: o.remindBirthday !== false,
    updatedAt: num(o.updatedAt),
  }
  if (o.deleted === true) c.deleted = true
  return c
}

export function parseContacts(raw: unknown): ContactsState {
  if (typeof raw !== 'object' || raw === null) return emptyContacts()
  const v = raw as Record<string, unknown>
  const s = (typeof v.settings === 'object' && v.settings !== null ? v.settings : {}) as Record<string, unknown>
  return {
    contacts: (Array.isArray(v.contacts) ? v.contacts : []).map(parseContact).filter((c): c is Contact => c !== null).slice(0, MAX_CONTACTS + 200),
    settings: { birthdayTime: cleanTime(s.birthdayTime), birthdayTarget: s.birthdayTarget === 'this_device' ? 'this_device' : 'phone', updatedAt: num(s.updatedAt) },
    revision: num(v.revision),
  }
}

/** Contact by contact, the newer change wins, deletions included; old deletions are dropped. */
export function mergeContacts(a: ContactsState, b: ContactsState, now = Date.now()): ContactsState {
  const byId = new Map(a.contacts.map((c) => [c.id, c]))
  for (const c of b.contacts) {
    const mine = byId.get(c.id)
    if (!mine || c.updatedAt > mine.updatedAt) byId.set(c.id, c)
  }
  return {
    contacts: [...byId.values()].filter((c) => !c.deleted || now - c.updatedAt < TOMBSTONE_MS),
    settings: b.settings.updatedAt > a.settings.updatedAt ? b.settings : a.settings,
    revision: Math.max(a.revision, b.revision),
  }
}

export type ContactDraft = Omit<Contact, 'id' | 'updatedAt' | 'deleted'>

export const emptyContact = (): ContactDraft => ({ name: '', phone: '', email: '', birthday: '', address: '', notes: '', favorite: false, remindBirthday: true })

/** Adds or changes a contact. Returns an error in Dutch when it cannot. */
export function saveContact(state: ContactsState, draft: ContactDraft, id: string, now = Date.now()): ContactsState | string {
  const name = draft.name.trim()
  if (!name) return 'Geef de contactpersoon een naam.'
  const live = state.contacts.filter((c) => !c.deleted)
  if (!live.some((c) => c.id === id) && live.length >= MAX_CONTACTS) return `Je hebt al ${MAX_CONTACTS} contacten.`
  const contact = parseContact({ ...draft, name, phone: draft.phone.trim(), email: draft.email.trim(), id, updatedAt: now })!
  return { ...state, contacts: [...state.contacts.filter((c) => c.id !== id), contact] }
}

export function deleteContact(state: ContactsState, id: string, now = Date.now()): ContactsState {
  return {
    ...state,
    contacts: state.contacts.map((c) => (c.id === id ? { ...emptyContact(), id, name: '', updatedAt: now, deleted: true, remindBirthday: false } : c)),
  }
}

/** A phone number to compare: digits only, with +32 or 0032 written as a leading 0. */
const phoneDigits = (p: string) => p.replace(/[^\d+]/g, '').replace(/^(\+|00)32/, '0').replace(/\D/g, '')

/** Live contacts: favourites first, then by name; [q] searches name, phone, email and notes. */
export function listContacts(state: ContactsState, q = ''): Contact[] {
  const needle = q.trim().toLocaleLowerCase('nl')
  const digits = phoneDigits(needle)
  return state.contacts
    .filter((c) => !c.deleted)
    .filter((c) => !needle || [c.name, c.email, c.notes, c.address].some((f) => f.toLocaleLowerCase('nl').includes(needle)) || (digits.length >= 3 && phoneDigits(c.phone).includes(digits)))
    .sort((x, y) => Number(y.favorite) - Number(x.favorite) || x.name.localeCompare(y.name, 'nl', { sensitivity: 'base' }))
}

/** A phone number for a tel: link (digits and a leading +), or null. */
export function telHref(phone: string): string | null {
  const p = phone.trim().replace(/(?!^\+)[^\d]/g, '')
  return /^\+?\d{3,}$/.test(p) ? `tel:${p}` : null
}

// Birthdays ---------------------------------------------------------------------------------------

export interface UpcomingBirthday {
  contact: Contact
  /** Local midnight of the day. */
  at: number
  /** The age they turn, when the year is known. */
  turns: number | null
  daysLeft: number
}

const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** The day [birthday] next comes at or after the day of [now]; 29 February is 28 February in other years. */
export function nextBirthday(birthday: string, now: number): { at: number; turns: number | null } | null {
  const b = cleanBirthday(birthday)
  if (!b) return null
  const [y, m, d] = b.startsWith('--') ? [null, Number(b.slice(2, 4)), Number(b.slice(5, 7))] : b.split('-').map(Number)
  const today = startOfDay(now)
  for (let year = new Date(now).getFullYear(); ; year++) {
    const leap = new Date(year, 1, 29).getMonth() === 1
    const day = m === 2 && d === 29 && !leap ? 28 : d
    const at = new Date(year, m - 1, day).getTime()
    if (at >= today) return { at, turns: y === null ? null : year - y }
  }
}

export function upcomingBirthdays(state: ContactsState, now: number, days = 30): UpcomingBirthday[] {
  const today = startOfDay(now)
  return listContacts(state)
    .flatMap((contact) => {
      const next = nextBirthday(contact.birthday, now)
      if (!next) return []
      const daysLeft = Math.round((next.at - today) / 86_400_000)
      return daysLeft <= days ? [{ contact, at: next.at, turns: next.turns, daysLeft }] : []
    })
    .sort((a, b) => a.at - b.at || a.contact.name.localeCompare(b.contact.name, 'nl'))
}

const dateKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Birthday notices due in (from, to], at the chosen time on the day. Ref birthday:<id>@<date>. */
export function birthdayNotices(state: ContactsState, from: number, to: number): Array<PlannedNotice & { target: BirthdayTarget }> {
  const [h, min] = state.settings.birthdayTime.split(':').map(Number)
  const out: Array<PlannedNotice & { target: BirthdayTarget }> = []
  for (const c of listContacts(state)) {
    if (!c.remindBirthday) continue
    // A notice on the day can be due from the day before [from] (for a late time) up to [to].
    let next = nextBirthday(c.birthday, from - 86_400_000)
    while (next) {
      const day = new Date(next.at)
      day.setHours(h, min, 0, 0)
      const at = day.getTime()
      if (at > to) break
      if (at > from) {
        out.push({
          ref: `birthday:${c.id}@${dateKey(next.at)}`,
          at,
          title: `Verjaardag: ${c.name}`,
          text: next.turns !== null && next.turns > 0 ? `${c.name} wordt vandaag ${next.turns}.` : `${c.name} verjaart vandaag.`,
          target: state.settings.birthdayTarget,
        })
      }
      next = nextBirthday(c.birthday, next.at + 86_400_000)
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** The birthday notices the phone should know ahead (safety net and web push). */
export function plannedBirthdayNotices(state: ContactsState, now: number, horizon = SAFETY_HORIZON_MS): PlannedNotice[] {
  return birthdayNotices(state, now, now + horizon)
    .filter((n) => n.target === 'phone')
    .map(({ target: _target, ...n }) => n)
}

// vCard (.vcf), to move contacts from and to a phone -----------------------------------------------

const unescape = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
const escape = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

/** Reads the contacts in a .vcf file (name, phone, email, birthday, address, note). */
export function parseVCards(text: string): ContactDraft[] {
  // Unfold continued lines first (a line starting with a space continues the one before).
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const out: ContactDraft[] = []
  let cur: ContactDraft | null = null
  let n = ''
  for (const line of lines) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const head = line.slice(0, i).toUpperCase()
    const value = line.slice(i + 1).trim()
    const prop = head.split(';')[0].replace(/^ITEM\d+\./, '')
    if (prop === 'BEGIN' && value.toUpperCase() === 'VCARD') {
      cur = emptyContact()
      n = ''
    } else if (prop === 'END' && cur) {
      if (!cur.name && n) cur.name = n
      if (cur.name.trim()) out.push({ ...cur, name: cur.name.slice(0, LIMITS.name) })
      cur = null
    } else if (cur) {
      if (prop === 'FN') cur.name = unescape(value)
      else if (prop === 'N') n = value.split(';').slice(0, 2).reverse().map(unescape).filter(Boolean).join(' ')
      else if (prop === 'TEL' && !cur.phone) cur.phone = value.replace(/^tel:/i, '').slice(0, LIMITS.phone)
      else if (prop === 'EMAIL' && !cur.email) cur.email = unescape(value).slice(0, LIMITS.email)
      else if (prop === 'BDAY') {
        const v = value.replace(/T.*$/, '')
        cur.birthday = cleanBirthday(/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : /^--\d{4}$/.test(v) ? `--${v.slice(2, 4)}-${v.slice(4)}` : v)
      } else if (prop === 'ADR' && !cur.address) cur.address = value.split(';').map(unescape).filter(Boolean).join(', ').slice(0, LIMITS.address)
      else if (prop === 'NOTE') cur.notes = unescape(value).slice(0, LIMITS.notes)
    }
    if (out.length >= MAX_CONTACTS) break
  }
  return out
}

export function toVCards(contacts: Contact[]): string {
  return contacts
    .filter((c) => !c.deleted)
    .map((c) => {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escape(c.name)}`, `N:;${escape(c.name)};;;`]
      if (c.phone) lines.push(`TEL;TYPE=CELL:${c.phone}`)
      if (c.email) lines.push(`EMAIL:${escape(c.email)}`)
      if (c.birthday) lines.push(`BDAY:${c.birthday}`)
      if (c.address) lines.push(`ADR:;;${escape(c.address)};;;;`)
      if (c.notes) lines.push(`NOTE:${escape(c.notes)}`)
      lines.push('END:VCARD')
      return lines.join('\r\n')
    })
    .join('\r\n')
}

/** Imports [drafts], skipping ones with a name and phone (or email) you already have. */
export function importContacts(state: ContactsState, drafts: ContactDraft[], newId: () => string, now = Date.now()): { state: ContactsState; added: number; skipped: number } {
  const seen = new Set(listContacts(state).map((c) => `${c.name.toLocaleLowerCase('nl')}|${phoneDigits(c.phone) || c.email.toLowerCase()}`))
  let next = state
  let added = 0
  let skipped = 0
  for (const d of drafts) {
    const key = `${d.name.trim().toLocaleLowerCase('nl')}|${phoneDigits(d.phone) || d.email.toLowerCase()}`
    const saved = seen.has(key) ? null : saveContact(next, d, newId(), now)
    if (saved === null || typeof saved === 'string') {
      skipped++
      continue
    }
    seen.add(key)
    next = saved
    added++
  }
  return { state: next, added, skipped }
}
