import type { AppId } from '@nexus/core'
import { reveal } from '../search/reveal'

/**
 * Deep links: lets an app (the Inbox, Spaces, ...) open another app, through whichever shell is
 * showing, desktop or phone. The shell registers how it opens apps.
 */
let opener: ((app: AppId) => void) | null = null

export function setAppOpener(open: ((app: AppId) => void) | null): void {
  opener = open
}

/** Opens [app], and with [id] asks it to show that item (as search does). */
export function openApp(app: AppId, id?: string): boolean {
  if (!opener) return false
  if (id) reveal(app, id)
  opener(app)
  return true
}
