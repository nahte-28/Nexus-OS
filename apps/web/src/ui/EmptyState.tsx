import type { ReactNode } from 'react'
import { openApp } from '../shell/openApp'

/**
 * What an app shows when there is nothing yet, or when it needs something first: one line that
 * says what is going on, and if there is one, the action that moves you forward.
 */
export function EmptyState({
  title,
  children,
  action,
  className = '',
}: {
  title?: string
  children?: ReactNode
  action?: { label: string; onClick: () => void }
  className?: string
}) {
  return (
    <div className={`rounded-lg border border-dashed border-nx-border p-4 text-sm ${className}`}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={`text-nx-muted ${title ? 'mt-0.5' : ''}`}>{children}</div>}
      {action && (
        <button type="button" onClick={action.onClick} className="mt-3 rounded-md bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text">
          {action.label}
        </button>
      )}
    </div>
  )
}

/** For apps that only work with an account: says so, with a button to the Account app. */
export function NeedsAccount({ what, className = '' }: { what: string; className?: string }) {
  return (
    <EmptyState
      className={className}
      title={`${what} werkt met een account`}
      action={{ label: 'Naar Account', onClick: () => openApp('account') }}
    >
      Meld je aan in Account; daarna zie je hier alles terug, op elk toestel.
    </EmptyState>
  )
}
