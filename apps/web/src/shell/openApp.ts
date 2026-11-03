import type { AppId } from '@nexus/core'
import { reveal } from '../search/reveal'

/**
 * Deep links: lets an app (the Inbox, Spaces, ...) open another app, through whichever shell is
 * showing, desktop or phone. The shell registers how it opens apps.
 */
let opener: ((app: AppId) => void) | null = null
/** A link that came in before a shell was showing (a tapped notification at startup). */
let waiting: { app: AppId; id?: string } | null = null

export function setAppOpener(open: ((app: AppId) => void) | null): void {
  opener = open
  if (open && waiting) {
    const { app, id } = waiting
    waiting = null
    openApp(app, id)
  }
}

/** Opens [app], and with [id] asks it to show that item (as search does). */
export function openApp(app: AppId, id?: string): boolean {
  if (!opener) return false
  if (id) reveal(app, id)
  opener(app)
  return true
}

/** Like [openApp], but keeps the link until a shell can open it. */
export function openAppWhenReady(app: AppId, id?: string): void {
  if (!openApp(app, id)) waiting = { app, id }
}
