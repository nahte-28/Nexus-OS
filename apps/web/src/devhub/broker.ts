import { checkCall, type ExtPermission } from '@nexus/core'
import { eventBus } from '../events/bus'
import { SDK_DATA } from './store'

export type CallResult = { ok: true; value: unknown } | { ok: false; error: string }

export interface CallLog {
  at: number
  method: string
  outcome: 'ok' | 'geweigerd' | 'onbekend' | 'fout'
  detail?: string
}

const NOTIFY_PER_MINUTE = 3
const ARGS_MAX = 2000

/**
 * The permission broker between a sandboxed widget and NEXUS. Every call is checked against what
 * you approved; the widget never touches a store, a token or the network itself.
 */
export function makeBroker(opts: { extId: string; name: string; granted: readonly ExtPermission[]; onLog?: (entry: CallLog) => void; now?: () => number }) {
  const now = opts.now ?? Date.now
  const sent: number[] = []
  let n = 0
  const log = (method: string, outcome: CallLog['outcome'], detail?: string) => opts.onLog?.({ at: now(), method, outcome, ...(detail ? { detail } : {}) })

  return function call(method: unknown, args: unknown): CallResult {
    const name = typeof method === 'string' ? method.slice(0, 80) : ''
    const check = checkCall(opts.granted, name)
    if (check === 'unknown') {
      log(name || '?', 'onbekend')
      return { ok: false, error: `Onbekende methode: ${name || '?'}` }
    }
    if (check === 'denied') {
      log(name, 'geweigerd', 'Geen permissie')
      return { ok: false, error: `Geen permissie voor ${name}` }
    }
    try {
      if (JSON.stringify(args ?? null).length > ARGS_MAX) throw new Error('Te veel gegevens meegegeven')
      let value: unknown
      if (name === 'notify') {
        const a = (typeof args === 'object' && args !== null ? args : {}) as { title?: unknown; body?: unknown }
        const title = typeof a.title === 'string' ? a.title.trim().slice(0, 80) : ''
        if (!title) throw new Error('Geef een title mee')
        const t = now()
        while (sent.length && t - sent[0] > 60_000) sent.shift()
        if (sent.length >= NOTIFY_PER_MINUTE) throw new Error(`Hoogstens ${NOTIFY_PER_MINUTE} meldingen per minuut`)
        sent.push(t)
        eventBus.publish({
          id: `extension:${opts.extId}:${t}:${++n}`,
          source: 'system',
          type: 'extension.notify',
          at: t,
          title: `${opts.name}: ${title}`,
          ...(typeof a.body === 'string' && a.body.trim() ? { body: a.body.trim().slice(0, 300) } : {}),
          priority: 'low',
          link: { app: 'devhub', id: opts.extId },
        })
        value = true
      } else {
        value = SDK_DATA[name as keyof typeof SDK_DATA]()
      }
      log(name, 'ok')
      return { ok: true, value }
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Fout'
      log(name, 'fout', detail)
      return { ok: false, error: detail }
    }
  }
}
