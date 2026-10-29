import { deadlineEvents, openDeadlines } from '@nexus/core'
import { isFeatureOn, onFeaturesChange } from '../features/store'
import { inboxStore } from '../inbox/store'
import { lifeStore } from '../life/store'
import { getUpdateState, subscribeUpdate } from '../platform/update'
import { eventBus } from './bus'

/** Puts what other parts of NEXUS report on the event bus (flow runs publish themselves). */
export function startEventSources(): void {
  const onUpdate = () => {
    const state = getUpdateState()
    if (state.status !== 'available') return
    eventBus.publish({
      id: `update:${state.update.version}`,
      source: 'update',
      type: 'update.available',
      at: Date.now(),
      title: `Versie ${state.update.version} van NEXUS is beschikbaar`,
      link: { app: 'settings' },
    })
  }
  onUpdate()
  subscribeUpdate(onUpdate)

  // Deadlines within a day, and ones that just passed; the id keeps each to one event.
  const checkDeadlines = () => {
    for (const e of deadlineEvents(openDeadlines(lifeStore.getSnapshot()), Date.now())) eventBus.publish(e)
  }
  void lifeStore.ready.then(checkDeadlines)
  lifeStore.subscribe(checkDeadlines)
  setInterval(checkDeadlines, 60_000)

  // InboxIngest: while the Universal Inbox is on, every event passes its policy into the Inbox.
  const toInbox = () => {
    if (isFeatureOn('inbox')) inboxStore.add(eventBus.getSnapshot())
  }
  toInbox()
  eventBus.subscribe(toInbox)
  onFeaturesChange(toInbox)
}
