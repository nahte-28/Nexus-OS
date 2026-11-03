import { useSyncExternalStore } from 'react'
import { installMarketWidget, markInstalled, markRemoved, parseMarket, removeMarketWidget, saveTemplate, type FlowDefinition, type MarketItem, type MarketState, FLOW_TEMPLATES } from '@nexus/core'
import { capturesStore } from '../capture/hub'
import { devHubStore } from '../devhub/store'
import { logEvent } from '../devtools/log'
import { flowsStore, setFlowStudioEnabled } from '../flows/store'
import { profilesStore } from '../profiles/store'
import { readStorage, writeStorage } from '../state/storage'

const KEY = 'nexus.marketplace'

/** What you added from the Marketplace, on this device. */
export class MarketStore {
  private state: MarketState
  private listeners = new Set<() => void>()

  constructor(private persist = true) {
    let raw: unknown = null
    try {
      raw = persist ? JSON.parse(readStorage(KEY) ?? 'null') : null
    } catch {
      raw = null
    }
    this.state = parseMarket(raw)
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getSnapshot = (): MarketState => this.state

  update(change: (s: MarketState) => MarketState): void {
    this.state = change(this.state)
    if (this.persist) writeStorage(KEY, JSON.stringify(this.state))
    this.listeners.forEach((l) => l())
  }
}

export const marketStore = new MarketStore(typeof window !== 'undefined')
export const useMarket = () => useSyncExternalStore(marketStore.subscribe, marketStore.getSnapshot)

/** Adds [item]. A widget only after you saw its permissions; a theme is applied to the active profile. */
export function addMarketItem(item: MarketItem, now = Date.now(), store = marketStore): string {
  switch (item.kind) {
    case 'widget':
      devHubStore.update((s) => installMarketWidget(s, item, now))
      store.update((s) => markInstalled(s, item, now))
      logEvent('system', `Marketplace: widget ${item.title} geïnstalleerd`)
      return `${item.title} staat op je dashboard.`
    case 'theme': {
      const { active } = profilesStore.getSnapshot()
      profilesStore.updateProfile(active.id, { theme: item.theme, accent: item.accent })
      return `${item.title} geldt nu voor je profiel ${active.name}.`
    }
    case 'flow': {
      const template = FLOW_TEMPLATES.find((t) => t.id === item.template)
      if (!template) throw new Error('Dit recept bestaat niet meer.')
      const flow: FlowDefinition = { id: crypto.randomUUID(), name: template.flow.name, enabled: false, version: 0, trigger: structuredClone(template.flow.trigger), conditions: structuredClone(template.flow.conditions), actions: structuredClone(template.flow.actions), timeZone: '', createdAt: now, updatedAt: now }
      setFlowStudioEnabled(true)
      flowsStore.save(flow, now)
      store.update((s) => markInstalled(s, item, now))
      return `"${template.flow.name}" staat in Flow Studio, nog uit. Kijk hem na en zet hem aan.`
    }
    case 'capture': {
      let problem: string | null = null
      capturesStore.update((s) => {
        const next = saveTemplate(s, { id: `market-${item.id}`, ...item.template }, now)
        if ('error' in next) {
          problem = next.error
          return s
        }
        return next
      })
      if (problem) throw new Error(problem)
      store.update((s) => markInstalled(s, item, now))
      return `Het sjabloon "${item.template.name}" staat in Snel vastleggen.`
    }
  }
}

/** Removes a widget from the dashboard and the Developer Hub. */
export function removeMarketItem(item: MarketItem, store = marketStore): void {
  if (item.kind === 'widget') devHubStore.update((s) => removeMarketWidget(s, item))
  store.update((s) => markRemoved(s, item.id))
}
