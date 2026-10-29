import { useEffect, useMemo, useRef } from 'react'
import type { ExtPermission } from '@nexus/core'
import { capabilities } from '../platform/capabilities'
import { makeBroker, type CallLog } from './broker'

/**
 * The page a widget runs in. The frame is sandboxed without same-origin, so it has its own empty
 * origin: no NEXUS storage, cookies, session or DOM. Its content policy also blocks the network,
 * other scripts and frames; the only way out is nexus.call, which the broker answers.
 */
export const SANDBOX_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:"

const SDK_SHIM = `(() => {
  let n = 0
  const wait = new Map()
  addEventListener('message', (e) => {
    if (e.source !== parent) return
    const m = e.data
    if (!m || m.nexus !== 'reply' || !wait.has(m.id)) return
    const w = wait.get(m.id)
    wait.delete(m.id)
    m.ok ? w.resolve(m.value) : w.reject(new Error(m.error))
  })
  const send = parent.postMessage.bind(parent)
  const call = (method, args) => new Promise((resolve, reject) => {
    const id = ++n
    wait.set(id, { resolve, reject })
    send({ nexus: 'call', id, method: String(method), args: args === undefined ? null : JSON.parse(JSON.stringify(args)) }, '*')
  })
  const fail = (message) => send({ nexus: 'error', message: String(message).slice(0, 300) }, '*')
  Object.defineProperty(window, 'nexus', { value: Object.freeze({ call }) })
  Object.defineProperty(window, '__nexusFail', { value: fail })
  addEventListener('error', (e) => fail(e.message))
  addEventListener('unhandledrejection', (e) => fail(e.reason && e.reason.message || e.reason))
})()`

const escapeScript = (code: string) => code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')

function themeCss(): string {
  if (typeof document === 'undefined') return ''
  const s = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim().replace(/[^#\w\s(),.%/-]/g, '') || fallback
  // The same color scheme as NEXUS, or the browser paints the frame with an opaque background.
  const scheme = s.colorScheme && /^[a-z ]+$/.test(s.colorScheme) ? s.colorScheme : 'normal'
  return `:root{color-scheme:${scheme};--nx-text:${v('--nx-text', '#17202c')};--nx-muted:${v('--nx-muted', '#5b6676')};--nx-accent:${v('--nx-accent', '#2f5bd3')}}`
}

export function buildSrcdoc(code: string, css = themeCss()): string {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_POLICY}">
<style>${css}body{margin:0;padding:12px;font:14px/1.4 system-ui,sans-serif;color:var(--nx-text);background:transparent}p{margin:0 0 4px}.muted{color:var(--nx-muted)}.big{font-size:32px;font-weight:600;color:var(--nx-accent)}ul{margin:0;padding-left:18px}</style>
<script>${SDK_SHIM}</script></head><body><script>(async () => { try {
${escapeScript(code)}
} catch (e) { __nexusFail(e && e.message || e) } })()</script></body></html>`
}

export function SandboxFrame({
  extId,
  name,
  code,
  granted,
  onLog,
  title,
  height = 180,
  framed = true,
}: {
  extId: string
  name: string
  code: string
  granted: readonly ExtPermission[]
  onLog?: (entry: CallLog) => void
  title: string
  height?: number
  framed?: boolean
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const log = useRef(onLog)
  log.current = onLog
  // Rebuilt when the profile's theme changes, so the widget follows its colors.
  const theme = typeof document === 'undefined' ? '' : (document.documentElement.dataset.theme ?? '')
  const srcdoc = useMemo(() => buildSrcdoc(code), [code, theme])
  const grantedKey = granted.join(',')

  useEffect(() => {
    const call = makeBroker({ extId, name, granted: grantedKey ? (grantedKey.split(',') as ExtPermission[]) : [], onLog: (e) => log.current?.(e) })
    const onMessage = (e: MessageEvent) => {
      const win = frame.current?.contentWindow
      // Only this widget's own frame; with an opaque origin, the source is what identifies it.
      if (!win || e.source !== win) return
      const m = e.data as { nexus?: unknown; id?: unknown; method?: unknown; args?: unknown; message?: unknown }
      if (m?.nexus === 'error') {
        log.current?.({ at: Date.now(), method: 'script', outcome: 'fout', detail: String(m.message ?? '').slice(0, 300) })
        return
      }
      if (m?.nexus !== 'call' || typeof m.id !== 'number') return
      const result = call(m.method, m.args)
      win.postMessage({ nexus: 'reply', id: m.id, ...result }, '*')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [extId, name, grantedKey, srcdoc])

  if (!capabilities.sandbox) {
    return <p className="text-sm text-nx-muted">Eigen widgets draaien niet in de Windows-app. Open NEXUS in de browser om ze te zien.</p>
  }
  return <iframe ref={frame} title={title} sandbox="allow-scripts" srcDoc={srcdoc} referrerPolicy="no-referrer" className={`w-full bg-transparent ${framed ? 'rounded-lg border border-nx-border' : ''}`} style={{ height }} />
}
