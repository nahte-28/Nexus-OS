import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Windows (the NEXUS app build) does not tell 'invites.ts' from 'Invites.tsx': an import of
 * './Invites' then finds the wrong file and the build breaks. No two modules in one folder may
 * differ only in capitals.
 */
describe('file names', () => {
  it('has no two modules in a folder that differ only in capitals', () => {
    const clashes: string[] = []
    const walk = (dir: string) => {
      const seen = new Map<string, string>()
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
          walk(path)
          continue
        }
        const base = name.replace(/(\.test)?\.[^.]+$/, '')
        const key = base.toLowerCase()
        const other = seen.get(key)
        if (other !== undefined && other !== base) clashes.push(`${dir}: ${other} / ${base}`)
        seen.set(key, base)
      }
    }
    walk(join(__dirname))
    expect(clashes).toEqual([])
  })
})
