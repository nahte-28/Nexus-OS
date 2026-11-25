import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Supabase library (about 55 kB gzip) loads after the first screen, through loadSupabase in
 * sync/config.ts. No module that main.tsx imports directly, however deep, may import it itself.
 */
const src = resolve(__dirname)

/** Every module main.tsx loads statically, with the import that brought it in. */
function firstScreenModules(): { via: Map<string, string | null>; imports: Map<string, string[]> } {
  const find = (from: string, spec: string) => {
    if (!spec.startsWith('.')) return null
    const base = resolve(dirname(from), spec)
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
      if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext
    }
    return null
  }
  const via = new Map<string, string | null>([[resolve(src, 'main.tsx'), null]])
  const imports = new Map<string, string[]>()
  const queue = [...via.keys()]
  while (queue.length > 0) {
    const file = queue.shift()!
    const specs: string[] = []
    // Static imports and re-exports, not `import type` and not import().
    for (const m of readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
      specs.push(m[1])
      const next = find(file, m[1])
      if (next && !via.has(next)) {
        via.set(next, file)
        queue.push(next)
      }
    }
    imports.set(file, specs)
  }
  return { via, imports }
}

const chainOf = (via: Map<string, string | null>, file: string) => {
  const chain = [file]
  while (via.get(chain[0])) chain.unshift(via.get(chain[0])!)
  return chain.map((f) => relative(src, f)).join(' > ')
}

describe('first screen', () => {
  it('does not load the code of Teams, Vrienden or Darts before NEXUS is on screen', () => {
    const { via } = firstScreenModules()
    const heavy = ['teams/teams.ts', 'friends/friends.ts', 'darts/store.ts', 'darts/onlineApi.ts', 'admin/admin.ts']
    const offenders = [...via.keys()].filter((f) => heavy.includes(relative(src, f))).map((f) => chainOf(via, f))
    expect(offenders).toEqual([])
  })

  it('does not import the Supabase library before NEXUS is on screen', () => {
    const { via, imports } = firstScreenModules()
    const offenders = [...imports].filter(([, specs]) => specs.includes('@supabase/supabase-js')).map(([file]) => chainOf(via, file))
    expect(offenders).toEqual([])
  })
})
