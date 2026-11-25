import { useRef, type KeyboardEvent, type ReactNode } from 'react'

/** One tab: a plain string is both its id and its label. */
export type TabItem<T extends string> = T | { id: T; label: ReactNode }

const idOf = <T extends string>(t: TabItem<T>): T => (typeof t === 'string' ? t : t.id)
const labelOf = <T extends string>(t: TabItem<T>): ReactNode => (typeof t === 'string' ? t : t.label)

/**
 * The tab bar every NEXUS app uses: a strip under the title bar (variant "bar") or a row inside
 * the content (variant "inline"). The active tab gets the copper trace. Arrow keys, Home and End
 * move between tabs (WAI-ARIA tabs pattern, automatic activation); only the active tab is in the
 * Tab order.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  variant = 'bar',
  className = '',
}: {
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** What the tabs switch between, for screen readers (e.g. the app's name). */
  label: string
  variant?: 'bar' | 'inline'
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const ids = tabs.map(idOf)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ids.indexOf(value)
    const next =
      e.key === 'ArrowRight' ? (i + 1) % ids.length
      : e.key === 'ArrowLeft' ? (i - 1 + ids.length) % ids.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? ids.length - 1
      : -1
    if (next < 0) return
    e.preventDefault()
    onChange(ids[next])
    refs.current[next]?.focus()
  }
  const strip = variant === 'bar' ? 'shrink-0 overflow-x-auto border-b border-nx-border px-3 py-2' : 'flex-wrap'
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={`flex gap-1 ${strip} ${className}`}>
      {tabs.map((t, i) => {
        const id = idOf(t)
        const on = id === value
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-trace="bottom"
            data-on={on}
            onClick={() => onChange(id)}
            className={`shrink-0 rounded-md px-3 py-1 text-sm ${on ? 'bg-nx-surface-2 font-medium text-nx-text' : 'text-nx-muted hover:bg-nx-surface-2 hover:text-nx-text'}`}
          >
            {labelOf(t)}
          </button>
        )
      })}
    </div>
  )
}
