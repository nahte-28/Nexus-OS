/** Which item an app should show once it opens, set by the search window. */
type Listener = () => void

let pending: { app: string; id: string } | null = null
const listeners = new Set<Listener>()

export function reveal(app: string, id: string) {
  pending = { app, id }
  listeners.forEach((l) => l())
}

/** The id waiting for [app], taken once; null when there is none. */
export function takeReveal(app: string): string | null {
  if (pending?.app !== app) return null
  const { id } = pending
  pending = null
  return id
}

export function onReveal(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
