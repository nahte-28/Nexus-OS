import { isDesktopApp, notifyDesktop } from './desktop'
import { isFeatureOn } from '../features/store'
import { openFromRef } from '../integration/notificationLinks'

/** Shows a notification on this device right away, e.g. for a reminder. */
export async function showLocalNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (isDesktopApp) return notifyDesktop(title, body)
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  const options: NotificationOptions = { body, tag, icon: '/icon-192.png' }
  // Android Chrome only allows notifications through the service worker.
  const registration = await navigator.serviceWorker?.getRegistration()
  if (registration) await registration.showNotification(title, options)
  else {
    const shown = new Notification(title, options)
    shown.onclick = () => {
      window.focus()
      openFromRef(tag, () => isFeatureOn('integration'))
    }
  }
  return true
}
