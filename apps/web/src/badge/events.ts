export const UNREAD_EVENT = 'nexus:unread-changed'

/** Something read or received a message: the badge on the NEXUS icon counts again shortly after. */
export function unreadChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UNREAD_EVENT))
}
