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
}
