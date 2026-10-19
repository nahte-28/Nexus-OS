import type { Reminder } from '@nexus/core'
import type { ConnectEngine, ConnectState } from '../connect/engine'
import { showLocalNotification } from '../platform/notify'

/** What a reminder does when it goes off: a notification here and, if chosen, on the phone. */
export function reminderDelivery(connect: ConnectEngine) {
  return async (reminder: Reminder): Promise<void> => {
    await showLocalNotification(reminder.title, reminder.text ?? 'Herinnering van NEXUS', reminder.id)
    if (reminder.target !== 'phone') return
    const state = await settled(connect)
    if (state.status !== 'ready') throw new Error('NEXUS Connect is niet verbonden, dus de gsm kreeg ze niet.')
    const phones = state.devices.filter((d) => d.platform === 'android' && !d.revokedAt)
    if (phones.length === 0) throw new Error('Geen gsm gekoppeld.')
    await Promise.all(phones.map((p) => connect.sendNotification(p.id, reminder.title, reminder.text)))
  }
}

/** Right after start NEXUS Connect is still signing in; give it a moment before giving up. */
function settled(connect: ConnectEngine, timeoutMs = 20_000): Promise<ConnectState> {
  return new Promise((resolve) => {
    const check = () => {
      const state = connect.getSnapshot()
      if (state.status === 'ready') finish(state)
    }
    const finish = (state: ConnectState) => {
      clearTimeout(timer)
      unsubscribe()
      resolve(state)
    }
    const timer = setTimeout(() => finish(connect.getSnapshot()), timeoutMs)
    const unsubscribe = connect.subscribe(check)
    check()
  })
}
