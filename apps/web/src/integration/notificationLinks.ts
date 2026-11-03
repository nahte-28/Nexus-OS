import { refLink } from '@nexus/core'
import { openAppWhenReady } from '../shell/openApp'

/**
 * Integratie: a tapped notification opens the record it is about (the deadline in the Agenda, the
 * flow in Flow Studio) instead of only NEXUS. The service worker passes the notification's ref,
 * either as a message to an open window or as ?melding= on a new one.
 */
export function openFromRef(ref: string, enabled: () => boolean): boolean {
  if (!enabled()) return false
  const link = refLink(ref)
  if (!link) return false
  openAppWhenReady(link.app, link.id)
  return true
}

export function startNotificationLinks(enabled: () => boolean): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const ref = url.searchParams.get('melding')
  if (ref) {
    openFromRef(ref, enabled)
    url.searchParams.delete('melding')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type?: unknown; ref?: unknown } | null
    if (data?.type === 'nexus-open' && typeof data.ref === 'string') openFromRef(data.ref, enabled)
  })
}
