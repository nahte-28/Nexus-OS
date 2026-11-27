import { parseNexusLink, type NexusLink } from '@nexus/core'
import { openCapture } from '../capture/open'
import { startFriend } from '../friends/link'
import { openAppWhenReady } from '../shell/openApp'
import { startJoin } from '../teams/joinLink'

/** Sent by the desktop app when a nexus:// link is opened while NEXUS runs (deeplink.rs). */
export const DEEP_LINK_EVENT = 'nexus-deep-link'

/** Does what a nexus:// link asks; false when the link is not one NEXUS knows. */
export function openNexusLink(raw: string): boolean {
  const link = parseNexusLink(raw)
  if (!link) return false
  follow(link)
  return true
}

function follow(link: NexusLink): void {
  switch (link.kind) {
    case 'capture':
      openCapture(link.text, link.dictate)
      return
    case 'app':
      openAppWhenReady(link.app, link.id)
      return
    case 'join':
      startJoin(link.code)
      return
    case 'friend':
      startFriend(link.code)
  }
}

/**
 * Windows/Linux app only: follows the nexus:// link NEXUS was started with, and every link
 * opened later (the running app gets those from the second launch).
 */
export async function startDeepLinks(): Promise<void> {
  const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')])
  await listen<string>(DEEP_LINK_EVENT, (event) => {
    if (typeof event.payload === 'string') openNexusLink(event.payload)
  })
  const first = await invoke<string | null>('deep_link_take').catch(() => null)
  if (first) openNexusLink(first)
}
