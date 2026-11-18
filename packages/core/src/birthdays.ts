/**
 * NEXUS Verjaardagen: your friends' birthdays (day and month, never the year) and messages from
 * NEXUS itself. The database sends "Gelukkige verjaardag" on the day
 * (supabase/migrations/20261118090000_birthdays.sql); this works out what to show.
 */

/** MM-DD from YYYY-MM-DD (Over jou), or null. */
export function birthdayMonthDay(birthday: string): string | null {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(birthday)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${m[1]}-${m[2]}`
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** The next day (local midnight) that [monthDay] falls on, today included; 29 Feb is 28 Feb in other years. */
export function nextFriendBirthday(monthDay: string, now: Date): Date {
  const [month, day] = monthDay.split('-').map(Number)
  const at = (year: number) => new Date(year, month - 1, month === 2 && day === 29 && !isLeap(year) ? 28 : day)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisYear = at(now.getFullYear())
  return thisYear >= today ? thisYear : at(now.getFullYear() + 1)
}

/** Whole days until the next birthday: 0 is today. */
export function daysUntilBirthday(monthDay: string, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((nextFriendBirthday(monthDay, now).getTime() - today.getTime()) / 86_400_000)
}

export interface FriendBirthdayRow {
  name: string
  monthDay: string
  user?: string
}

export interface UpcomingFriendBirthday extends FriendBirthdayRow {
  days: number
}

/** Sorted by how soon, within [withinDays] (today is 0). */
export function upcomingFriendBirthdays<T extends FriendBirthdayRow>(rows: T[], now: Date, withinDays = 366): Array<T & { days: number }> {
  return rows
    .filter((r) => /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(r.monthDay))
    .map((r) => ({ ...r, days: daysUntilBirthday(r.monthDay, now) }))
    .filter((r) => r.days <= withinDays)
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, 'nl'))
}

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/** "14 maart". */
export function birthdayDate(monthDay: string): string {
  const [month, day] = monthDay.split('-').map(Number)
  return `${day} ${MONTHS[month - 1] ?? ''}`.trim()
}

/** "Vandaag jarig", "Morgen", "Over 5 dagen" or "14 maart". */
export function birthdayWhen(days: number, monthDay: string): string {
  if (days === 0) return 'Vandaag jarig 🎂'
  if (days === 1) return 'Morgen jarig'
  if (days <= 14) return `Over ${days} dagen (${birthdayDate(monthDay)})`
  return birthdayDate(monthDay)
}

/** A message from NEXUS itself, as Berichten shows it. */
export interface SystemMessage {
  id: string
  kind: 'birthday' | 'friend_birthday'
  title: string
  body: string
  /** The friend a friend_birthday is about. */
  aboutUser: string | null
  createdAt: number
  readAt: number | null
}

/** Unread first, then newest first. */
export const sortSystemMessages = (list: SystemMessage[]): SystemMessage[] => [...list].sort((a, b) => Number(a.readAt !== null) - Number(b.readAt !== null) || b.createdAt - a.createdAt)
