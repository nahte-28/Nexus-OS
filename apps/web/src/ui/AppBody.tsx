import type { ReactNode } from 'react'

const WIDTH = { form: 'max-w-3xl', wide: 'max-w-6xl', full: '' } as const

/**
 * The scrolling content area of an app window. Keeps forms and text at a readable width when a
 * window is maximised on a wide screen ("form" ~ 768px, "wide" ~ 1152px), with the same padding
 * everywhere.
 */
export function AppBody({ width = 'form', className = '', children }: { width?: keyof typeof WIDTH; className?: string; children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto w-full p-4 text-sm ${WIDTH[width]} ${className}`}>{children}</div>
    </div>
  )
}
