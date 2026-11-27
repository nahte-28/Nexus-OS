import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Werkbank Design System 2.0: colours come from the nx-* tokens so Focus and Pulse both work.
// The Agenda's calendar colours are picked by the user and may use the Tailwind palette.
// The dashboard follows once Dashboard 2.0 (#231) is merged, to keep the two PRs apart.
const ROOT = join(__dirname)
const ALLOWED = new Set(['apps/Agenda.tsx', 'profiles/Dashboard.tsx'])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return name.endsWith('.tsx') && !name.endsWith('.test.tsx') ? [path] : []
  })
}

describe('Werkbank design system', () => {
  it('uses status tokens instead of Tailwind palette colours', () => {
    const palette = /\b(?:bg|text|border|ring|fill|stroke)-(?:red|green|amber|yellow|emerald|rose|orange|lime|sky|blue)-\d{2,3}\b/g
    const offenders = files(ROOT)
      .map((f) => relative(ROOT, f))
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) => (readFileSync(join(ROOT, f), 'utf8').match(palette) ?? []).map((m) => `${f}: ${m}`))
    expect(offenders).toEqual([])
  })

  it('never animates every property', () => {
    const offenders = files(ROOT).filter((f) => readFileSync(f, 'utf8').includes('transition-all'))
    expect(offenders).toEqual([])
  })
})
