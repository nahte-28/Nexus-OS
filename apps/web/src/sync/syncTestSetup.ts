// The two-device sync test runs in Node, not jsdom: supabase-js realtime then uses Node's own
// WebSocket, which refuses jsdom's Event class. The sync code only needs these few browser bits.
const memory = new Map<string, string>()
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, String(value)),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (i: number) => [...memory.keys()][i] ?? null,
  get length() {
    return memory.size
  },
}
const page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true })
