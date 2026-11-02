import { joinCodeFromPath, teamJoinLink } from '@nexus/core'
import { setFeature } from '../features/store'
import { apiBase, isDesktopApp } from '../platform/desktop'
import { openApp } from '../shell/openApp'
import { readStorage, writeStorage } from '../state/storage'

const PENDING_KEY = 'nexus.teams.join'

/** Where an invitation link points: the live NEXUS, also from the Windows app. */
export function joinLink(code: string): string {
  return teamJoinLink(isDesktopApp ? apiBase : window.location.origin, code)
}

/** The code of an invitation link that was opened and not used yet. */
export function pendingJoin(): string | null {
  return readStorage(PENDING_KEY) || null
}

export function clearPendingJoin(): void {
  writeStorage(PENDING_KEY, '')
}

/**
 * NEXUS was opened with an invitation link (/join/ABCDE-FGH23): keeps the code until it is used
 * (also through signing in first), turns Teams on and opens it. The address goes back to /.
 */
export function openJoinFromUrl(location: Pick<Location, 'pathname' | 'hash'> = window.location): boolean {
  const code = joinCodeFromPath(location.pathname)
  if (!code) return false
  writeStorage(PENDING_KEY, code)
  setFeature('teams', true)
  history.replaceState(history.state, '', `/${location.hash}`)
  // The shell registers how it opens apps once it is drawn.
  let tries = 40
  const open = () => {
    if (!openApp('teams') && --tries > 0) setTimeout(open, 250)
  }
  open()
  return true
}
