import { useState } from 'react'
import { calculate } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

const KEY = 'nexus.calculator'
const MAX_HISTORY = 20
const key = 'rounded-lg border border-nx-border py-3 text-lg hover:bg-nx-surface-2'

interface Line {
  input: string
  result: string
}

function readHistory(): Line[] {
  try {
    const list = JSON.parse(readStorage(KEY) ?? '[]') as unknown
    return Array.isArray(list)
      ? list.filter((l): l is Line => typeof l?.input === 'string' && typeof l?.result === 'string').slice(0, MAX_HISTORY)
      : []
  } catch {
    return []
  }
}

const KEYS = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '%', '0', ',', '=']

/** Rekenmachine: type or tap a sum; Enter or = works it out. History stays on this device. */
export function Calculator() {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [history, setHistory] = useState<Line[]>(readHistory)
  const result = input ? calculate(input) : null
  const equals = () => {
    if (!input.trim()) return
    const r = calculate(input)
    if (!r.ok) return setError(r.error)
    setError('')
    const next = [{ input, result: r.text }, ...history].slice(0, MAX_HISTORY)
    setHistory(next)
    writeStorage(KEY, JSON.stringify(next))
    setInput(r.text)
  }
  const press = (k: string) => {
    setError('')
    if (k === 'C') return setInput('')
    if (k === '=') return equals()
    setInput((s) => s + k)
  }
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
      <form onSubmit={(e) => { e.preventDefault(); equals() }} className="space-y-1">
        <input
          className="w-full rounded-lg border border-nx-border bg-nx-surface px-3 py-2 text-right text-2xl tabular-nums outline-none"
          value={input}
          maxLength={200}
          inputMode="decimal"
          aria-label="Berekening"
          placeholder="0"
          onChange={(e) => { setInput(e.target.value); setError('') }}
          onKeyDown={(e) => { if (e.key === 'Escape') setInput('') }}
        />
        <p className="min-h-5 text-right text-nx-muted" aria-live="polite">
          {error ? <span role="alert">{error}</span> : result?.ok && result.text !== input ? `= ${result.text}` : ''}
        </p>
      </form>
      <div className="grid grid-cols-4 gap-2">
        {KEYS.map((k) => (
          <button key={k} type="button" className={`${key} ${k === '=' ? 'bg-nx-accent font-medium text-nx-accent-text hover:bg-nx-accent' : ''}`} onClick={() => press(k)} aria-label={k === 'C' ? 'Wissen' : k === '=' ? 'Is gelijk aan' : undefined}>
            {k}
          </button>
        ))}
        <button type="button" className={`${key} col-span-4 text-sm`} onClick={() => setInput((s) => s.slice(0, -1))} aria-label="Laatste teken wissen">⌫</button>
      </div>
      {history.length > 0 && (
        <section className="space-y-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Geschiedenis</h3>
            <button type="button" className="text-xs underline" onClick={() => { setHistory([]); writeStorage(KEY, '[]') }}>Wissen</button>
          </div>
          <ul className="space-y-0.5">
            {history.map((l, i) => (
              <li key={i}>
                <button type="button" className="w-full rounded px-2 py-1 text-right tabular-nums hover:bg-nx-surface-2" onClick={() => setInput(l.result)}>
                  <span className="text-nx-muted">{l.input} =</span> <span className="font-medium">{l.result}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
