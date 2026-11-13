/**
 * Vrienden: people add each other with a personal code or link (/vriend/ABCD-EFGH). Adding sends a
 * request the other person accepts. Pure logic: codes, links and sorting the list.
 */

export const FRIEND_NAME_MAX = 40

export type FriendKind = 'friend' | 'incoming' | 'outgoing'

export interface FriendEntry {
  userId: string
  displayName: string
  kind: FriendKind
  since: number
}

/** A friend code without dashes or spaces, in capitals; null when it is not one. */
export function normalizeFriendCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, '')
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : null
}

export const formatFriendCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

/** Your code as a link: opening it starts NEXUS in Vrienden with the code filled in. */
export function friendLink(base: string, code: string): string {
  return `${base.replace(/\/+$/, '')}/vriend/${formatFriendCode(code)}`
}

/** The code in a /vriend/<code> address, formatted; null for any other address. */
export function friendCodeFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/vriend\/([A-Za-z0-9-]{8,9})\/?$/)
  const code = m ? normalizeFriendCode(m[1]) : null
  return code ? formatFriendCode(code) : null
}

/** Requests to answer first, then friends by name, then what you sent. */
export function sortFriends(list: FriendEntry[]): FriendEntry[] {
  const order: Record<FriendKind, number> = { incoming: 0, friend: 1, outgoing: 2 }
  return [...list].sort((a, b) => order[a.kind] - order[b.kind] || a.displayName.localeCompare(b.displayName, 'nl'))
}

/** What adding someone did, in words. */
export function requestResult(status: 'pending' | 'accepted' | 'already', name: string): string {
  if (status === 'accepted') return `Jij en ${name} zijn nu vrienden.`
  if (status === 'already') return `${name} is al je vriend.`
  return `Verzoek gestuurd naar ${name}. Zodra die aanvaardt, zijn jullie vrienden.`
}
