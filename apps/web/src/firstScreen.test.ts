import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Supabase library (about 55 kB gzip) loads after the first screen, through loadSupabase in
 * sync/config.ts. No module that main.tsx imports directly, however deep, may import it itself.
 */
describe('first screen', () => {
  it('does not import the Supabase library before NEXUS is on screen', () => {
    const src = resolve(__dirname)
    const find = (from: string, spec: string) => {
      if (!spec.startsWith('.')) return null
      const base = resolve(dirname(from), spec)
      for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
        if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext
      }
      return null
    }
    const via = new Map<string, string | null>([[resolve(src, 'main.tsx'), null]])
    const queue = [...via.keys()]
    const offenders: string[] = []
    while (queue.length > 0) {
      const file = queue.shift()!
      // Static imports and re-exports, not `import type` and not import().
      for (const m of readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
        if (m[1] === '@supabase/supabase-js') {
          const chain = [file]
          while (via.get(chain[0])) chain.unshift(via.get(chain[0])!)
          offenders.push(chain.map((f) => relative(src, f)).join(' > '))
        }
        const next = find(file, m[1])
        if (next && !via.has(next)) {
          via.set(next, file)
          queue.push(next)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
