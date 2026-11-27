import { useEffect } from 'react'
import { SearchIcon } from '../apps/icons'

// Small on purpose: the taskbar needs only this; the search window itself loads when it opens.

/** Opens the search window on Ctrl+K / Cmd+K from anywhere. */
export function useSearchShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
}

export function SearchButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Zoeken (Ctrl+K)"
      title="Zoeken (Ctrl+K)"
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-md text-nx-muted hover:bg-nx-surface-2 hover:text-nx-text ${className}`}
    >
      <SearchIcon className="size-5" />
    </button>
  )
}
