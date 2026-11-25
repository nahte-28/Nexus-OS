import { friendCodeFromPath, friendLink } from '@nexus/core'
import { setFeature } from '../features/store'
import { apiBase, isDesktopApp } from '../platform/desktop'
import { openApp } from '../shell/openApp'
import { readStorage, writeStorage } from '../state/storage'

/**
 * Friend links, on their own so the first screen (main.tsx) can handle /vriend/<code> without
 * loading the Vrienden and Teams code.
 */
const PENDING_KEY = 'nexus.friends.add'

/** Where your friend link points: the live NEXUS, also from the Windows app. */
export function myFriendLink(code: string): string {
  return friendLink(isDesktopApp ? apiBase : window.location.origin, code)
}

export const pendingFriend = (): string | null => readStorage(PENDING_KEY) || null
export const clearPendingFriend = (): void => {
  writeStorage(PENDING_KEY, '')
}

/** NEXUS was opened with a friend link (/vriend/ABCD-EFGH): keeps the code and opens Vrienden. */
export function openFriendFromUrl(location: Pick<Location, 'pathname' | 'hash'> = window.location): boolean {
  const code = friendCodeFromPath(location.pathname)
  if (!code) return false
  writeStorage(PENDING_KEY, code)
  setFeature('friends', true)
  history.replaceState(history.state, '', `/${location.hash}`)
  let tries = 40
  const open = () => {
    if (!openApp('friends') && --tries > 0) setTimeout(open, 250)
  }
  open()
  return true
}
